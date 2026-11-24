import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Mesmo lock de catálogo em TODOS os escritores: cobre identidades ainda inexistentes,
// vinculação entre integrações e avaliação de alertas. Versão inicial favorece correção;
// nenhuma chamada de plataforma acontece enquanto esse lock está adquirido.
export async function catalogTransaction<T>(
  prisma: PrismaService,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(7419260301::bigint)::text`;
          return work(tx);
        },
        { maxWait: 10000, timeout: 15000 },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003')
          throw new BadRequestException('Referência inexistente ou alterada durante a operação');
        if (error.code === 'P2025') throw new NotFoundException('Registro não encontrado');
        if (error.code === 'P2034' && attempt < 2) continue;
        if (['P2002', 'P2004', 'P2034'].includes(error.code))
          throw new ConflictException('Conflito no catálogo. Recarregue os dados antes de tentar novamente.');
      }
      throw error;
    }
  }
  throw new ConflictException('Conflito no catálogo');
}

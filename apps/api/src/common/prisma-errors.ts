import { Prisma } from '@prisma/client';
import { ConflictException, NotFoundException } from '@nestjs/common';

// P2002 = violação de @unique (ex: CPNJ ou e-mail repetido)
export function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';
}

export function relancarErroDeReferencia(erro: unknown): never {
  if (erro instanceof Prisma.PrismaClientKnownRequestError) {
    if (erro.code === 'P2003')
      throw new ConflictException('Vínculos alterados durante a operação. Recarregue os dados.');
    if (erro.code === 'P2025') throw new NotFoundException('Registro não encontrado');
  }
  throw erro;
}

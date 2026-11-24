import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { contextoDaRequisicao } from './request-context';

export async function definirContextoDeAuditoria(tx: Prisma.TransactionClient) {
  const contexto = contextoDaRequisicao.getStore();
  if (!contexto) return;
  await tx.$queryRaw`SELECT set_config('solarsystem.actor_id', ${contexto.actorId ?? ''}, true),
    set_config('solarsystem.request_id', ${contexto.requestId}, true)`;
}

export function transacaoComAuditoria<T>(
  prisma: PrismaService,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    await definirContextoDeAuditoria(tx);
    return work(tx);
  });
}

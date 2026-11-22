import { Prisma } from '@prisma/client';

// P2002 = violação de @unique (ex: CPNJ ou e-mail repetido)
export function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';
}

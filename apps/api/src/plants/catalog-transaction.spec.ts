import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { catalogTransaction } from './catalog-transaction';

describe('Conflitos de integridade do catálogo', () => {
  it('converte violação de constraint em 409 sem repetir uma escrita inválida', async () => {
    const transaction = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Constraint violation', {
        code: 'P2004',
        clientVersion: '6.19.3',
      }),
    );
    const prisma = { $transaction: transaction } as unknown as PrismaService;
    await expect(catalogTransaction(prisma, jest.fn())).rejects.toBeInstanceOf(ConflictException);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

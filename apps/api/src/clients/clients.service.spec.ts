import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClientsService } from './clients.service';
import { atualizarClienteSchema, criarClienteSchema } from './clients.schemas';

describe('Clientes: integridade e preservação dos vínculos', () => {
  const db = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    client: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    user: { count: jest.fn() },
    plant: { count: jest.fn() },
  };
  const service = new ClientsService(db as unknown as PrismaService);
  const client = { id: 'u', nome: 'Cliente', email: 'u@example.test', role: Role.CLIENT, clientId: 'c' };
  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((work: Promise<unknown>[] | ((tx: typeof db) => Promise<unknown>)) =>
      typeof work === 'function' ? work(db) : Promise.all(work),
    );
    db.$queryRaw.mockResolvedValue([{ id: 'c' }]);
    db.user.count.mockResolvedValue(0);
    db.plant.count.mockResolvedValue(0);
    db.client.findUnique.mockResolvedValue({ id: 'c' });
  });
  it.each([
    [1, 0],
    [0, 1],
    [1, 1],
  ])('recusa exclusão com usuários=%i, usinas=%i', async (users, plants) => {
    db.user.count.mockResolvedValue(users);
    db.plant.count.mockResolvedValue(plants);
    await expect(service.remover('c')).rejects.toBeInstanceOf(ConflictException);
    expect(db.client.delete).not.toHaveBeenCalled();
  });
  it('remove apenas cliente sem vínculos, sob lock de linha', async () => {
    await service.remover('c');
    expect(db.client.delete).toHaveBeenCalledWith({ where: { id: 'c' } });
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.user.count.mock.invocationCallOrder[0]);
  });
  it('cliente removido por concorrente retorna 404', async () => {
    db.$queryRaw.mockResolvedValue([]);
    await expect(service.remover('c')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.client.delete).not.toHaveBeenCalled();
  });
  it('converte duplicidade e referência concorrente em conflito sem esconder erros inesperados', async () => {
    for (const code of ['P2002', 'P2003']) {
      db.client.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('fixture', { code, clientVersion: '6' }),
      );
      await expect(service.criar({ name: 'Cliente' })).rejects.toBeInstanceOf(ConflictException);
    }
    const unexpected = new Error('fixture');
    db.client.create.mockRejectedValue(unexpected);
    await expect(service.criar({ name: 'Cliente' })).rejects.toBe(unexpected);
  });
  it('CLIENT não vê terceiros e CLIENT sem vínculo não consulta a lista', async () => {
    await expect(service.buscarPorId('other', client)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.client.findUnique).not.toHaveBeenCalled();
    await expect(
      service.listar({ pagina: 1, porPagina: 20 }, { ...client, clientId: null }),
    ).resolves.toMatchObject({ itens: [], total: 0 });
    expect(db.client.findMany).not.toHaveBeenCalled();
  });
  it('permite limpar campos opcionais explicitamente e recusa PATCH vazio', () => {
    expect(atualizarClienteSchema.parse({ email: null, phone: null, document: null })).toEqual({
      email: null,
      phone: null,
      document: null,
    });
    expect(atualizarClienteSchema.safeParse({}).success).toBe(false);
    expect(criarClienteSchema.safeParse({ name: 'Cliente', document: 'invalido' }).success).toBe(false);
  });
});

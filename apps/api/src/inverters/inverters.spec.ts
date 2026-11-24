import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma, Role } from '@prisma/client';
import { RolesGuard } from '../auth/roles.guard';
import { UsuarioAutenticado } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { InvertersController } from './inverters.controller';
const partial = (value: Record<string, unknown>): unknown => expect.objectContaining(value);
import { InvertersService } from './inverters.service';
import { criarInversorSchema, editarInversorSchema, removerInversorSchema } from './inverters.schemas';

const admin: UsuarioAutenticado = {
  id: 'admin',
  nome: 'Admin',
  email: 'admin@example.test',
  role: 'ADMIN',
  clientId: null,
};
const operator = { ...admin, role: Role.OPERATOR };
const client = { ...admin, role: Role.CLIENT, clientId: 'client' };
const input = criarInversorSchema.parse({
  manufacturer: ' Fabricante ',
  model: 'Modelo',
  serialNumber: 'abc-001',
});
const removal = { revision: 2, confirmSerialNumber: 'abc-001', reason: 'Equipamento substituído' };

describe('Inversores: cadastro, alterações e isolamento', () => {
  const mock = {
    $queryRaw: jest.fn(),
    plant: { findFirst: jest.fn() },
    inverter: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const service = new InvertersService(mock as unknown as PrismaService);
  beforeEach(() => {
    jest.resetAllMocks();
    mock.$transaction.mockImplementation((work: (tx: unknown) => unknown) => work(mock));
    mock.plant.findFirst.mockResolvedValue({ id: 'plant' });
    mock.inverter.findFirst.mockResolvedValue({
      id: 'inverter',
      origin: 'MANUAL',
      revision: 2,
      serialKey: 'ABC-001',
    });
  });

  it('cadastra manual com identidade normalizada, preservando série exibida', async () => {
    await service.criar('plant', input, operator);
    expect(mock.inverter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: partial({
          plantId: 'plant',
          origin: 'MANUAL',
          manufacturer: 'Fabricante',
          manufacturerKey: 'FABRICANTE',
          serialNumber: 'abc-001',
          serialKey: 'ABC-001',
          status: 'UNKNOWN',
        }),
      }),
    );
  });
  it('duplicidade é conflito HTTP 409, sem depender de consulta prévia sujeita a corrida', async () => {
    mock.inverter.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }),
    );
    await expect(service.criar('plant', input, admin)).rejects.toThrow(ConflictException);
  });
  it('recusa cadastro para usina inexistente', async () => {
    mock.plant.findFirst.mockResolvedValue(null);
    await expect(service.criar('absent', input, admin)).rejects.toThrow(NotFoundException);
    expect(mock.inverter.create).not.toHaveBeenCalled();
  });
  it('edita metadados e estado com revisão atômica e novas chaves', async () => {
    await service.editar(
      'plant',
      'inverter',
      { revision: 2, serialNumber: 'new-002', status: 'FAULT' },
      operator,
    );
    expect(mock.inverter.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inverter', revision: 2 },
        data: partial({ serialKey: 'NEW-002', status: 'FAULT', revision: { increment: 1 } }),
      }),
    );
  });
  it('rejeita revisão obsoleta sem escrever', async () => {
    await expect(service.editar('plant', 'inverter', { revision: 1, model: 'Novo' }, admin)).rejects.toThrow(
      ConflictException,
    );
    await expect(service.remover('plant', 'inverter', { ...removal, revision: 1 }, admin)).rejects.toThrow(
      ConflictException,
    );
    expect(mock.inverter.update).not.toHaveBeenCalled();
  });
  it('não sobrescreve equipamento importado sem política de conciliação', async () => {
    mock.inverter.findFirst.mockResolvedValue({ origin: 'IMPORTED', revision: 2 });
    await expect(service.editar('plant', 'inverter', { revision: 2, model: 'Novo' }, admin)).rejects.toThrow(
      ConflictException,
    );
  });
  it('arquiva com ator, motivo e revisão, sem exclusão física', async () => {
    await expect(service.remover('plant', 'inverter', removal, admin)).resolves.toEqual({
      id: 'inverter',
      archived: true,
    });
    expect(mock.inverter.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: partial({
          archivedAt: expect.any(Date) as unknown,
          archivedById: admin.id,
          archiveReason: removal.reason,
        }),
      }),
    );
  });
  it('exige confirmação da série correta', async () => {
    await expect(
      service.remover('plant', 'inverter', { ...removal, confirmSerialNumber: 'other' }, admin),
    ).rejects.toThrow(BadRequestException);
    expect(mock.inverter.update).not.toHaveBeenCalled();
  });
  it('operador não remove; cliente não cadastra nem edita nem remove', async () => {
    await expect(service.remover('plant', 'inverter', removal, operator)).rejects.toThrow(ForbiddenException);
    await expect(service.criar('plant', input, client)).rejects.toThrow(ForbiddenException);
    await expect(service.editar('plant', 'inverter', { revision: 2, model: 'Novo' }, client)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.remover('plant', 'inverter', removal, client)).rejects.toThrow(ForbiddenException);
    expect(mock.$transaction).not.toHaveBeenCalled();
  });
  it('cliente consulta somente usina própria, com escopo reaplicado ao equipamento', async () => {
    await service.buscar('plant', 'inverter', client);
    expect(mock.plant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'plant', clientId: 'client' } }),
    );
    expect(mock.inverter.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inverter', plantId: 'plant', archivedAt: null, plant: { clientId: 'client' } },
      }),
    );
  });
  it('cliente sem vínculo não consulta equipamentos', async () => {
    await expect(service.buscar('plant', 'inverter', { ...client, clientId: null })).rejects.toThrow(
      NotFoundException,
    );
    expect(mock.inverter.findFirst).not.toHaveBeenCalled();
  });
  it('outra usina retorna 404 sem vazar equipamentos', async () => {
    mock.plant.findFirst.mockResolvedValue(null);
    await expect(service.listar('other', { pagina: 1, porPagina: 20 }, client)).rejects.toThrow(
      NotFoundException,
    );
    expect(mock.inverter.findMany).not.toHaveBeenCalled();
  });
  it('listagem pagina e omite arquivados sem remover o escopo do cliente', async () => {
    mock.inverter.count.mockResolvedValue(1);
    mock.inverter.findMany.mockResolvedValue([{ id: 'inverter' }]);
    const result = await service.listar('plant', { pagina: 2, porPagina: 10 }, client);
    expect(result.total).toBe(1);
    expect(mock.inverter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: { plantId: 'plant', archivedAt: null, plant: { clientId: 'client' } },
      }),
    );
  });
  it('consulta/edição/remoção de equipamento inexistente ou arquivado retorna 404', async () => {
    mock.inverter.findFirst.mockResolvedValue(null);
    await expect(service.buscar('plant', 'missing', admin)).rejects.toThrow(NotFoundException);
    await expect(service.editar('plant', 'missing', { revision: 0, model: 'Novo' }, admin)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.remover('plant', 'missing', removal, admin)).rejects.toThrow(NotFoundException);
  });
});

describe('Contratos de inversores', () => {
  it('não permite forjar origem, integração, UUID, usina ou última comunicação', () => {
    for (const field of [
      'origin',
      'integrationId',
      'externalId',
      'id',
      'plantId',
      'lastCommunicationAt',
      'archivedAt',
    ]) {
      expect(criarInversorSchema.safeParse({ ...input, [field]: 'fake' }).success).toBe(false);
      expect(editarInversorSchema.safeParse({ revision: 0, [field]: 'fake' }).success).toBe(false);
    }
  });
  it('valida campos obrigatórios, limites, enum, edição vazia e confirmação', () => {
    expect(criarInversorSchema.safeParse({ ...input, serialNumber: '  ' }).success).toBe(false);
    expect(criarInversorSchema.safeParse({ ...input, manufacturer: 'x'.repeat(161) }).success).toBe(false);
    expect(criarInversorSchema.safeParse({ ...input, status: 'inventado' }).success).toBe(false);
    expect(editarInversorSchema.safeParse({ revision: 0 }).success).toBe(false);
    expect(editarInversorSchema.parse({ revision: 0, model: 'Novo' })).toEqual({
      revision: 0,
      model: 'Novo',
    });
    expect(removerInversorSchema.safeParse({ revision: 0 }).success).toBe(false);
  });
  it.each([
    ['criar', Role.CLIENT, false],
    ['criar', Role.OPERATOR, true],
    ['editar', Role.CLIENT, false],
    ['editar', Role.ADMIN, true],
    ['remover', Role.OPERATOR, false],
    ['remover', Role.ADMIN, true],
    ['listar', Role.CLIENT, true],
    ['buscar', Role.CLIENT, true],
  ] as const)('guard real: %s com %s permitido=%s', (method, role, allowed) => {
    const guard = new RolesGuard(new Reflector());
    const ctx = {
      getClass: () => InvertersController,
      getHandler: () => Reflect.get(InvertersController.prototype, method) as unknown,
      switchToHttp: () => ({ getRequest: () => ({ user: { ...admin, role } }) }),
    } as unknown as ExecutionContext;
    if (allowed) expect(guard.canActivate(ctx)).toBe(true);
    else expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

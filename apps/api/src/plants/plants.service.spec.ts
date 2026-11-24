import { ConflictException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlantsService } from './plants.service';
import { PlantCatalogService } from './plant-catalog.service';

const partial = (value: Record<string, unknown>): unknown => expect.objectContaining(value);

describe('PlantsService: cadastro, edição e desvinculação', () => {
  const db = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    plant: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    plantExternalLink: { findFirst: jest.fn(), update: jest.fn() },
    integration: { update: jest.fn() },
    client: { findUnique: jest.fn() },
    plantAuditEvent: { create: jest.fn() },
  };
  const service = new PlantsService(db as unknown as PrismaService, new PlantCatalogService());
  const user = { id: 'admin', nome: 'Admin', email: 'admin@example.test', role: Role.ADMIN, clientId: null };
  const original = {
    id: 'plant',
    origin: 'MANUAL',
    revision: 3,
    name: 'Usina manual',
    city: null,
    state: null,
    capacityKwp: 15,
    manualOverrides: { name: 'Usina manual' },
    integrationId: 'i',
    externalId: 'e',
    clientId: 'client',
  };
  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((work: (tx: typeof db) => Promise<unknown>) => work(db));
    db.plant.findUnique.mockResolvedValue(original);
    db.plant.findFirst.mockResolvedValue(original);
    db.plant.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...original, ...data, externalLinks: [] }),
    );
  });
  it('desvincula, congela metadados, invalida coleta e não apaga dados', async () => {
    db.plantExternalLink.findFirst.mockResolvedValue({ id: 'link', integrationId: 'i' });
    await service.desvincularPlataforma('plant', { revision: 3, reason: 'Troca de conta' }, user);
    expect(db.plantExternalLink.update).toHaveBeenCalledWith({
      where: { id: 'link' },
      data: partial({ state: 'DETACHED' }),
    });
    expect(db.plant.update).toHaveBeenCalledWith({
      where: { id: 'plant' },
      data: partial({
        integrationId: null,
        externalId: null,
        status: 'UNKNOWN',
        currentPowerKw: null,
        manualOverrides: { name: 'Usina manual', city: null, state: null, capacityKwp: 15 },
      }),
    });
    expect(db.integration.update).toHaveBeenCalledWith({
      where: { id: 'i' },
      data: { revision: { increment: 1 } },
    });
    expect(db.plantAuditEvent.create).toHaveBeenCalled();
  });
  it('revisão antiga bloqueia edição e desvinculação', async () => {
    await expect(service.editar('plant', { revision: 2, name: 'Novo', useRemote: [] }, user)).rejects.toThrow(
      ConflictException,
    );
    await expect(
      service.desvincularPlataforma('plant', { revision: 2, reason: 'Teste' }, user),
    ).rejects.toThrow(ConflictException);
    expect(db.plant.update).not.toHaveBeenCalled();
  });
  it('remoção explícita de override usa o snapshot remoto, não apaga dados locais por omissão', async () => {
    db.plantExternalLink.findFirst.mockResolvedValue({
      remoteMetadata: { name: 'Nome remoto', city: 'Almenara', state: 'MG', capacityKwp: 20 },
    });
    await service.editar('plant', { revision: 3, useRemote: ['name'] }, user);
    expect(db.plant.update).toHaveBeenCalledWith(
      partial({
        where: { id: 'plant' },
        data: partial({ name: 'Nome remoto', manualOverrides: {} }),
      }),
    );
  });
  it('consulta mantém filtro por cliente e não expõe usina de terceiro', async () => {
    db.plant.findFirst.mockResolvedValue(null);
    await expect(
      service.buscarPorId('third-party', { ...user, role: Role.CLIENT, clientId: 'own-client' }),
    ).rejects.toThrow(NotFoundException);
    expect(db.plant.findFirst).toHaveBeenCalledWith(
      partial({ where: { id: 'third-party', clientId: 'own-client' } }),
    );
  });
});

import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlantCatalogService } from './plant-catalog.service';
import { Snapshot } from './plant-domain';

const value: Snapshot = {
  externalId: 'external-1',
  name: 'Usina remota',
  city: null,
  state: null,
  capacityKwp: 20,
  status: 'ONLINE',
  currentPowerKw: 10,
  todayEnergyKwh: 20,
  totalEnergyKwh: 100,
  lastDataAt: '2026-11-23T12:00:00.000Z',
};

const partial = (value: Record<string, unknown>): unknown => expect.objectContaining(value);

describe('PlantCatalogService', () => {
  const service = new PlantCatalogService();
  const mock = {
    plantExternalLink: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    plantDiscovery: { upsert: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    plant: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    integration: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    measurement: { createMany: jest.fn(), findFirstOrThrow: jest.fn() },
    plantAuditEvent: { create: jest.fn() },
  };
  const tx = mock as unknown as Prisma.TransactionClient;
  beforeEach(() => {
    jest.resetAllMocks();
    mock.plantExternalLink.create.mockResolvedValue({ id: 'created-link' });
    mock.integration.findUniqueOrThrow.mockResolvedValue({ provider: 'DEMO' });
    mock.measurement.createMany.mockImplementation(({ data }: { data: Record<string, unknown>[] }) => {
      mock.measurement.findFirstOrThrow.mockResolvedValue(data[0]);
      return Promise.resolve({ count: 1 });
    });
  });

  it('nova identidade vira descoberta; nunca cria uma duplicata silenciosamente', async () => {
    await expect(service.apply(tx, 'integration', value, new Date())).resolves.toBe('pending');
    expect(mock.plantDiscovery.upsert).toHaveBeenCalled();
    expect(mock.plant.create).not.toHaveBeenCalled();
  });
  it('identidade desvinculada permanece reservada mesmo com importação explícita', async () => {
    mock.plantExternalLink.findUnique.mockResolvedValue({ state: 'DETACHED' });
    await expect(service.apply(tx, 'integration', value, new Date(), true)).resolves.toBe('reserved');
    expect(mock.plant.create).not.toHaveBeenCalled();
    expect(mock.plantExternalLink.update).not.toHaveBeenCalled();
  });
  it('importação confirmada cria a mesma entidade Plant, sem cliente inventado', async () => {
    mock.plant.create.mockResolvedValue({ id: 'new-uuid' });
    await expect(service.apply(tx, 'integration', value, new Date(), true, 'admin')).resolves.toBe(
      'imported',
    );
    expect(mock.plant.create).toHaveBeenCalledWith({
      data: partial({ origin: 'IMPORTED', externalId: value.externalId }),
    });
    expect(mock.plantExternalLink.create).toHaveBeenCalledWith({
      data: partial({ plantId: 'new-uuid', integrationId: 'integration' }),
    });
    expect(mock.plantAuditEvent.create).toHaveBeenCalled();
  });
  it('sync do vínculo existente mantém UUID e overrides, sem alterar cliente/origem', async () => {
    mock.plantExternalLink.findUnique.mockResolvedValue({
      id: 'link',
      state: 'ACTIVE',
      plantId: 'manual-uuid',
      lastSample: null,
      plant: { manualOverrides: { name: 'Nome manual', capacityKwp: 12 } },
    });
    await expect(service.apply(tx, 'integration', value, new Date())).resolves.toBe('updated');
    expect(mock.plant.update).toHaveBeenCalledWith({
      where: { id: 'manual-uuid' },
      data: partial({ name: 'Nome manual', capacityKwp: 12 }),
    });
    const data = (mock.plant.update.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data;
    expect(data).not.toHaveProperty('clientId');
    expect(data).not.toHaveProperty('origin');
    for (const field of [
      'installationType',
      'nominalPowerKw',
      'moduleTiltDegrees',
      'operationStartDate',
      'postalCode',
      'street',
      'addressNumber',
      'addressComplement',
      'latitude',
      'longitude',
      'technicalNotes',
    ]) {
      expect(data).not.toHaveProperty(field);
    }
    for (const field of [
      'installationType',
      'nominalPowerKw',
      'moduleTiltDegrees',
      'operationStartDate',
      'postalCode',
      'street',
      'addressNumber',
      'addressComplement',
      'latitude',
      'longitude',
      'technicalNotes',
    ]) {
      expect(data).not.toHaveProperty(field);
    }
    expect(mock.plant.create).not.toHaveBeenCalled();
  });
  it('não transfere identidade já pertencente a outra usina', async () => {
    mock.plant.findUnique.mockResolvedValue({ id: 'manual', revision: 0 });
    mock.integration.findUnique.mockResolvedValue({ enabled: true, archivedAt: null });
    mock.plantExternalLink.findUnique.mockResolvedValue({ plantId: 'other' });
    await expect(
      service.link(tx, 'manual', { integrationId: 'i', externalId: 'e', revision: 0 }, 'admin'),
    ).rejects.toThrow(ConflictException);
    expect(mock.plant.update).not.toHaveBeenCalled();
  });

  it('vincula descoberta à manual com UUID, cliente e campos manuais preservados', async () => {
    mock.plant.findUnique.mockResolvedValue({
      id: 'manual',
      revision: 3,
      clientId: 'client',
      origin: 'MANUAL',
      manualOverrides: { name: 'Meu nome', capacityKwp: 12 },
    });
    mock.integration.findUnique.mockResolvedValue({ enabled: true, archivedAt: null });
    mock.plantDiscovery.findUnique.mockResolvedValue({
      id: 'discovery',
      snapshot: value,
      revision: 2,
      observedAt: new Date(),
    });
    await service.link(
      tx,
      'manual',
      { integrationId: 'i', externalId: 'external-1', revision: 3, discoveryRevision: 2 },
      'admin',
    );
    expect(mock.plant.update).toHaveBeenCalledWith(
      partial({
        where: { id: 'manual' },
        data: partial({ name: 'Meu nome', capacityKwp: 12, integrationId: 'i', externalId: 'external-1' }),
      }),
    );
    expect(mock.plant.create).not.toHaveBeenCalled();
    expect(mock.plantDiscovery.update).toHaveBeenCalled();
    expect(mock.integration.update).toHaveBeenCalled();
  });

  it('reconexão é explícita e usa o mesmo vínculo reservado', async () => {
    mock.plant.findUnique.mockResolvedValue({
      id: 'manual',
      revision: 4,
      manualOverrides: { name: 'Meu nome' },
    });
    mock.integration.findUnique.mockResolvedValue({ enabled: true, archivedAt: null });
    mock.plantExternalLink.findUnique.mockResolvedValue({
      id: 'reserved',
      plantId: 'manual',
      state: 'DETACHED',
      remoteMetadata: value,
    });
    await service.link(
      tx,
      'manual',
      { integrationId: 'i', externalId: value.externalId, revision: 4 },
      'admin',
    );
    expect(mock.plantExternalLink.update).toHaveBeenCalledWith(
      partial({ where: { id: 'reserved' }, data: partial({ state: 'ACTIVE', detachedAt: null }) }),
    );
    expect(mock.plantExternalLink.create).not.toHaveBeenCalled();
    expect(mock.plant.create).not.toHaveBeenCalled();
  });
});

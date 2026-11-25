import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AlertsService } from './alerts.service';

describe('Alertas no cadastro único', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  const db = {
    plant: { findMany: jest.fn() },
    alert: { findMany: jest.fn(), createMany: jest.fn(), updateMany: jest.fn() },
  };
  const service = new AlertsService(db as unknown as PrismaService);
  beforeEach(() => {
    jest.resetAllMocks();
    db.alert.createMany.mockResolvedValue({ count: 0 });
  });
  it('não declara recuperação de falha sem uma leitura confiável', async () => {
    db.plant.findMany.mockResolvedValue([
      {
        id: 'plant',
        name: 'Usina teste',
        status: 'UNKNOWN',
        lastDataAt: null,
        externalLinks: [],
        alertPolicy: null,
      },
    ]);
    db.alert.findMany.mockResolvedValue([{ id: 'fault', plantId: 'plant', type: 'PLANT_FAULT' }]);
    await service.avaliarUsinasTx(db as unknown as Prisma.TransactionClient, 'i', now);
    expect(db.alert.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [] }, status: { not: 'RESOLVED' } },
      data: { status: 'RESOLVED', resolvedAt: now, resolutionReason: 'AUTO_RECOVERY' },
    });
    expect(db.plant.findMany).toHaveBeenCalledWith({
      where: {
        externalLinks: {
          some: { integrationId: 'i', state: 'ACTIVE', integration: { enabled: true, archivedAt: null } },
        },
      },
      select: {
        id: true,
        name: true,
        status: true,
        lastDataAt: true,
        capacityKwp: true,
        externalLinks: {
          where: { state: 'ACTIVE' },
          select: { id: true, linkedAt: true, integration: { select: { provider: true } } },
        },
        alertPolicy: true,
      },
    });
  });
  it('uma leitura nova e saudável permite resolver a falha anterior, preservando histórico', async () => {
    db.plant.findMany.mockResolvedValue([
      {
        id: 'plant',
        name: 'Usina teste',
        status: 'ONLINE',
        lastDataAt: now,
        externalLinks: [],
        alertPolicy: null,
      },
    ]);
    db.alert.findMany.mockResolvedValue([{ id: 'fault', plantId: 'plant', type: 'PLANT_FAULT' }]);
    await service.avaliarUsinasTx(db as unknown as Prisma.TransactionClient, 'i', now);
    expect(db.alert.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['fault'] }, status: { not: 'RESOLVED' } },
      data: { status: 'RESOLVED', resolvedAt: now, resolutionReason: 'AUTO_RECOVERY' },
    });
  });
});

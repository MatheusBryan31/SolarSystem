import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { UsuarioAutenticado } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import { AlertsService } from './alerts.service';
import { DEFAULT_POLICY } from './alert-policy';

const staff = { id: 'operator', role: 'OPERATOR' } as UsuarioAutenticado;
const client = { id: 'client', role: 'CLIENT', clientId: 'tenant' } as UsuarioAutenticado;
describe('Ciclo de vida, isolamento e evidência dos alertas', () => {
  const now = new Date('2026-11-24T15:00:00Z');
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    plant: { findMany: jest.fn() },
    measurement: { findMany: jest.fn() },
    alert: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      createMany: jest.fn(),
    },
    alertEvent: { count: jest.fn(), findMany: jest.fn() },
  };
  const db = { ...tx, $transaction: jest.fn() };
  const service = new AlertsService(db as unknown as PrismaService);
  const plant = () => ({
    id: 'p',
    name: 'Fixture',
    status: 'ONLINE',
    lastDataAt: now,
    capacityKwp: 10,
    alertPolicy: null,
    externalLinks: [{ id: 'link', linkedAt: now, integration: { provider: 'DEMO' } }],
  });
  beforeEach(() => {
    jest.clearAllMocks();
    db.$transaction.mockImplementation((work: ((tx: object) => Promise<unknown>) | Promise<unknown>[]) =>
      typeof work === 'function' ? work(tx) : Promise.all(work),
    );
    tx.alert.createMany.mockResolvedValue({ count: 0 });
    tx.alert.updateMany.mockResolvedValue({ count: 0 });
    tx.alert.findMany.mockResolvedValue([]);
  });
  it('aguarda tolerância inicial de comunicação e depois abre alerta marcado como DEMO', async () => {
    tx.plant.findMany.mockResolvedValue([{ ...plant(), lastDataAt: null }]);
    await service.avaliarUsinasTx(tx as never, 'i', now);
    expect(tx.alert.createMany).toHaveBeenLastCalledWith({ data: [], skipDuplicates: true });
    const after = new Date(now.getTime() + 61 * 60000);
    await service.avaliarUsinasTx(tx as never, 'i', after);
    expect(tx.alert.createMany).toHaveBeenLastCalledWith({
      data: [expect.objectContaining({ type: 'PLANT_OFFLINE', isSimulated: true })],
      skipDuplicates: true,
    });
  });
  it('não recria episódio reconhecido quando a falha persiste', async () => {
    tx.plant.findMany.mockResolvedValue([{ ...plant(), status: 'FAULT' }]);
    tx.alert.findMany.mockResolvedValue([{ id: 'a', plantId: 'p', type: 'PLANT_FAULT' }]);
    await service.avaliarUsinasTx(tx as never, 'i', now);
    expect(tx.alert.createMany).toHaveBeenCalledWith({ data: [], skipDuplicates: true });
    expect(tx.alert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [] }, status: { not: 'RESOLVED' } } }),
    );
  });
  it('não declara recuperação da geração com amostras insuficientes', async () => {
    tx.plant.findMany.mockResolvedValue([
      { ...plant(), alertPolicy: { ...DEFAULT_POLICY, generationEnabled: true } },
    ]);
    tx.alert.findMany.mockResolvedValue([{ id: 'a', plantId: 'p', type: 'GENERATION_ABNORMAL' }]);
    tx.measurement.findMany.mockResolvedValue([]);
    await service.avaliarUsinasTx(tx as never, 'i', now);
    expect(tx.alert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [] }, status: { not: 'RESOLVED' } } }),
    );
  });
  it('reconhecer duas vezes preserva o primeiro reconhecimento', async () => {
    tx.alert.findUnique.mockResolvedValue({
      id: 'a',
      status: 'ACKNOWLEDGED',
      type: 'PLANT_FAULT',
      acknowledgedById: 'first',
    });
    await expect(service.reconhecer('a', staff)).resolves.toEqual(
      expect.objectContaining({ acknowledgedById: 'first' }),
    );
    expect(tx.alert.update).not.toHaveBeenCalled();
  });
  it('recusa resolução manual enquanto falha persiste ou comunicação é futura', async () => {
    tx.alert.findUnique.mockResolvedValue({
      id: 'a',
      status: 'OPEN',
      type: 'SYNC_FAILED',
      integration: { enabled: true, archivedAt: null, lastError: 'failure' },
    });
    await expect(service.resolver('a', 'Tentativa', staff)).rejects.toBeInstanceOf(ConflictException);
    tx.alert.findUnique.mockResolvedValue({
      id: 'a',
      status: 'OPEN',
      type: 'PLANT_OFFLINE',
      plant: {
        status: 'ONLINE',
        lastDataAt: new Date(Date.now() + 60000),
        alertPolicy: null,
        externalLinks: [{ integration: { enabled: true, archivedAt: null } }],
      },
    });
    await expect(service.resolver('a', 'Tentativa', staff)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.alert.update).not.toHaveBeenCalled();
  });
  it('resolução de alerta já encerrado é idempotente', async () => {
    tx.alert.findUnique.mockResolvedValue({ id: 'a', status: 'RESOLVED' });
    await expect(service.resolver('a', 'Concluído', staff)).resolves.toEqual({ id: 'a', status: 'RESOLVED' });
    expect(tx.alert.update).not.toHaveBeenCalled();
  });
  it('CLIENT não reconhece nem resolve', async () => {
    await expect(service.reconhecer('a', client)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.resolver('a', 'Motivo', client)).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('histórico de outro cliente é ocultado e atores internos não são selecionados', async () => {
    tx.alert.findFirst.mockResolvedValue(null);
    await expect(service.historico('a', client, 1, 20)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.alert.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'a',
          plant: { clientId: 'tenant' },
          type: { in: ['PLANT_OFFLINE', 'PLANT_FAULT', 'GENERATION_ABNORMAL'] },
        },
      }),
    );
    tx.alert.findFirst.mockResolvedValue({ id: 'a' });
    tx.alertEvent.count.mockResolvedValue(0);
    tx.alertEvent.findMany.mockResolvedValue([]);
    await service.historico('a', client, 1, 20);
    expect(tx.alertEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, status: true, createdAt: true, reason: true, isSimulated: true },
      }),
    );
  });
});

import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { recordSnapshot } from './measurement-writer';
import { aggregateReadings, type Reading } from './measurement-aggregation';
import { aggregationSchema, historySchema } from './measurements.schemas';
import { MeasurementsService } from './measurements.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Snapshot } from '../plants/plant-domain';

const source = '11111111-1111-4111-8111-111111111111';
const query = aggregationSchema.parse({
  sourceLinkId: source,
  period: 'day',
  from: '2026-01-01T00:00:00Z',
  to: '2026-01-03T00:00:00Z',
});
const row = (
  id: string,
  time: string,
  start: string | null = null,
  energy: number | null = null,
): Reading => ({
  id,
  measuredAt: new Date(time),
  periodStartAt: start ? new Date(start) : null,
  periodEnergyKwh: energy,
  powerKw: 10,
  quality: 'VALID',
  isSimulated: false,
});

describe('Agregações sem energia artificial', () => {
  it('não soma potência nem estima energia pelos intervalos de coleta', () => {
    const result = aggregateReadings(
      [row('a', '2026-01-01T12:00:00Z'), row('b', '2026-01-01T12:07:00Z')],
      query,
    );
    expect(result[0]).toMatchObject({
      samples: 2,
      peakPowerKw: 10,
      observedPeriodEnergyKwh: null,
      coverage: 'NOT_ESTABLISHED',
    });
  });
  it('soma apenas períodos explícitos e sem sobreposição', () => {
    const result = aggregateReadings(
      [
        row('a', '2026-01-01T12:00:00Z', '2026-01-01T11:00:00Z', 2),
        row('b', '2026-01-01T13:00:00Z', '2026-01-01T12:00:00Z', 3),
      ],
      query,
    );
    expect(result[0]).toMatchObject({
      observedPeriodEnergyKwh: 5,
      acceptedPeriods: 2,
      coverage: 'NOT_ESTABLISHED',
    });
  });
  it('exclui ambos os períodos sobrepostos e não rateia períodos entre dias', () => {
    const result = aggregateReadings(
      [
        row('a', '2026-01-01T12:00:00Z', '2026-01-01T10:00:00Z', 2),
        row('b', '2026-01-01T13:00:00Z', '2026-01-01T11:00:00Z', 3),
        row('c', '2026-01-02T02:00:00Z', '2026-01-01T23:00:00Z', 4),
      ],
      query,
    );
    expect(result[0]).toMatchObject({ observedPeriodEnergyKwh: null, excludedPeriods: 3 });
  });
  it('respeita fuso, mudança de dia e intervalo exclusivo no fim', () => {
    expect(
      aggregateReadings([row('a', '2026-01-02T01:00:00Z')], { ...query, timeZone: 'America/Sao_Paulo' })[0]
        .bucket,
    ).toBe('2026-01-01');
    expect(aggregateReadings([row('b', query.to)], query)).toEqual([]);
    expect(
      aggregateReadings([row('c', '2026-01-02T00:00:00Z', '2026-01-01T23:00:00Z', 1)], query)[0]
        .observedPeriodEnergyKwh,
    ).toBe(1);
  });
  it('dia de horário de verão não exige 24 horas', () => {
    const result = aggregateReadings([row('s', '2024-03-11T04:00:00Z', '2024-03-10T05:00:00Z', 20)], {
      ...query,
      from: '2024-03-10T05:00:00Z',
      to: '2024-03-11T04:00:00Z',
      timeZone: 'America/New_York',
    });
    expect(result[0]).toMatchObject({ bucket: '2024-03-10', observedPeriodEnergyKwh: 20 });
  });
  it.each(['month', 'year'] as const)('agrega por %s', (period) => {
    const result = aggregateReadings([row('a', '2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z', 2)], {
      ...query,
      period,
    });
    expect(result[0]).toMatchObject({
      observedPeriodEnergyKwh: 2,
      bucket: period === 'year' ? '2026' : '2026-01',
    });
  });
  it('exclui inválidos dos cálculos e identifica simulação', () => {
    expect(
      aggregateReadings(
        [
          {
            ...row('x', '2026-01-01T12:00:00Z', '2026-01-01T11:00:00Z', 50),
            quality: 'INVALID',
            isSimulated: true,
          },
        ],
        query,
      )[0],
    ).toMatchObject({
      usableSamples: 0,
      peakPowerKw: null,
      observedPeriodEnergyKwh: null,
      excludedPeriods: 1,
      simulated: true,
    });
  });
});

describe('Gravação de snapshots', () => {
  const db = {
    integration: { findUniqueOrThrow: jest.fn() },
    measurement: { createMany: jest.fn(), findFirstOrThrow: jest.fn() },
  };
  const sample: Snapshot = {
    externalId: 'e',
    name: 'Usina',
    city: null,
    state: null,
    capacityKwp: 10,
    status: 'ONLINE',
    currentPowerKw: 2,
    todayEnergyKwh: 5,
    totalEnergyKwh: 100,
    lastDataAt: '2026-01-01T12:00:00Z',
  };
  beforeEach(() => {
    jest.resetAllMocks();
    db.integration.findUniqueOrThrow.mockResolvedValue({ provider: 'DEMO' });
    db.measurement.createMany.mockImplementation(({ data }: { data: Record<string, unknown>[] }) => {
      db.measurement.findFirstOrThrow.mockResolvedValue(data[0]);
      return Promise.resolve({ count: 1 });
    });
  });
  it('marca DEMO e não converte energia diária em energia de período', async () => {
    await recordSnapshot(db as unknown as Prisma.TransactionClient, 'p', source, 'i', sample, new Date());
    const call = (db.measurement.createMany.mock.calls[0] as [{ data: Record<string, unknown>[] }])[0];
    expect(call.data[0]).toMatchObject({
      isSimulated: true,
      totalEnergyKwh: 100,
      periodEnergyKwh: null,
      periodStartAt: null,
      quality: 'VALID',
    });
  });
  it('não inventa timestamp ausente', async () => {
    await recordSnapshot(
      db as unknown as Prisma.TransactionClient,
      'p',
      source,
      'i',
      { ...sample, lastDataAt: null },
      new Date(),
    );
    expect(db.measurement.createMany).not.toHaveBeenCalled();
  });
  it('representa valor ausente como null, com qualidade parcial', async () => {
    await recordSnapshot(
      db as unknown as Prisma.TransactionClient,
      'p',
      source,
      'i',
      { ...sample, currentPowerKw: null },
      new Date(),
    );
    const call = (db.measurement.createMany.mock.calls[0] as [{ data: Record<string, unknown>[] }])[0];
    expect(call.data[0]).toMatchObject({ powerKw: null, quality: 'PARTIAL' });
  });
  it('aceita repetição idêntica e rejeita conflito sem substituir valor', async () => {
    await recordSnapshot(db as unknown as Prisma.TransactionClient, 'p', source, 'i', sample, new Date());
    db.measurement.createMany.mockResolvedValue({ count: 0 });
    await recordSnapshot(db as unknown as Prisma.TransactionClient, 'p', source, 'i', sample, new Date());
    await expect(
      recordSnapshot(
        db as unknown as Prisma.TransactionClient,
        'p',
        source,
        'i',
        { ...sample, currentPowerKw: 3 },
        new Date(),
      ),
    ).rejects.toThrow(ConflictException);
  });
});

describe('Consulta de histórico', () => {
  const db = {
    plant: { findFirst: jest.fn() },
    inverter: { findFirst: jest.fn() },
    plantExternalLink: { findFirst: jest.fn() },
    measurement: { count: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new MeasurementsService(db as unknown as PrismaService);
  const client = { id: 'u', nome: 'Cliente', email: 'client@example.test', role: Role.CLIENT, clientId: 'c' };
  beforeEach(() => {
    jest.resetAllMocks();
    db.plant.findFirst.mockResolvedValue({ id: 'p' });
    db.plantExternalLink.findFirst.mockResolvedValue({ id: source });
    db.measurement.findMany.mockResolvedValue([]);
    db.measurement.count.mockResolvedValue(0);
    db.$transaction.mockImplementation((promises: Promise<unknown>[]) => Promise.all(promises));
  });
  it('reaplica cliente e separa agregado de inversor e simulação', async () => {
    await service.history('p', historySchema.parse({ from: query.from, to: query.to }), client);
    const call = (db.measurement.findMany.mock.calls[0] as [{ where: Record<string, unknown> }])[0];
    expect(call.where).toMatchObject({
      plantId: 'p',
      inverterId: null,
      isSimulated: false,
      plant: { clientId: 'c' },
    });
  });
  it('recusa cliente sem vínculo e usina alheia', async () => {
    await expect(service.aggregate('p', query, { ...client, clientId: null })).rejects.toThrow(
      NotFoundException,
    );
    db.plant.findFirst.mockResolvedValue(null);
    await expect(service.aggregate('p', query, client)).rejects.toThrow(NotFoundException);
    expect(db.measurement.findMany).not.toHaveBeenCalled();
  });
  it('recusa fonte e inversor fora da usina', async () => {
    db.plantExternalLink.findFirst.mockResolvedValue(null);
    await expect(service.aggregate('p', query, client)).rejects.toThrow(NotFoundException);
    await expect(service.aggregate('p', { ...query, inverterId: source }, client)).rejects.toThrow(
      NotFoundException,
    );
  });
  it('recusa agregação excessiva sem truncar silenciosamente', async () => {
    db.measurement.findMany.mockResolvedValue(new Array(50001).fill(null));
    await expect(service.aggregate('p', query, client)).rejects.toThrow(UnprocessableEntityException);
  });
  it('valida fonte, fuso, intervalo e opt-in para simulação', () => {
    expect(historySchema.safeParse({ from: query.to, to: query.from }).success).toBe(false);
    expect(historySchema.safeParse({ from: query.from, to: query.from }).success).toBe(false);
    expect(
      aggregationSchema.safeParse({ ...query, includeSimulated: 'false', timeZone: 'Invalid/Zone' }).success,
    ).toBe(false);
    expect(aggregationSchema.safeParse({ from: query.from, to: query.to, period: 'day' }).success).toBe(
      false,
    );
    expect(
      historySchema.parse({ from: query.from, to: query.to, includeSimulated: 'true' }).includeSimulated,
    ).toBe(true);
  });
});

import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Snapshot } from '../plants/plant-domain';

// Executado na mesma transação do catálogo, depois da validação do snapshot.
// Não altera Plant nem produz datas/energia ausentes no fabricante.
export async function recordSnapshot(
  tx: Prisma.TransactionClient,
  plantId: string,
  sourceLinkId: string,
  integrationId: string,
  sample: Snapshot,
  recordedAt: Date,
) {
  if (!sample.lastDataAt) return;
  const integration = await tx.integration.findUniqueOrThrow({
    where: { id: integrationId },
    select: { provider: true },
  });
  const missing = sample.currentPowerKw === null || sample.totalEnergyKwh === null;
  const data = {
    plantId,
    sourceLinkId,
    inverterId: null,
    sourceProvider: integration.provider,
    isSimulated: integration.provider === 'DEMO',
    measuredAt: new Date(sample.lastDataAt),
    powerKw: sample.currentPowerKw,
    totalEnergyKwh: sample.totalEnergyKwh,
    periodEnergyKwh: null,
    periodStartAt: null,
    operationalStatus: sample.status,
    quality: missing ? ('PARTIAL' as const) : ('VALID' as const),
    qualityReason: missing ? 'MISSING_POWER_OR_TOTAL_ENERGY' : null,
  };
  // skipDuplicates não aborta a transação em uma corrida; o payload ainda é comparado.
  await tx.measurement.createMany({ data: [{ ...data, recordedAt }], skipDuplicates: true });
  const stored = await tx.measurement.findFirstOrThrow({
    where: { plantId, sourceLinkId, inverterId: null, measuredAt: data.measuredAt },
  });
  for (const key of [
    'powerKw',
    'totalEnergyKwh',
    'periodEnergyKwh',
    'operationalStatus',
    'quality',
    'qualityReason',
    'sourceProvider',
    'isSimulated',
  ] as const) {
    if (stored[key] !== data[key])
      throw new ConflictException('Medição divergente para a mesma fonte, equipamento e instante');
  }
}

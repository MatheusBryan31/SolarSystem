import { Prisma } from '@prisma/client';
import { NO_TELEMETRY, readOverrides, TELEMETRY_MAX_AGE_MS } from './plant-domain';

export const includePlant = {
  client: { select: { id: true, name: true } },
  integration: { select: { id: true, name: true, provider: true, enabled: true, archivedAt: true } },
  externalLinks: {
    where: { state: 'ACTIVE' as const },
    select: { id: true, revision: true, linkedAt: true },
  },
} satisfies Prisma.PlantInclude;

export function plantDto(plant: Prisma.PlantGetPayload<{ include: typeof includePlant }>, now = new Date()) {
  const { externalLinks, ...record } = plant;
  const overrides = readOverrides(plant.manualOverrides ?? {});
  const monitoring = !plant.integrationId
    ? 'UNLINKED'
    : !plant.integration?.enabled || plant.integration.archivedAt
      ? 'PAUSED'
      : !plant.lastDataAt
        ? 'WAITING'
        : now.getTime() - plant.lastDataAt.getTime() > TELEMETRY_MAX_AGE_MS
          ? 'STALE'
          : plant.status === 'UNKNOWN' && plant.currentPowerKw === null && plant.todayEnergyKwh === null
            ? 'WAITING'
            : 'ACTIVE';
  return {
    ...record,
    operationStartDate: plant.operationStartDate?.toISOString().slice(0, 10) ?? null,
    ...(monitoring === 'ACTIVE' ? {} : NO_TELEMETRY),
    activeLink: externalLinks?.[0] ?? null,
    monitoring,
    metadataSources: Object.fromEntries(
      ['name', 'city', 'state', 'capacityKwp'].map((key) => [
        key,
        Object.hasOwn(overrides, key) ? 'MANUAL' : plant.integrationId ? 'REMOTE' : 'UNSET',
      ]),
    ),
  };
}

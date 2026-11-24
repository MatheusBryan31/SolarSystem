import type { Measurement } from '@prisma/client';
import type { AggregationQuery } from './measurements.schemas';

export type Reading = Pick<
  Measurement,
  'id' | 'measuredAt' | 'powerKw' | 'periodEnergyKwh' | 'periodStartAt' | 'quality' | 'isSimulated'
>;

// Nunca soma potência nem acumuladores. Energia de período só é somada com
// intervalo explícito, válido, sem sobreposição e inteiramente dentro do bucket.
export function aggregateReadings(rows: Reading[], query: AggregationQuery) {
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: query.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const bucketKey = (date: Date) => {
    const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
    return query.period === 'year'
      ? parts.year
      : query.period === 'month'
        ? `${parts.year}-${parts.month}`
        : `${parts.year}-${parts.month}-${parts.day}`;
  };
  const from = Date.parse(query.from),
    to = Date.parse(query.to);
  const groups = new Map<
    string,
    {
      bucket: string;
      samples: number;
      usableSamples: number;
      peakPowerKw: number | null;
      observedPeriodEnergyKwh: number | null;
      acceptedPeriods: number;
      excludedPeriods: number;
      simulated: boolean;
      coverage: 'NOT_ESTABLISHED';
    }
  >();
  const group = (date: Date) => {
    const key = bucketKey(date);
    if (!groups.has(key))
      groups.set(key, {
        bucket: key,
        samples: 0,
        usableSamples: 0,
        peakPowerKw: null,
        observedPeriodEnergyKwh: null,
        acceptedPeriods: 0,
        excludedPeriods: 0,
        simulated: false,
        coverage: 'NOT_ESTABLISHED',
      });
    return groups.get(key)!;
  };
  const intervals = rows
    .filter((row) => row.periodStartAt && row.periodEnergyKwh !== null)
    .sort((a, b) => a.periodStartAt!.getTime() - b.periodStartAt!.getTime());
  const overlapping = new Set<string>();
  let maxEnd = -Infinity,
    maxRow: Reading | undefined;
  for (const row of intervals) {
    if (row.periodStartAt!.getTime() < maxEnd) {
      overlapping.add(row.id);
      if (maxRow) overlapping.add(maxRow.id);
    }
    if (row.measuredAt.getTime() > maxEnd) {
      maxEnd = row.measuredAt.getTime();
      maxRow = row;
    }
  }
  for (const row of rows) {
    const time = row.measuredAt.getTime();
    if (time >= from && time < to) {
      const item = group(row.measuredAt);
      item.samples++;
      item.simulated ||= row.isSimulated;
      if (row.quality !== 'INVALID') {
        item.usableSamples++;
        if (row.powerKw !== null) item.peakPowerKw = Math.max(item.peakPowerKw ?? -Infinity, row.powerKw);
      }
    }
    if (!row.periodStartAt || row.periodEnergyKwh === null) continue;
    const item = group(new Date(Math.max(from, row.periodStartAt.getTime())));
    item.simulated ||= row.isSimulated;
    if (
      row.quality !== 'VALID' ||
      overlapping.has(row.id) ||
      row.periodStartAt.getTime() < from ||
      time > to ||
      bucketKey(row.periodStartAt) !== bucketKey(new Date(time - 1))
    ) {
      item.excludedPeriods++;
      continue;
    }
    item.acceptedPeriods++;
    item.observedPeriodEnergyKwh = (item.observedPeriodEnergyKwh ?? 0) + row.periodEnergyKwh;
  }
  return [...groups.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
}

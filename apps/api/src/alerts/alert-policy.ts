import type { AlertPolicy, Measurement } from '@prisma/client';
import { z } from 'zod';

const zone = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, 'Fuso inválido');
export const policyFields = z
  .object({
    communicationMinutes: z.number().int().min(5).max(1440),
    generationEnabled: z.boolean(),
    lowPowerRatio: z.number().finite().min(0).max(2),
    highPowerRatio: z.number().finite().min(0).max(3),
    durationMinutes: z.number().int().min(1).max(120),
    minimumSamples: z.number().int().min(2).max(100),
    dayStartHour: z.number().int().min(0).max(23),
    dayEndHour: z.number().int().min(1).max(24),
    timeZone: zone,
    allowSimulated: z.boolean(),
  })
  .strict();
export const policySchema = policyFields.refine(
  (p) => p.lowPowerRatio < p.highPowerRatio && p.dayStartHour < p.dayEndHour,
  'Limites ou janela inválidos',
);
export const updatePolicySchema = policyFields
  .partial()
  .extend({ revision: z.number().int().nonnegative() })
  .strict();
export const DEFAULT_POLICY = {
  communicationMinutes: 60,
  generationEnabled: false,
  lowPowerRatio: 0.05,
  highPowerRatio: 1.2,
  durationMinutes: 10,
  minimumSamples: 3,
  dayStartHour: 8,
  dayEndHour: 17,
  timeZone: 'America/Sao_Paulo',
  allowSimulated: false,
};
type Policy = Omit<AlertPolicy, 'plantId' | 'revision'>;
type Sample = Pick<Measurement, 'measuredAt' | 'powerKw' | 'quality' | 'isSimulated'>;
// null significa evidência insuficiente, inclusive para declarar recuperação.
export function generationCondition(
  samples: Sample[],
  capacity: number | null,
  policy: Policy,
  now: Date,
): 'LOW' | 'HIGH' | 'NORMAL' | null {
  if (
    !policy.generationEnabled ||
    !capacity ||
    !Number.isFinite(capacity) ||
    capacity <= 0 ||
    samples.length < policy.minimumSamples
  )
    return null;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: policy.timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const civil = (date: Date) =>
    Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  const latest = samples[0];
  if (
    now.getTime() - latest.measuredAt.getTime() > policy.communicationMinutes * 60000 ||
    latest.measuredAt > now
  )
    return null;
  const today = civil(now);
  const within = (date: Date) => {
    const p = civil(date);
    return (
      p.year === today.year &&
      p.month === today.month &&
      p.day === today.day &&
      Number(p.hour) >= policy.dayStartHour &&
      Number(p.hour) < policy.dayEndHour
    );
  };
  if (!within(now)) return null;
  const chain: Sample[] = [];
  let state: 'LOW' | 'HIGH' | 'NORMAL' | null = null;
  for (const sample of samples) {
    if (
      sample.quality !== 'VALID' ||
      sample.powerKw === null ||
      !Number.isFinite(sample.powerKw) ||
      sample.powerKw < 0 ||
      (!policy.allowSimulated && sample.isSimulated) ||
      !within(sample.measuredAt)
    )
      break;
    if (
      chain.length &&
      chain.at(-1)!.measuredAt.getTime() - sample.measuredAt.getTime() > policy.communicationMinutes * 60000
    )
      break;
    const ratio = sample.powerKw / capacity;
    const next = ratio < policy.lowPowerRatio ? 'LOW' : ratio > policy.highPowerRatio ? 'HIGH' : 'NORMAL';
    if (state && state !== next) break;
    state = next;
    chain.push(sample);
    if (
      chain.length >= policy.minimumSamples &&
      latest.measuredAt.getTime() - sample.measuredAt.getTime() >= policy.durationMinutes * 60000
    )
      return state;
  }
  return null;
}

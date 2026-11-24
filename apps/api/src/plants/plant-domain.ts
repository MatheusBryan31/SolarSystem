import { BadRequestException, ConflictException } from '@nestjs/common';
import { HealthStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import type { UsinaLida } from '../providers/provider.types';

export const metadataSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    city: z.string().trim().max(120).nullable(),
    state: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    capacityKwp: z.number().finite().nonnegative().nullable(),
  })
  .strict();
export const overridesSchema = metadataSchema.partial();
export type Metadata = z.infer<typeof metadataSchema>;
export type Overrides = z.infer<typeof overridesSchema>;
// O schema anterior permitia strings sem limites e capacidades negativas.
// Ler/projetar esses registros não pode apagá-los nem quebrar GET após o backfill.
// Entradas novas continuam passando pelo metadataSchema restritivo nos DTOs.
const storedMetadataSchema = z
  .object({
    name: z.string(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    capacityKwp: z.number().finite().nullable(),
  })
  .strict();
export function readOverrides(value: unknown): Overrides {
  return storedMetadataSchema.partial().parse(value);
}
export function readMetadata(value: unknown): Metadata {
  return storedMetadataSchema.parse(value);
}
const sampleSchema = z
  .object({
    status: z.enum(HealthStatus),
    currentPowerKw: z.number().finite().nonnegative().nullable(),
    todayEnergyKwh: z.number().finite().nonnegative().nullable(),
    totalEnergyKwh: z.number().finite().nonnegative().nullable(),
    lastDataAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export const snapshotSchema = metadataSchema
  .extend({
    ...sampleSchema.shape,
    externalId: z.string().min(1).max(300),
  })
  .strict();
export type Snapshot = z.infer<typeof snapshotSchema>;
export const NO_TELEMETRY = {
  status: HealthStatus.UNKNOWN,
  currentPowerKw: null,
  todayEnergyKwh: null,
  totalEnergyKwh: null,
};
// Mesma janela já usada pelas regras de comunicação, explicitada também no DTO.
export const TELEMETRY_MAX_AGE_MS = 60 * 60 * 1000;

export function json(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

export function metadata(value: Metadata): Metadata {
  return storedMetadataSchema.parse({
    name: value.name,
    city: value.city,
    state: value.state,
    capacityKwp: value.capacityKwp,
  });
}

export function project(remote: Metadata, overrides: Overrides): Metadata {
  return storedMetadataSchema.parse({ ...metadata(remote), ...readOverrides(overrides) });
}

export function snapshot(value: UsinaLida, now: Date): Snapshot {
  if (
    value.lastDataAt !== null &&
    (!(value.lastDataAt instanceof Date) || !Number.isFinite(value.lastDataAt.getTime()))
  ) {
    throw new BadRequestException('Timestamp inválido recebido da plataforma');
  }
  const parsed = snapshotSchema.safeParse({ ...value, lastDataAt: value.lastDataAt?.toISOString() ?? null });
  if (!parsed.success) throw new BadRequestException('Dados inválidos recebidos da plataforma');
  if (parsed.data.lastDataAt && Date.parse(parsed.data.lastDataAt) > now.getTime() + 300000) {
    throw new BadRequestException('Leitura da plataforma está no futuro');
  }
  return parsed.data;
}

export function telemetry(next: Snapshot, previous: unknown) {
  const sample = sampleSchema.parse({
    status: next.status,
    currentPowerKw: next.currentPowerKw,
    todayEnergyKwh: next.todayEnergyKwh,
    totalEnergyKwh: next.totalEnergyKwh,
    lastDataAt: next.lastDataAt,
  });
  const old = previous ? sampleSchema.parse(previous) : null;
  // Identidade temporal é o instante, não sua representação textual/fuso.
  if (sample.lastDataAt) sample.lastDataAt = new Date(sample.lastDataAt).toISOString();
  if (old?.lastDataAt) old.lastDataAt = new Date(old.lastDataAt).toISOString();
  if (sample.lastDataAt && old?.lastDataAt) {
    if (Date.parse(sample.lastDataAt) < Date.parse(old.lastDataAt))
      throw new ConflictException('Leitura anterior à última amostra aceita');
    if (sample.lastDataAt === old.lastDataAt && JSON.stringify(sample) !== JSON.stringify(old)) {
      throw new ConflictException('Amostras divergentes para o mesmo horário');
    }
  }
  return {
    lastSample: sample.lastDataAt ? json(sample) : old ? json(old) : Prisma.DbNull,
    fields: sample.lastDataAt
      ? { ...sample, lastDataAt: new Date(sample.lastDataAt) }
      : { ...NO_TELEMETRY, lastDataAt: old?.lastDataAt ? new Date(old.lastDataAt) : null },
  };
}

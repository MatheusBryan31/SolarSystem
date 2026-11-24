import { BadRequestException } from '@nestjs/common';
import { InstallationType } from '@prisma/client';
import { z } from 'zod';

export const BRAZILIAN_STATES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;
export const brazilianStateSchema = z.string().trim().toUpperCase().pipe(z.enum(BRAZILIAN_STATES));
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      value >= '0001-01-01' &&
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, 'Data de calendário inválida')
  .refine(
    (value) => value <= new Date().toISOString().slice(0, 10),
    'Início da operação não pode estar no futuro',
  );
const text = (max: number) => z.string().trim().min(1).max(max).nullable().optional();

// Não pertencem ao snapshot dos fabricantes nem ao manualOverrides dos metadados remotos.
export const plantDetailsSchema = z
  .object({
    installationType: z.enum(InstallationType).nullable().optional(),
    nominalPowerKw: z.number().finite().nonnegative().nullable().optional(),
    moduleTiltDegrees: z.number().finite().min(0).max(90).nullable().optional(),
    operationStartDate: dateOnly.nullable().optional(),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{5}-?\d{3}$/)
      .transform((value) => value.replace('-', ''))
      .nullable()
      .optional(),
    street: text(200),
    addressNumber: text(30),
    addressComplement: text(200),
    latitude: z.number().finite().min(-90).max(90).nullable().optional(),
    longitude: z.number().finite().min(-180).max(180).nullable().optional(),
    technicalNotes: text(5000),
  })
  .strict();
export const DETAIL_FIELDS = Object.keys(plantDetailsSchema.shape);
type Details = z.infer<typeof plantDetailsSchema>;

export function splitPlantFields(input: Record<string, unknown>) {
  return {
    metadata: Object.fromEntries(Object.entries(input).filter(([key]) => !DETAIL_FIELDS.includes(key))),
    details: plantDetailsSchema.parse(
      Object.fromEntries(Object.entries(input).filter(([key]) => DETAIL_FIELDS.includes(key))),
    ),
  };
}

export function checkCoordinates(value: { latitude?: number | null; longitude?: number | null }) {
  if ((value.latitude != null) !== (value.longitude != null))
    throw new BadRequestException('Informe latitude e longitude juntas, ou remova ambas');
}

export function detailsForDatabase(details: Details) {
  const { operationStartDate, ...fields } = details;
  return {
    ...fields,
    ...(operationStartDate !== undefined
      ? {
          operationStartDate:
            operationStartDate === null ? null : new Date(`${operationStartDate}T00:00:00.000Z`),
        }
      : {}),
  };
}

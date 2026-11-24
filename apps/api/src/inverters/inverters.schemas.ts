import { InverterStatus } from '@prisma/client';
import { z } from 'zod';

// ASCII conserva zeros, pontuação e espaços internos; normaliza apenas caixa e bordas.
// Evita equivalências Unicode diferentes entre JavaScript e PostgreSQL.
const identifier = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[\x20-\x7E]+$/);
const fields = z
  .object({
    manufacturer: identifier,
    model: z.string().trim().min(1).max(160),
    serialNumber: identifier,
    status: z.enum(InverterStatus),
  })
  .strict();

export const criarInversorSchema = fields.extend({ status: z.enum(InverterStatus).default('UNKNOWN') });
export const editarInversorSchema = fields
  .partial()
  .extend({
    revision: z.number().int().nonnegative(),
  })
  .strict()
  .refine((input) => Object.keys(input).some((key) => key !== 'revision'), 'Informe uma alteração');
export const removerInversorSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    confirmSerialNumber: identifier,
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export const listarInversoresSchema = z
  .object({
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const identityKey = (value: string) => value.trim().toUpperCase();
export type CriarInversorDto = z.infer<typeof criarInversorSchema>;
export type EditarInversorDto = z.infer<typeof editarInversorSchema>;
export type RemoverInversorDto = z.infer<typeof removerInversorSchema>;
export type ListarInversoresDto = z.infer<typeof listarInversoresSchema>;

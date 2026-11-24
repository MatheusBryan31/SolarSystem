import { HealthStatus } from '@prisma/client';
import { z } from 'zod';
import { metadataSchema } from './plant-domain';

export const listarUsinasSchema = z.object({
  busca: z.string().trim().optional(),
  status: z.enum(HealthStatus, 'Status inválido').optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});

// Vínculo comercial é administrado pelo SolarSystem; nunca vem do adaptador.
// Metadados manuais usam overrides. Telemetria continua exclusiva da fonte ativa.
export const vincularClienteSchema = z.object({
  clientId: z.string().uuid('clientId deve ser um UUID').nullable(), // null = desvincular
});

export type ListarUsinasDto = z.infer<typeof listarUsinasSchema>;
export type VincularClienteDto = z.infer<typeof vincularClienteSchema>;

export const criarUsinaSchema = metadataSchema
  .partial()
  .required({ name: true })
  .extend({
    clientId: z.string().uuid().nullable().optional(),
  })
  .strict();
export const editarUsinaSchema = metadataSchema
  .partial()
  .extend({
    revision: z.number().int().nonnegative(),
    useRemote: z
      .array(z.enum(['name', 'city', 'state', 'capacityKwp']))
      .max(4)
      .default([]),
  })
  .strict()
  .refine(
    (body) =>
      Object.keys(body).some((key) => !['revision', 'useRemote'].includes(key)) || body.useRemote.length > 0,
    'Informe os campos a alterar',
  );
export const vincularPlataformaSchema = z
  .object({
    integrationId: z.string().uuid(),
    externalId: z.string().min(1).max(300),
    revision: z.number().int().nonnegative(),
    discoveryRevision: z.number().int().nonnegative().optional(),
  })
  .strict();
export const desvincularPlataformaSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export type CriarUsinaDto = z.infer<typeof criarUsinaSchema>;
export type EditarUsinaDto = z.infer<typeof editarUsinaSchema>;
export type VincularPlataformaDto = z.infer<typeof vincularPlataformaSchema>;
export type DesvincularPlataformaDto = z.infer<typeof desvincularPlataformaSchema>;

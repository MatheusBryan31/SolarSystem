import { HealthStatus } from '@prisma/client';
import { z } from 'zod';

export const listarUsinasSchema = z.object({
  busca: z.string().trim().optional(),
  status: z.enum(HealthStatus, 'Status inválido').optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});

// Por enquanto, o único dado NOSSO numa usina é o vínculo com o cliente.
// O resto (nome, potência...) vem da plataforma e seria sobrescrito na próxima sincronização.
export const vincularClienteSchema = z.object({
  clientId: z.string().uuid('clientId deve ser um UUID').nullable(), // null = desvincular
});

export type ListarUsinasDto = z.infer<typeof listarUsinasSchema>;
export type VincularClienteDto = z.infer<typeof vincularClienteSchema>;

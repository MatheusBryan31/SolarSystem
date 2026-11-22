import { z } from 'zod';

export const criarClienteSchema = z.object({
  name: z.string().trim().min(2, 'Nome muito curto').max(120, 'Nome muito longo'),
  document: z
    .string()
    .trim()
    .regex(/^(\d{11}|\d{14})$/, 'Informe CPF (11) ou CNPJ (14 dígitos), só números')
    .optional(),
  email: z.string().trim().toLowerCase().email('E-mail inválido').optional(),
  phone: z.string().trim().max(20, 'Telefone muito longo').optional(),
});

// PATCH: os mesmos campos, todos opcionais (altera só o que vier)
export const atualizarClienteSchema = criarClienteSchema.partial();

// Filtros da listagem: chegam pela URL (?busca=...&pagina=2), sempre como TEXTO
export const listarClientesSchema = z.object({
  busca: z.string().trim().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});

export type CriarClienteDto = z.infer<typeof criarClienteSchema>;
export type AtualizarClienteDto = z.infer<typeof atualizarClienteSchema>;
export type ListarClientesDto = z.infer<typeof listarClientesSchema>;

import { Role } from '@prisma/client';
import { z } from 'zod';

import { novaSenhaSchema } from '../auth/password.schema';

const role = z.enum(Role, 'Perfil inválido (use ADMIN, OPERATOR ou CLIENT)');

// Campos comuns, SEM valores padrão
const camposUsuario = z.object({
  name: z.string().trim().min(2, 'Nome muito curto').max(120, 'Nome muito longo'),
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  senha: novaSenhaSchema,
  role,
  // null = "sem cliente"; obrigatório quando role = CLIENT (regra conferida no Service)
  clientId: z.string().uuid('clientId deve ser um UUID').nullable().optional(),
});

// POST: o perfil é opcional e, se omitido, vira OPERATOR
export const criarUsuarioSchema = camposUsuario.extend({ role: role.default(Role.OPERATOR) });

// PATCH: tudo opcional, e ainda permite ativar/desativar.
// Atenção: partimos de camposUsuario, e NÃO de criarUsuarioSchema. O .partial() do Zod mantém
// os .default(); se o role tivesse default aqui, todo PATCH sem role rebaixaria o usuário a OPERATOR.
export const atualizarUsuarioSchema = camposUsuario
  .extend({ active: z.boolean('active deve ser true ou false') })
  .partial()
  .refine((dados) => Object.keys(dados).length > 0, 'Envie ao menos um campo para alterar');

export const listarUsuariosSchema = z.object({
  busca: z.string().trim().optional(),
  role: z.enum(Role, 'Perfil inválido').optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});

export type CriarUsuarioDto = z.infer<typeof criarUsuarioSchema>;
export type AtualizarUsuarioDto = z.infer<typeof atualizarUsuarioSchema>;
export type ListarUsuariosDto = z.infer<typeof listarUsuariosSchema>;

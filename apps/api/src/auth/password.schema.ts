import { z } from 'zod';
import { loginSchema } from './login.schema';

export const novaSenhaSchema = z
  .string()
  .min(10, 'A senha deve ter pelo menos 10 caracteres')
  .refine((senha) => Buffer.byteLength(senha, 'utf8') <= 72, 'Use no máximo 72 bytes na senha');

export const recuperarSenhaSchema = loginSchema.pick({ email: true });
export const redefinirSenhaSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Link inválido ou expirado'),
  novaSenha: novaSenhaSchema,
});
export const alterarSenhaSchema = z.object({
  senhaAtual: z.string().min(1).max(1024),
  novaSenha: novaSenhaSchema,
});

export type RecuperarSenhaDto = z.infer<typeof recuperarSenhaSchema>;
export type RedefinirSenhaDto = z.infer<typeof redefinirSenhaSchema>;
export type AlterarSenhaDto = z.infer<typeof alterarSenhaSchema>;

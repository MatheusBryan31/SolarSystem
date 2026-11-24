import { ProviderType } from '@prisma/client';
import { z } from 'zod';

export const criarIntegracaoSchema = z.object({
  provider: z.enum(ProviderType, 'Plataforma não suportada'),
  name: z.string().trim().min(2, 'Nome muito curto').max(120, 'Nome muito longo'),
  // Cada plataforma pede campos diferentes, então aceitamos "chave: texto" livre.
  // Quem confere se estão certos é o próprio adaptador, no testarConexao.
  credentials: z
    .unknown()
    .default({})
    .transform((valor, ctx) => {
      const resultado = z.record(z.string(), z.string()).safeParse(valor);
      if (resultado.success) return resultado.data;
      ctx.addIssue({ code: 'custom', message: 'Formato de credenciais inválido' });
      return z.NEVER;
    }),
});

export type CriarIntegracaoDto = z.infer<typeof criarIntegracaoSchema>;

export const estadoIntegracaoSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    enabled: z.boolean().optional(),
    archive: z.literal(true).optional(),
  })
  .strict()
  .refine((value) => value.enabled !== undefined || value.archive, 'Informe enabled ou archive');
export const importarDescobertaSchema = z.object({ revision: z.number().int().nonnegative() }).strict();
export type EstadoIntegracaoDto = z.infer<typeof estadoIntegracaoSchema>;

import { z } from 'zod';

// O "contrato": quais variáveis existem e que formato cada uma deve ter
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.string().startsWith('postgresql://', 'DATABASE_URL deve começar com postgresql://'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter pelo menos 32 caracteres'),
  JWT_EXPIRES_IN: z.coerce.number().int().positive().default(28800),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
});

// O TypeScript deduz o tipo a partir do contrato: não precisamos escrevê-lo duas vezes
export type Env = z.infer<typeof envSchema>;

// O Nest chama esta função na partida, passando tudo o que leu do .env
export function validateEnv(config: Record<string, unknown>): Env {
  const resultado = envSchema.safeParse(config);
  if (!resultado.success) {
    const erros = resultado.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${erros}`);
  }
  return resultado.data;
}

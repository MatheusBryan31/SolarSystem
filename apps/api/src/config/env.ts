import { isIP } from 'node:net';
import { z } from 'zod';

// O "contrato": quais variáveis existem e que formato cada uma deve ter
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3333),
    DATABASE_URL: z.string().startsWith('postgresql://', 'DATABASE_URL deve começar com postgresql://'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter pelo menos 32 caracteres'),
    JWT_EXPIRES_IN: z.coerce.number().int().positive().default(28800),
    SMTP_URL: z
      .union([
        z.literal(''),
        z.string().refine((valor) => {
          const url = URL.parse(valor);
          return (
            url !== null &&
            ['smtp:', 'smtps:'].includes(url.protocol) &&
            Boolean(url.hostname) &&
            !url.search &&
            !url.hash
          );
        }, 'Configure uma URL smtp:// ou smtps:// sem parâmetros nem fragmento'),
      ])
      .default(''),
    PASSWORD_RESET_FROM: z.union([z.literal(''), z.email()]).default(''),
    WEB_ORIGIN: z
      .string()
      .default('http://localhost:5173')
      .refine((valor) => {
        const url = URL.parse(valor);
        return url !== null && ['http:', 'https:'].includes(url.protocol) && url.origin === valor;
      }, 'Informe uma origem HTTP(S) exata, sem caminho ou barra final'),
    TRUSTED_PROXY_IPS: z
      .string()
      .default('')
      .transform((valor) => (valor.trim() ? valor.split(',').map((ip) => ip.trim()) : []))
      .refine((ips) => ips.every((ip) => isIP(ip) !== 0), 'Informe IPs exatos separados por vírgula'),
    SYNC_INTERVAL_MIN: z.coerce.number().int().min(0).max(1440).default(10), // De quantos em quantos minutos a coleta automática roda (0 = desligada)
  })
  .refine(({ NODE_ENV, WEB_ORIGIN }) => NODE_ENV !== 'production' || WEB_ORIGIN.startsWith('https://'), {
    path: ['WEB_ORIGIN'],
    message: 'Em produção, WEB_ORIGIN deve usar HTTPS',
  })
  .refine(({ SMTP_URL, PASSWORD_RESET_FROM }) => Boolean(SMTP_URL) === Boolean(PASSWORD_RESET_FROM), {
    path: ['SMTP_URL'],
    message: 'Configure SMTP_URL e PASSWORD_RESET_FROM em conjunto',
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

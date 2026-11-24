import { z } from 'zod';

const filters = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  inverterId: z.string().uuid().optional(),
  sourceLinkId: z.string().uuid().optional(),
  includeSimulated: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
const validRange = (days: number) => (input: { from: string; to: string }) => {
  const difference = Date.parse(input.to) - Date.parse(input.from);
  return difference > 0 && difference <= days * 86400000;
};
export const historySchema = filters
  .extend({
    pagina: z.coerce.number().int().min(1).max(100000).default(1),
    porPagina: z.coerce.number().int().min(1).max(1000).default(100),
  })
  .strict()
  .refine(validRange(366), 'Intervalo deve ser positivo e de até 366 dias');
export const aggregationSchema = filters
  .extend({
    sourceLinkId: z.string().uuid(),
    period: z.enum(['day', 'month', 'year']),
    timeZone: z
      .string()
      .max(100)
      .default('UTC')
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value }).format();
          return true;
        } catch {
          return false;
        }
      }, 'Fuso horário inválido'),
  })
  .strict()
  .refine(validRange(3660), 'Intervalo deve ser positivo e de até 3660 dias');
export type HistoryQuery = z.infer<typeof historySchema>;
export type AggregationQuery = z.infer<typeof aggregationSchema>;

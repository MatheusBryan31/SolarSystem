import { AlertStatus, AlertType } from '@prisma/client';
import { z } from 'zod';

export const listarAlertasSchema = z.object({
  type: z.enum(AlertType).optional(),
  plantId: z.string().uuid().optional(),
  status: z.enum(AlertStatus, 'Status inválido').optional(),
  // Atalho para a tela principal: só o que ainda precisa de atenção (OPEN + ACKNOWLEDGED)
  ativos: z
    .enum(['true', 'false'], 'Use true ou false')
    .transform((v) => v === 'true')
    .optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListarAlertasDto = z.infer<typeof listarAlertasSchema>;

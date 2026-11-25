import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { Roles } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { catalogTransaction } from '../plants/catalog-transaction';
import { DEFAULT_POLICY, policySchema, updatePolicySchema } from './alert-policy';
import { listarAlertasSchema, type ListarAlertasDto } from './alerts.schemas';

const notificationFields = z
  .object({
    enabled: z.boolean(),
    recipients: z
      .array(z.string().trim().toLowerCase().email())
      .max(10)
      .refine((values) => new Set(values).size === values.length, 'Destinatários repetidos'),
    statuses: z
      .array(z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']))
      .min(1)
      .max(3)
      .refine((values) => new Set(values).size === values.length),
  })
  .strict();
const notificationSchema = notificationFields.refine(
  (v) => !v.enabled || v.recipients.length > 0,
  'Informe ao menos um destinatário',
);
export const updateNotificationsSchema = notificationFields
  .partial()
  .extend({ revision: z.number().int().nonnegative() })
  .strict();

@Injectable()
export class AlertConfiguration {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}
  async policy(plantId: string) {
    if (!(await this.prisma.plant.findUnique({ where: { id: plantId }, select: { id: true } })))
      throw new NotFoundException('Usina não encontrada');
    return (
      (await this.prisma.alertPolicy.findUnique({ where: { plantId } })) ?? {
        plantId,
        ...DEFAULT_POLICY,
        revision: 0,
      }
    );
  }
  async savePolicy(plantId: string, input: z.infer<typeof updatePolicySchema>) {
    return catalogTransaction(this.prisma, async (tx) => {
      if (!(await tx.plant.findUnique({ where: { id: plantId }, select: { id: true } })))
        throw new NotFoundException('Usina não encontrada');
      const previous = await tx.alertPolicy.findUnique({ where: { plantId } });
      if ((previous?.revision ?? 0) !== input.revision)
        throw new ConflictException('Política alterada; recarregue');
      const changes = Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'revision'));
      const settings = policySchema.safeParse({
        ...DEFAULT_POLICY,
        ...(previous
          ? Object.fromEntries(
              Object.keys(DEFAULT_POLICY).map((key) => [key, previous[key as keyof typeof previous]]),
            )
          : {}),
        ...changes,
      });
      if (!settings.success) throw new ConflictException('Limites ou janela de geração inválidos');
      return tx.alertPolicy.upsert({
        where: { plantId },
        create: { plantId, ...settings.data, revision: 1 },
        update: { ...settings.data, revision: { increment: 1 } },
      });
    });
  }
  async settings() {
    const saved = await this.prisma.alertNotificationSettings.findUnique({ where: { id: 'default' } });
    return {
      ...(saved ?? {
        id: 'default',
        enabled: false,
        recipients: [],
        statuses: ['OPEN', 'RESOLVED'],
        revision: 0,
      }),
      workerEnabled: this.config.get<boolean>('ALERT_EMAIL_WORKER_ENABLED') === true,
      smtpConfigured: Boolean(
        this.config.get<string>('SMTP_URL') && this.config.get<string>('ALERT_EMAIL_FROM'),
      ),
    };
  }
  async saveSettings(input: z.infer<typeof updateNotificationsSchema>) {
    return catalogTransaction(this.prisma, async (tx) => {
      const previous = await tx.alertNotificationSettings.findUnique({ where: { id: 'default' } });
      if ((previous?.revision ?? 0) !== input.revision)
        throw new ConflictException('Configuração alterada; recarregue');
      const changes = Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'revision'));
      const parsed = notificationSchema.safeParse({
        enabled: previous?.enabled ?? false,
        recipients: previous?.recipients ?? [],
        statuses: previous?.statuses ?? ['OPEN', 'RESOLVED'],
        ...changes,
      });
      if (!parsed.success) throw new ConflictException('Destinatários ou eventos inválidos');
      return tx.alertNotificationSettings.upsert({
        where: { id: 'default' },
        create: { id: 'default', ...parsed.data, revision: 1 },
        update: { ...parsed.data, revision: { increment: 1 } },
      });
    });
  }
  async deliveries(pagina: number, porPagina: number) {
    const [total, itens] = await this.prisma.$transaction([
      this.prisma.alertEmail.count(),
      this.prisma.alertEmail.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);
    return { total, itens, pagina, porPagina };
  }
}

@Controller()
@Roles(Role.ADMIN)
export class AlertConfigurationController {
  constructor(private readonly settings: AlertConfiguration) {}
  @Get('plants/:plantId/alert-policy') policy(@Param('plantId', ParseUUIDPipe) id: string) {
    return this.settings.policy(id);
  }
  @Patch('plants/:plantId/alert-policy') savePolicy(
    @Param('plantId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePolicySchema)) input: z.infer<typeof updatePolicySchema>,
  ) {
    return this.settings.savePolicy(id, input);
  }
  @Get('alerts/notification-settings') get() {
    return this.settings.settings();
  }
  @Patch('alerts/notification-settings') save(
    @Body(new ZodValidationPipe(updateNotificationsSchema)) input: z.infer<typeof updateNotificationsSchema>,
  ) {
    return this.settings.saveSettings(input);
  }
  @Get('alerts/notifications') deliveries(
    @Query(new ZodValidationPipe(listarAlertasSchema)) input: ListarAlertasDto,
  ) {
    return this.settings.deliveries(input.pagina, input.porPagina);
  }
}

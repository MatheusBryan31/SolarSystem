import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AlertMailer } from './alert-mailer';

@Injectable()
export class AlertNotifications {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: AlertMailer,
    private readonly config: ConfigService,
  ) {}
  async process() {
    if (this.config.get<boolean>('ALERT_EMAIL_WORKER_ENABLED') !== true || !this.mailer.enabled) return;
    // Não repetir automaticamente entregas de resultado incerto, inclusive após crash.
    await this.prisma.alertEmail.updateMany({
      where: { status: 'SENDING', attemptedAt: { lt: new Date(Date.now() - 15 * 60000) } },
      data: { status: 'UNKNOWN', failureCode: 'INTERRUPTED_ATTEMPT' },
    });
    for (let i = 0; i < 20; i++) {
      const ids = await this.prisma.$queryRaw<
        { id: string }[]
      >`UPDATE alert_emails SET status='SENDING',attempted_at=NOW()
        WHERE id=(SELECT id FROM alert_emails WHERE status='PENDING' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`;
      if (!ids.length) return;
      const job = await this.prisma.alertEmail.findUniqueOrThrow({
        where: { id: ids[0].id },
        include: { event: { include: { alert: true } } },
      });
      const settings = await this.prisma.alertNotificationSettings.findUnique({ where: { id: 'default' } });
      if (
        !settings?.enabled ||
        !settings.recipients.includes(job.recipient) ||
        job.event.isSimulated ||
        job.event.alert.isSimulated ||
        !settings.statuses.includes(job.event.status)
      ) {
        await this.prisma.alertEmail.update({
          where: { id: job.id },
          data: { status: 'SKIPPED', failureCode: 'CONFIGURATION_OR_SIMULATION' },
        });
        continue;
      }
      const alert = job.event.alert;
      const subject = `SolarSystem: ${job.event.status === 'RESOLVED' ? 'alerta resolvido' : job.event.status === 'ACKNOWLEDGED' ? 'alerta reconhecido' : 'novo alerta'}`;
      const text = `Evento: ${job.event.id}\nAlerta: ${alert.id}\nTipo: ${alert.type}\nSituação do evento: ${job.event.status}\nHorário UTC: ${job.event.createdAt.toISOString()}\n${alert.type === 'SYNC_FAILED' ? 'Falha na coleta da plataforma' : alert.message}`;
      let accepted: boolean;
      try {
        accepted = await this.mailer.send(job.recipient, subject, text);
      } catch {
        await this.prisma.alertEmail.update({
          where: { id: job.id },
          data: { status: 'UNKNOWN', failureCode: 'SMTP_RESULT_UNCERTAIN' },
        });
        continue;
      }
      // SENT significa aceito pelo SMTP, não comprova entrega/leitura na caixa postal.
      await this.prisma.alertEmail.update({
        where: { id: job.id },
        data: accepted
          ? { status: 'SENT', sentAt: new Date(), failureCode: null }
          : { status: 'FAILED', failureCode: 'SMTP_REJECTED' },
      });
    }
  }
}

import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AlertsService } from './alerts.service';
import { AlertNotifications } from './alert-notifications';

@Injectable()
export class AlertsMaintenance implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private mailTimer?: NodeJS.Timeout;
  private delivering = false;
  private running = false;
  private readonly log = new Logger(AlertsMaintenance.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
    private readonly notifications: AlertNotifications,
    private readonly config: ConfigService,
  ) {}
  onApplicationBootstrap() {
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    const seconds = this.config.get<number>('ALERT_EVALUATION_INTERVAL_SECONDS') ?? 60;
    if (seconds > 0) {
      this.timer = setInterval(() => void this.tick(), seconds * 1000);
      this.timer.unref();
    }
    if (this.config.get<boolean>('ALERT_EMAIL_WORKER_ENABLED') === true) {
      this.mailTimer = setInterval(() => void this.deliver(), 60000);
      this.mailTimer.unref();
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.mailTimer) clearInterval(this.mailTimer);
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const integrations = await this.prisma.integration.findMany({
        where: { enabled: true, archivedAt: null },
        select: { id: true },
      });
      for (const integration of integrations) {
        try {
          await this.alerts.avaliarUsinas(integration.id, new Date());
        } catch {
          this.log.warn('Falha ao avaliar alarmes; próxima avaliação continuará disponível');
        }
      }
    } catch {
      this.log.warn('Falha no processamento de alarmes/notificações');
    } finally {
      this.running = false;
    }
  }
  async deliver() {
    if (this.delivering) return;
    this.delivering = true;
    try {
      await this.notifications.process();
    } catch {
      this.log.warn('Falha na entrega de notificações');
    } finally {
      this.delivering = false;
    }
  }
}

import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertConfiguration, AlertConfigurationController } from './alert-configuration';
import { AlertMailer } from './alert-mailer';
import { AlertNotifications } from './alert-notifications';
import { AlertsMaintenance } from './alerts-maintenance';

@Module({
  controllers: [AlertsController, AlertConfigurationController],
  providers: [AlertsService, AlertConfiguration, AlertMailer, AlertNotifications, AlertsMaintenance],
  exports: [AlertsService], // a sincronização (IntegrationsModule) usa o AlertsService
})
export class AlertsModule {}

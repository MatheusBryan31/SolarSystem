import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { ProvidersModule } from '../providers/providers.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { SyncScheduler } from './sync.scheduler';

@Module({
  imports: [ProvidersModule, AlertsModule], // registro de adaptadores + serviço de alertas
  controllers: [IntegrationsController],
  providers: [IntegrationsService, SyncScheduler],
})
export class IntegrationsModule {}

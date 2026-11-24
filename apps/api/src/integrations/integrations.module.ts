import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { ProvidersModule } from '../providers/providers.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { SyncScheduler } from './sync.scheduler';
import { PlantsModule } from '../plants/plants.module';

@Module({
  imports: [ProvidersModule, AlertsModule, PlantsModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, SyncScheduler],
})
export class IntegrationsModule {}

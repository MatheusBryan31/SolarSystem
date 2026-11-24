import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertsModule } from '../alerts/alerts.module';
import { ProvidersModule } from '../providers/providers.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { SyncScheduler } from './sync.scheduler';
import { PlantsModule } from '../plants/plants.module';
import { CredentialEncryption } from './credential-encryption';

@Module({
  imports: [ProvidersModule, AlertsModule, PlantsModule],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    SyncScheduler,
    {
      provide: CredentialEncryption,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new CredentialEncryption(config.getOrThrow<string>('INTEGRATION_CREDENTIALS_KEY')),
    },
  ],
})
export class IntegrationsModule {}

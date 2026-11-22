import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [ProvidersModule], // para poder injetar o ProviderRegistry
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
})
export class IntegrationsModule {}

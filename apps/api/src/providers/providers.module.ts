import { Module } from '@nestjs/common';
import { ProviderRegistry } from './provider-registry';

@Module({
  providers: [ProviderRegistry],
  exports: [ProviderRegistry], // outros módulos (integrações) podem injetar o registro
})
export class ProvidersModule {}

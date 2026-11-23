import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const porta = config.getOrThrow<number>('PORT');
  const ambiente = config.getOrThrow<string>('NODE_ENV');

  app.setGlobalPrefix('api');
  // Permite que um front-end em OUTRO endereço chame a API.
  // credentials: true = esse front pode enviar o cookie de sessão junto.
  app.enableCors({ origin: config.getOrThrow<string>('WEB_ORIGIN'), credentials: true });

  await app.listen(porta);
  console.log(`SolarSystem API em http://localhost:${porta}/api (${ambiente})`);
}
void bootstrap();

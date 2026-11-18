import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const porta = config.getOrThrow<number>('PORT');
  const ambiente = config.getOrThrow<string>('NODE_ENV');

  app.setGlobalPrefix('api');
  // Permite que o front-end (outro endereço) chame a API (veremos CORS na aula 15)
  app.enableCors({ origin: config.getOrThrow<string>('WEB_ORIGIN') });

  await app.listen(porta);
  console.log(`SolarSystem API em http://localhost:${porta}/api (${ambiente})`);
}
void bootstrap();

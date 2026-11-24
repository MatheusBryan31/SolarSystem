import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  const porta = config.getOrThrow<number>('PORT');
  const ambiente = config.getOrThrow<string>('NODE_ENV');

  app.setGlobalPrefix('api');
  const proxies = config.getOrThrow<string[]>('TRUSTED_PROXY_IPS');
  if (proxies.length) app.set('trust proxy', proxies);
  // Permite que um front-end em OUTRO endereço chame a API.
  // credentials: true = esse front pode enviar o cookie de sessão junto.
  app.enableCors({
    origin: config.getOrThrow<string>('WEB_ORIGIN'),
    credentials: true,
    exposedHeaders: ['Retry-After'],
  });

  await app.listen(porta);
  console.log(`SolarSystem API em http://localhost:${porta}/api (${ambiente})`);
}
void bootstrap();

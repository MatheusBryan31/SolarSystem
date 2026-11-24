import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import type { Env } from './config/env';
import { configurarHttp } from './config/http';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService<Env, true>);

  const porta = config.get('PORT', { infer: true });
  const ambiente = config.get('NODE_ENV', { infer: true });

  configurarHttp(app, {
    NODE_ENV: ambiente,
    WEB_ORIGIN: config.get('WEB_ORIGIN', { infer: true }),
    TRUSTED_PROXY_IPS: config.get('TRUSTED_PROXY_IPS', { infer: true }),
  });

  await app.listen(porta);
  console.log(`SolarSystem API na porta ${porta} (${ambiente})`);
}
void bootstrap();

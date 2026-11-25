import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import type { Env } from './config/env';
import { configurarHttp } from './config/http';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    autoFlushLogs: false,
    abortOnError: false,
  });
  const config = app.get(ConfigService<Env, true>);
  app.enableShutdownHooks();

  const porta = config.get('PORT', { infer: true });
  const ambiente = config.get('NODE_ENV', { infer: true });

  configurarHttp(app, {
    NODE_ENV: ambiente,
    WEB_ORIGIN: config.get('WEB_ORIGIN', { infer: true }),
    TRUSTED_PROXY_IPS: config.get('TRUSTED_PROXY_IPS', { infer: true }),
  });

  try {
    await app.listen(porta);
  } catch (erro) {
    await app.close().catch(() => {});
    throw erro;
  }
  app.flushLogs();
  Logger.log(`SolarSystem API na porta ${porta} (${ambiente})`, 'Bootstrap');
}
void bootstrap().catch(() => {
  Logger.detachBuffer();
  Logger.error('Falha ao iniciar a API. Confira a configuração e a disponibilidade do banco.', 'Bootstrap');
  process.exitCode = 1;
});

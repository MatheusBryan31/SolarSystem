import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // disponível em todos os módulos, sem importar de novo
      validate: validateEnv, // roda o Zod na partida
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { UsersModule } from './users/users.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { PlantsModule } from './plants/plants.module';
import { AlertsModule } from './alerts/alerts.module';
import { InvertersModule } from './inverters/inverters.module';
import { MeasurementsModule } from './measurements/measurements.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // disponível em todos os módulos, sem importar de novo
      validate: validateEnv, // roda o Zod na partida
    }),
    PrismaModule,
    AuthModule,
    ClientsModule,
    UsersModule,
    IntegrationsModule,
    PlantsModule,
    AlertsModule,
    InvertersModule,
    MeasurementsModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

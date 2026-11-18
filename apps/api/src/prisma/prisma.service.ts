import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Herda tudo do PrismaClient e se encaixa no ciclo de vida do Nest
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect(); // conecta ao subir a API (fail fast de novo!)
  }

  async onModuleDestroy() {
    await this.$disconnect(); // fecha a conexão ao desligar
  }
}

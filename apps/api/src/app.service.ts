import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth() {
    let banco: 'ok' | 'erro' = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      banco = 'erro';
    }
    return {
      status: banco === 'ok' ? 'ok' : 'degradado',
      servico: 'solarsystem-api',
      banco,
      horario: new Date().toISOString(),
    };
  }
}

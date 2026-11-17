import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      servico: 'solarsystem-api',
      horario: new Date().toISOString(),
    };
  }
}

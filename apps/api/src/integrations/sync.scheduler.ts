import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from './integrations.service';

/*
 * O AGENDADOR: o "despertador" que sincroniza todas as integrações ativas,
 * de SYNC_INTERVAL_MIN em SYNC_INTERVAL_MIN minutos, sem ninguém clicar em nada.
 */
@Injectable()
export class SyncScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SyncScheduler.name);
  private timer?: NodeJS.Timeout;
  private rodando = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly config: ConfigService,
  ) {}

  // Ciclo de vida do Nest: roda quando a aplicação terminou de subir
  onApplicationBootstrap() {
    const minutos = this.config.getOrThrow<number>('SYNC_INTERVAL_MIN');
    if (minutos === 0) {
      this.logger.log('Coleta automática DESLIGADA (SYNC_INTERVAL_MIN=0)');
      return;
    }
    this.logger.log(`Coleta automática a cada ${minutos} min`);
    void this.executar(); // uma coleta logo na partida...
    this.timer = setInterval(() => void this.executar(), minutos * 60_000); // ...e depois, no intervalo
  }

  // ...e quando ela está desligando: sem isso, o timer seguraria o processo aberto
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async executar() {
    // Trava anti-sobreposição: se o ciclo anterior ainda não terminou (plataforma lenta), pula
    if (this.rodando) {
      this.logger.warn('Ciclo anterior ainda em andamento; pulando este');
      return;
    }
    this.rodando = true;
    try {
      const integracoes = await this.prisma.integration.findMany({
        where: { enabled: true, archivedAt: null },
        select: { id: true },
      });
      for (const integracao of integracoes) {
        // Uma integração com problema NÃO pode impedir as outras de sincronizar
        try {
          const r = await this.integrations.sincronizar(integracao.id);
          this.logger.log(
            `Integração ${integracao.id}: ${r.usinasSincronizadas} usinas | alertas: ` +
              `${r.alertas.abertos} abertos, ${r.alertas.resolvidos} resolvidos`,
          );
        } catch {
          this.logger.error(`Falha de sincronização da integração ${integracao.id}`);
        }
      }
    } catch {
      this.logger.error('Falha ao consultar integrações para sincronização');
    } finally {
      this.rodando = false; // o finally roda MESMO se der erro: a trava nunca fica presa
    }
  }
}

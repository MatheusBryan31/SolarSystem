import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AlertsService } from '../alerts/alerts.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderRegistry } from '../providers/provider-registry';
import { ErroDaPlataforma, type Credenciais, type UsinaLida } from '../providers/provider.types';
import type { CriarIntegracaoDto } from './integrations.schemas';

// O que pode sair da API. As credenciais NÃO estão aqui: senha de plataforma não volta para a tela.
const camposPublicos = {
  id: true,
  provider: true,
  name: true,
  enabled: true,
  lastSyncAt: true,
  lastError: true,
  createdAt: true,
  _count: { select: { plants: true } }, // quantas usinas essa integração trouxe
} as const;

const mensagemDe = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro));

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry,
    private readonly alerts: AlertsService,
  ) {}

  listar() {
    return this.prisma.integration.findMany({ select: camposPublicos, orderBy: { name: 'asc' } });
  }

  async criar(dados: CriarIntegracaoDto) {
    // Só salva credenciais que FUNCIONAM: testa antes de gravar
    try {
      await this.registry.obter(dados.provider).testarConexao(dados.credentials);
    } catch (erro) {
      if (erro instanceof ErroDaPlataforma) {
        throw new BadRequestException(`Não foi possível conectar: ${erro.message}`);
      }
      throw erro;
    }
    return this.prisma.integration.create({ data: dados, select: camposPublicos });
  }

  // Busca as usinas na plataforma, grava/atualiza no banco e avalia os alertas
  async sincronizar(id: string) {
    const integracao = await this.prisma.integration.findUnique({ where: { id } });
    if (!integracao) throw new NotFoundException('Integração não encontrada');

    const adaptador = this.registry.obter(integracao.provider);
    const agora = new Date();

    // ETAPA 1: falar com a plataforma e gravar. Só ESTA parte é "falha de sincronização".
    let usinas: UsinaLida[];
    try {
      usinas = await adaptador.listarUsinas(integracao.credentials as Credenciais, agora);

      // UPSERT = "update or insert": se a usina já existe (mesma integração + mesmo externalId),
      // atualiza; senão, cria. Rodar duas vezes NÃO duplica (operação idempotente).
      // O update não mexe no clientId: o vínculo feito por uma pessoa é preservado.
      await this.prisma.$transaction(
        usinas.map((usina) =>
          this.prisma.plant.upsert({
            where: { integrationId_externalId: { integrationId: id, externalId: usina.externalId } },
            create: { ...usina, integrationId: id },
            update: usina,
          }),
        ),
      );
    } catch (erro) {
      // Registra a falha para aparecer na tela e abre um alerta SYNC_FAILED
      await this.prisma.integration.update({
        where: { id },
        data: { lastSyncAt: agora, lastError: mensagemDe(erro) },
      });
      await this.alerts.registrarFalhaDeSincronizacao(id, integracao.name, mensagemDe(erro));
      throw new BadGatewayException(`Falha ao sincronizar: ${mensagemDe(erro)}`); // 502
    }

    // ETAPA 2: deu certo. Limpa o erro anterior e avalia os alertas com os dados novos.
    await this.prisma.integration.update({ where: { id }, data: { lastSyncAt: agora, lastError: null } });
    const falhasResolvidas = await this.alerts.resolverFalhaDeSincronizacao(id, agora);
    const alertas = await this.alerts.avaliarUsinas(id, agora);
    return {
      usinasSincronizadas: usinas.length,
      alertas: { abertos: alertas.abertos, resolvidos: alertas.resolvidos + falhasResolvidas },
    };
  }
}

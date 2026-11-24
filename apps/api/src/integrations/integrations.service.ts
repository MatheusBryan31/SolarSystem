import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlertsService } from '../alerts/alerts.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderRegistry } from '../providers/provider-registry';
import { ErroDaPlataforma, type Credenciais, type UsinaLida } from '../providers/provider.types';
import type { CriarIntegracaoDto } from './integrations.schemas';
import type { EstadoIntegracaoDto } from './integrations.schemas';
import { catalogTransaction } from '../plants/catalog-transaction';
import { PlantCatalogService } from '../plants/plant-catalog.service';
import { snapshot, snapshotSchema } from '../plants/plant-domain';

// O que pode sair da API. As credenciais NÃO estão aqui: senha de plataforma não volta para a tela.
const camposPublicos = {
  id: true,
  provider: true,
  name: true,
  enabled: true,
  archivedAt: true,
  revision: true,
  lastSyncAt: true,
  lastError: true,
  createdAt: true,
  _count: { select: { plants: true } }, // quantas usinas essa integração trouxe
} as const;

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry,
    private readonly alerts: AlertsService,
    private readonly catalog: PlantCatalogService,
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
        throw new BadRequestException(
          'Não foi possível conectar à plataforma. Confira os dados da integração.',
        );
      }
      throw erro;
    }
    return this.prisma.integration.create({ data: dados, select: camposPublicos });
  }

  // Busca as usinas na plataforma, grava/atualiza no banco e avalia os alertas
  async sincronizar(id: string) {
    const integracao = await this.prisma.integration.findUnique({ where: { id } });
    if (!integracao) throw new NotFoundException('Integração não encontrada');
    if (!integracao.enabled || integracao.archivedAt)
      throw new BadRequestException('Integração pausada ou arquivada');

    const adaptador = this.registry.obter(integracao.provider);
    const agora = new Date();

    // ETAPA 1: falar com a plataforma e gravar. Só ESTA parte é "falha de sincronização".
    let usinas: UsinaLida[];
    try {
      usinas = await adaptador.listarUsinas(integracao.credentials as Credenciais, agora);
    } catch {
      // Registra a falha para aparecer na tela e abre um alerta SYNC_FAILED
      await catalogTransaction(this.prisma, async (tx) => {
        const current = await tx.integration.findUnique({ where: { id } });
        if (!current?.enabled || current.archivedAt || current.revision !== integracao.revision) return;
        // Mensagem do provedor pode conter credenciais. Nunca persistir/devolver o erro bruto.
        await tx.integration.update({
          where: { id },
          data: { lastSyncAt: agora, lastError: 'Falha na coleta da plataforma' },
        });
        const active = await tx.alert.findFirst({
          where: { integrationId: id, type: 'SYNC_FAILED', status: { not: 'RESOLVED' } },
        });
        if (!active)
          await tx.alert.create({
            data: {
              integrationId: id,
              type: 'SYNC_FAILED',
              severity: 'WARNING',
              message: 'Falha na coleta da plataforma',
            },
          });
      });
      throw new BadGatewayException('Falha ao coletar os dados da plataforma');
    }

    const snapshots = usinas.map((value) => snapshot(value, agora));
    if (new Set(snapshots.map((value) => value.externalId)).size !== snapshots.length)
      throw new BadRequestException('Identidades duplicadas no lote');
    return catalogTransaction(this.prisma, async (tx) => {
      const current = await tx.integration.findUnique({ where: { id } });
      if (!current?.enabled || current.archivedAt || current.revision !== integracao.revision)
        throw new ConflictException(
          'Integração ou vínculos alterados durante a coleta. Sincronize novamente.',
        );
      let updated = 0,
        pending = 0,
        reserved = 0;
      for (const value of snapshots) {
        const result = await this.catalog.apply(tx, id, value, agora);
        if (result === 'updated') updated++;
        else if (result === 'pending') pending++;
        else if (result === 'reserved') reserved++;
      }
      await tx.integration.update({
        where: { id },
        data: { lastSyncAt: agora, lastError: null, revision: { increment: 1 } },
      });
      const resolved = await tx.alert.updateMany({
        where: { integrationId: id, type: 'SYNC_FAILED', status: { not: 'RESOLVED' } },
        data: { status: 'RESOLVED', resolvedAt: agora },
      });
      const alerts = await this.alerts.avaliarUsinasTx(tx, id, agora);
      return {
        usinasSincronizadas: updated,
        descobertasPendentes: pending,
        identidadesReservadas: reserved,
        alertas: { abertos: alerts.abertos, resolvidos: alerts.resolvidos + resolved.count },
      };
    });
  }

  async estado(id: string, input: EstadoIntegracaoDto) {
    return catalogTransaction(this.prisma, async (tx) => {
      const current = await tx.integration.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Integração não encontrada');
      if (current.revision !== input.revision)
        throw new ConflictException('Integração alterada. Recarregue os dados.');
      if (current.archivedAt && input.enabled)
        throw new BadRequestException('Integração arquivada não pode ser reativada');
      return tx.integration.update({
        where: { id },
        data: {
          enabled: input.archive ? false : input.enabled,
          archivedAt: input.archive ? new Date() : undefined,
          revision: { increment: 1 },
        },
        select: camposPublicos,
      });
    });
  }

  async descobertas(id: string, pagina: number, porPagina: number) {
    if (!(await this.prisma.integration.findUnique({ where: { id }, select: { id: true } })))
      throw new NotFoundException('Integração não encontrada');
    const where = { integrationId: id, resolvedAt: null };
    const [total, itens] = await this.prisma.$transaction([
      this.prisma.plantDiscovery.count({ where }),
      this.prisma.plantDiscovery.findMany({
        where,
        orderBy: [{ observedAt: 'desc' }, { id: 'asc' }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);
    return { itens, total, pagina, porPagina };
  }

  async importar(id: string, discoveryId: string, revision: number, actorId: string) {
    return catalogTransaction(this.prisma, async (tx) => {
      const integration = await tx.integration.findUnique({ where: { id } });
      if (!integration?.enabled || integration.archivedAt)
        throw new BadRequestException('Integração indisponível');
      const discovery = await tx.plantDiscovery.findFirst({ where: { id: discoveryId, integrationId: id } });
      if (!discovery) throw new NotFoundException('Descoberta não encontrada');
      if (discovery.resolvedAt) return { plantId: discovery.plantId, alreadyResolved: true };
      if (discovery.revision !== revision)
        throw new ConflictException('Descoberta alterada. Revise os dados.');
      const value = snapshotSchema.parse(discovery.snapshot);
      const result = await this.catalog.apply(tx, id, value, new Date(), true, actorId);
      if (result === 'reserved')
        throw new ConflictException('Identidade reservada. Reconecte a usina original.');
      const link = await tx.plantExternalLink.findUniqueOrThrow({
        where: { integrationId_externalId: { integrationId: id, externalId: value.externalId } },
      });
      await tx.plantDiscovery.update({
        where: { id: discoveryId },
        data: { resolvedAt: new Date(), plantId: link.plantId },
      });
      await tx.integration.update({ where: { id }, data: { revision: { increment: 1 } } });
      return { plantId: link.plantId, alreadyResolved: false };
    });
  }
}

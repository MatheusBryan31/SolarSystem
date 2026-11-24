import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { avaliarUsina } from './alert-rules';
import { catalogTransaction } from '../plants/catalog-transaction';
import { TELEMETRY_MAX_AGE_MS } from '../plants/plant-domain';
import type { ListarAlertasDto } from './alerts.schemas';

const incluir = {
  plant: { select: { id: true, name: true } },
  integration: { select: { id: true, name: true } },
  acknowledgedBy: { select: { id: true, name: true } },
} as const;

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  /*
   * Compara "o que as regras dizem AGORA" com "os alertas que já estão ativos":
   *  - condição nova, sem alerta ativo  -> ABRE um alerta
   *  - condição que continua            -> não faz nada (não duplica, não spamma)
   *  - alerta ativo cuja condição sumiu -> RESOLVE automaticamente
   */
  async avaliarUsinas(integrationId: string, agora: Date) {
    return catalogTransaction(this.prisma, (tx) => this.avaliarUsinasTx(tx, integrationId, agora));
  }

  async avaliarUsinasTx(tx: Prisma.TransactionClient, integrationId: string, agora: Date) {
    const usinas = await tx.plant.findMany({
      where: {
        externalLinks: {
          some: { integrationId, state: 'ACTIVE', integration: { enabled: true, archivedAt: null } },
        },
      },
      select: { id: true, name: true, status: true, lastDataAt: true },
    });
    const ativos = await tx.alert.findMany({
      where: { plantId: { in: usinas.map((u) => u.id) }, status: { not: 'RESOLVED' } },
      select: { id: true, plantId: true, type: true },
    });

    const abrir: Prisma.AlertCreateManyInput[] = [];
    const resolver: string[] = [];
    for (const usina of usinas) {
      const condicoes = avaliarUsina(usina, agora);
      const ativosDaUsina = ativos.filter((a) => a.plantId === usina.id);

      for (const c of condicoes) {
        if (!ativosDaUsina.some((a) => a.type === c.tipo)) {
          abrir.push({ plantId: usina.id, type: c.tipo, severity: c.severidade, message: c.mensagem });
        }
      }
      for (const a of ativosDaUsina) {
        const leituraConfiavel =
          usina.lastDataAt &&
          usina.status !== 'UNKNOWN' &&
          agora.getTime() - usina.lastDataAt.getTime() <= TELEMETRY_MAX_AGE_MS;
        if (leituraConfiavel && !condicoes.some((c) => c.tipo === a.type)) resolver.push(a.id);
      }
    }

    await tx.alert.createMany({ data: abrir });
    await tx.alert.updateMany({
      where: { id: { in: resolver } },
      data: { status: 'RESOLVED', resolvedAt: agora },
    });
    return { abertos: abrir.length, resolvidos: resolver.length };
  }

  // A sincronização falhou: abre UM alerta (se já houver um ativo, não duplica)
  async registrarFalhaDeSincronizacao(integrationId: string, nome: string, erro: string) {
    const ativo = await this.prisma.alert.findFirst({
      where: { integrationId, type: 'SYNC_FAILED', status: { not: 'RESOLVED' } },
    });
    if (ativo) return;
    await this.prisma.alert.create({
      data: {
        integrationId,
        type: 'SYNC_FAILED',
        severity: 'WARNING',
        message: `Falha ao sincronizar a integração ${nome}: ${erro}`,
      },
    });
  }

  // A sincronização voltou a funcionar: resolve o alerta de falha, se houver
  async resolverFalhaDeSincronizacao(integrationId: string, agora: Date) {
    const { count } = await this.prisma.alert.updateMany({
      where: { integrationId, type: 'SYNC_FAILED', status: { not: 'RESOLVED' } },
      data: { status: 'RESOLVED', resolvedAt: agora },
    });
    return count;
  }

  async listar({ status, ativos, pagina, porPagina }: ListarAlertasDto, usuario: UsuarioAutenticado) {
    const where: Prisma.AlertWhereInput = {};
    if (status) where.status = status;
    if (ativos) where.status = { not: 'RESOLVED' };
    // Isolamento: CLIENT só vê alertas das PRÓPRIAS usinas.
    // (Alertas de integração não têm usina, então o cliente nem os enxerga: são assunto interno.)
    if (usuario.role === Role.CLIENT) {
      where.plant = { clientId: usuario.clientId ?? '00000000-0000-0000-0000-000000000000' };
    }

    const [total, itens] = await this.prisma.$transaction([
      this.prisma.alert.count({ where }),
      this.prisma.alert.findMany({
        where,
        include: incluir,
        orderBy: { openedAt: 'desc' }, // os mais recentes primeiro
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);
    return { itens, total, pagina, porPagina };
  }

  // "Reconhecer" = alguém da equipe viu e assumiu o problema
  async reconhecer(id: string, usuario: UsuarioAutenticado) {
    const alerta = await this.prisma.alert.findUnique({ where: { id } });
    if (!alerta) throw new NotFoundException('Alerta não encontrado');
    if (alerta.status === 'RESOLVED') throw new BadRequestException('Este alerta já foi resolvido');
    return this.prisma.alert.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), acknowledgedById: usuario.id },
      include: incluir,
    });
  }
}

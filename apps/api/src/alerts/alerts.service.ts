import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { avaliarUsina } from './alert-rules';
import { catalogTransaction } from '../plants/catalog-transaction';
import { DEFAULT_POLICY, generationCondition } from './alert-policy';
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
      select: {
        id: true,
        name: true,
        status: true,
        lastDataAt: true,
        capacityKwp: true,
        externalLinks: {
          where: { state: 'ACTIVE' },
          select: { id: true, linkedAt: true, integration: { select: { provider: true } } },
        },
        alertPolicy: true,
      },
    });
    const ativos = await tx.alert.findMany({
      where: { plantId: { in: usinas.map((u) => u.id) }, status: { not: 'RESOLVED' } },
      select: { id: true, plantId: true, type: true },
    });

    const abrir: Prisma.AlertCreateManyInput[] = [];
    const resolver: string[] = [];
    for (const usina of usinas) {
      const policy = usina.alertPolicy ?? DEFAULT_POLICY;
      const condicoes = avaliarUsina(usina, agora, policy.communicationMinutes);
      let generation: ReturnType<typeof generationCondition> = null;
      const link = usina.externalLinks[0];
      if (
        !usina.lastDataAt &&
        link?.linkedAt &&
        agora.getTime() - link.linkedAt.getTime() < policy.communicationMinutes * 60000
      ) {
        const index = condicoes.findIndex((c) => c.tipo === 'PLANT_OFFLINE');
        if (index >= 0) condicoes.splice(index, 1);
      }
      if (policy.generationEnabled && link) {
        const samples = await tx.measurement.findMany({
          where: {
            plantId: usina.id,
            sourceLinkId: link.id,
            inverterId: null,
            measuredAt: { gte: new Date(agora.getTime() - 24 * 3600000), lte: agora },
          },
          orderBy: { measuredAt: 'desc' },
          take: 1000,
          select: { measuredAt: true, powerKw: true, quality: true, isSimulated: true },
        });
        generation = generationCondition(samples, usina.capacityKwp, policy, agora);
        if (generation === 'LOW' || generation === 'HIGH')
          condicoes.push({
            tipo: 'GENERATION_ABNORMAL',
            severidade: 'WARNING',
            mensagem: `Geração da usina ${usina.name} ${generation === 'LOW' ? 'abaixo' : 'acima'} do limite configurado por pelo menos ${policy.durationMinutes} minutos`,
          });
      }
      const ativosDaUsina = ativos.filter((a) => a.plantId === usina.id);

      for (const c of condicoes) {
        if (!ativosDaUsina.some((a) => a.type === c.tipo)) {
          abrir.push({
            plantId: usina.id,
            type: c.tipo,
            severity: c.severidade,
            message: c.mensagem,
            isSimulated: link?.integration.provider === 'DEMO',
          });
        }
      }
      for (const a of ativosDaUsina) {
        const leituraConfiavel =
          usina.lastDataAt &&
          usina.status !== 'UNKNOWN' &&
          agora.getTime() >= usina.lastDataAt.getTime() &&
          agora.getTime() - usina.lastDataAt.getTime() <= policy.communicationMinutes * 60000;
        if (
          leituraConfiavel &&
          !condicoes.some((c) => c.tipo === a.type) &&
          (a.type !== 'GENERATION_ABNORMAL' || generation === 'NORMAL') &&
          (a.type !== 'PLANT_FAULT' || usina.status === 'ONLINE' || usina.status === 'WARNING')
        )
          resolver.push(a.id);
      }
    }

    const created = await tx.alert.createMany({ data: abrir, skipDuplicates: true });
    await tx.alert.updateMany({
      where: { id: { in: resolver }, status: { not: 'RESOLVED' } },
      data: { status: 'RESOLVED', resolvedAt: agora, resolutionReason: 'AUTO_RECOVERY' },
    });
    return { abertos: created.count, resolvidos: resolver.length };
  }

  // A sincronização falhou: abre UM alerta (se já houver um ativo, não duplica)
  async registrarFalhaDeSincronizacao(integrationId: string) {
    return catalogTransaction(this.prisma, async (tx) => {
      const ativo = await tx.alert.findFirst({
        where: { integrationId, type: 'SYNC_FAILED', status: { not: 'RESOLVED' } },
      });
      if (ativo) return;
      const integration = await tx.integration.findUniqueOrThrow({
        where: { id: integrationId },
        select: { provider: true },
      });
      await tx.alert.create({
        data: {
          integrationId,
          type: 'SYNC_FAILED',
          severity: 'WARNING',
          message: 'Falha na coleta da plataforma',
          isSimulated: integration.provider === 'DEMO',
        },
      });
    });
  }

  // A sincronização voltou a funcionar: resolve o alerta de falha, se houver
  async resolverFalhaDeSincronizacao(integrationId: string, agora: Date) {
    const { count } = await this.prisma.alert.updateMany({
      where: { integrationId, type: 'SYNC_FAILED', status: { not: 'RESOLVED' } },
      data: { status: 'RESOLVED', resolvedAt: agora, resolutionReason: 'AUTO_RECOVERY' },
    });
    return count;
  }

  async listar(
    { status, ativos, pagina, porPagina, type, plantId }: ListarAlertasDto,
    usuario: UsuarioAutenticado,
  ) {
    const where: Prisma.AlertWhereInput = {};
    if (type) where.type = type;
    if (plantId) where.plantId = plantId;
    if (status) where.status = status;
    if (ativos) where.status = { not: 'RESOLVED' };
    // Isolamento: CLIENT só vê alertas das PRÓPRIAS usinas.
    // (Alertas de integração não têm usina, então o cliente nem os enxerga: são assunto interno.)
    if (usuario.role === Role.CLIENT) {
      if (!usuario.clientId) return { itens: [], total: 0, pagina, porPagina };
      where.plant = { clientId: usuario.clientId };
      where.AND = [{ type: { in: ['PLANT_OFFLINE', 'PLANT_FAULT', 'GENERATION_ABNORMAL'] } }];
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
    return {
      itens: itens.map((item) => ({
        ...item,
        ...(usuario.role === Role.CLIENT
          ? { integrationId: null, integration: null, acknowledgedById: null, acknowledgedBy: null }
          : {}),
        ...(item.type === 'SYNC_FAILED' ? { message: 'Falha na coleta da plataforma' } : {}),
      })),
      total,
      pagina,
      porPagina,
    };
  }

  // "Reconhecer" = alguém da equipe viu e assumiu o problema
  async reconhecer(id: string, usuario: UsuarioAutenticado) {
    if (usuario.role === Role.CLIENT) throw new ForbiddenException('Perfil sem permissão');
    return catalogTransaction(this.prisma, async (tx) => {
      const alerta = await tx.alert.findUnique({ where: { id }, include: incluir });
      if (!alerta) throw new NotFoundException('Alerta não encontrado');
      if (alerta.status === 'RESOLVED') throw new BadRequestException('Este alerta já foi resolvido');
      if (alerta.status === 'ACKNOWLEDGED') return alerta;
      const atualizado = await tx.alert.update({
        where: { id },
        data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), acknowledgedById: usuario.id },
        include: incluir,
      });
      return atualizado.type === 'SYNC_FAILED'
        ? { ...atualizado, message: 'Falha na coleta da plataforma' }
        : atualizado;
    });
  }

  async historico(id: string, user: UsuarioAutenticado, pagina: number, porPagina: number) {
    const scope: Prisma.AlertWhereInput =
      user.role === Role.CLIENT
        ? {
            plant: { clientId: user.clientId ?? '' },
            type: { in: ['PLANT_OFFLINE', 'PLANT_FAULT', 'GENERATION_ABNORMAL'] },
          }
        : {};
    if (user.role === Role.CLIENT && !user.clientId) throw new NotFoundException('Alerta não encontrado');
    if (!(await this.prisma.alert.findFirst({ where: { id, ...scope }, select: { id: true } })))
      throw new NotFoundException('Alerta não encontrado');
    const where = { alertId: id, ...(user.role === Role.CLIENT ? { alert: scope } : {}) };
    const [total, itens] = await this.prisma.$transaction([
      this.prisma.alertEvent.count({ where }),
      this.prisma.alertEvent.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        select: {
          id: true,
          status: true,
          createdAt: true,
          reason: true,
          isSimulated: true,
          ...(user.role !== Role.CLIENT ? { actorId: true } : {}),
        },
      }),
    ]);
    return { itens, total, pagina, porPagina };
  }

  async resolver(id: string, reason: string, user: UsuarioAutenticado) {
    if (user.role === Role.CLIENT) throw new ForbiddenException('Perfil sem permissão');
    return catalogTransaction(this.prisma, async (tx) => {
      const alert = await tx.alert.findUnique({
        where: { id },
        include: {
          plant: {
            include: {
              alertPolicy: true,
              externalLinks: {
                where: { state: 'ACTIVE' },
                select: { id: true, integration: { select: { enabled: true, archivedAt: true } } },
              },
            },
          },
          integration: true,
        },
      });
      if (!alert) throw new NotFoundException('Alerta não encontrado');
      if (alert.status === 'RESOLVED') return { id, status: alert.status };
      if (
        alert.type === 'SYNC_FAILED' &&
        alert.integration?.enabled &&
        !alert.integration.archivedAt &&
        alert.integration.lastError
      )
        throw new ConflictException('A integração ainda apresenta falha');
      const plant = alert.plant,
        policy = plant?.alertPolicy ?? DEFAULT_POLICY;
      if (plant && plant.externalLinks.some((l) => l.integration.enabled && !l.integration.archivedAt)) {
        if (alert.type === 'GENERATION_ABNORMAL' && policy.generationEnabled)
          throw new ConflictException(
            'Aguarde recuperação sustentada ou revise a política antes de encerrar',
          );
        if (avaliarUsina(plant, new Date(), policy.communicationMinutes).some((c) => c.tipo === alert.type))
          throw new ConflictException('A condição do alerta ainda persiste');
        if (
          ['PLANT_FAULT', 'PLANT_OFFLINE'].includes(alert.type) &&
          (!plant.lastDataAt ||
            plant.lastDataAt.getTime() > Date.now() ||
            plant.status === 'UNKNOWN' ||
            (alert.type === 'PLANT_FAULT' && !['ONLINE', 'WARNING'].includes(plant.status)) ||
            Date.now() - plant.lastDataAt.getTime() > policy.communicationMinutes * 60000)
        )
          throw new ConflictException('Sem evidência de recuperação');
      }
      return tx.alert.update({
        where: { id },
        data: { status: 'RESOLVED', resolvedAt: new Date(), resolutionReason: reason },
        select: { id: true, status: true },
      });
    });
  }
}

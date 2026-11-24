import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { aggregateReadings } from './measurement-aggregation';
import type { AggregationQuery, HistoryQuery } from './measurements.schemas';

@Injectable()
export class MeasurementsService {
  constructor(private readonly prisma: PrismaService) {}

  private async scope(
    plantId: string,
    user: UsuarioAutenticado,
    input: { inverterId?: string; sourceLinkId?: string; includeSimulated: boolean },
  ) {
    if (user.role === Role.CLIENT && !user.clientId) throw new NotFoundException('Usina não encontrada');
    const plant = await this.prisma.plant.findFirst({
      where: { id: plantId, ...(user.role === Role.CLIENT ? { clientId: user.clientId } : {}) },
      select: { id: true },
    });
    if (!plant) throw new NotFoundException('Usina não encontrada');
    if (
      input.inverterId &&
      !(await this.prisma.inverter.findFirst({
        where: { id: input.inverterId, plantId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Inversor não encontrado');
    if (
      input.sourceLinkId &&
      !(await this.prisma.plantExternalLink.findFirst({
        where: { id: input.sourceLinkId, plantId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Fonte não encontrada');
    return {
      plantId,
      inverterId: input.inverterId ?? null,
      ...(input.sourceLinkId ? { sourceLinkId: input.sourceLinkId } : {}),
      ...(input.includeSimulated ? {} : { isSimulated: false }),
      ...(user.role === Role.CLIENT ? { plant: { clientId: user.clientId } } : {}),
    } satisfies Prisma.MeasurementWhereInput;
  }

  async history(plantId: string, input: HistoryQuery, user: UsuarioAutenticado) {
    const where: Prisma.MeasurementWhereInput = {
      ...(await this.scope(plantId, user, input)),
      measuredAt: { gte: new Date(input.from), lt: new Date(input.to) },
    };
    const [total, itens] = await this.prisma.$transaction([
      this.prisma.measurement.count({ where }),
      this.prisma.measurement.findMany({
        where,
        orderBy: [{ measuredAt: 'asc' }, { id: 'asc' }],
        skip: (input.pagina - 1) * input.porPagina,
        take: input.porPagina,
      }),
    ]);
    return { itens, total, pagina: input.pagina, porPagina: input.porPagina };
  }

  async aggregate(plantId: string, input: AggregationQuery, user: UsuarioAutenticado) {
    const scope = await this.scope(plantId, user, input);
    const from = new Date(input.from),
      to = new Date(input.to);
    const rows = await this.prisma.measurement.findMany({
      where: {
        ...scope,
        OR: [{ measuredAt: { gte: from, lt: to } }, { periodStartAt: { lt: to }, measuredAt: { gt: from } }],
      },
      orderBy: [{ measuredAt: 'asc' }, { id: 'asc' }],
      take: 50001,
    });
    if (rows.length > 50000)
      throw new UnprocessableEntityException('Intervalo excede 50000 medições; reduza o período');
    return {
      from: input.from,
      to: input.to,
      period: input.period,
      timeZone: input.timeZone,
      sourceLinkId: input.sourceLinkId,
      inverterId: input.inverterId ?? null,
      includesSimulated: input.includeSimulated,
      buckets: aggregateReadings(rows, input),
    };
  }
}

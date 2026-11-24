import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import type { ListarUsinasDto } from './plants.schemas';
import type {
  CriarUsinaDto,
  EditarUsinaDto,
  VincularPlataformaDto,
  DesvincularPlataformaDto,
} from './plants.schemas';
import { catalogTransaction } from './catalog-transaction';
import { includePlant, plantDto } from './plant-dto';
import { PlantCatalogService } from './plant-catalog.service';
import {
  json,
  metadata,
  metadataSchema,
  NO_TELEMETRY,
  readOverrides,
  readMetadata,
  project,
  TELEMETRY_MAX_AGE_MS,
} from './plant-domain';

const incluir = includePlant;

@Injectable()
export class PlantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: PlantCatalogService,
  ) {}

  // O MESMO isolamento da aula 12: CLIENT só enxerga as usinas do próprio cliente
  private filtroDoUsuario(usuario: UsuarioAutenticado): Prisma.PlantWhereInput {
    if (usuario.role !== Role.CLIENT) return {};
    // CLIENT sem cliente vinculado: um id impossível garante lista vazia
    return { clientId: usuario.clientId ?? '00000000-0000-0000-0000-000000000000' };
  }

  async listar({ busca, status, pagina, porPagina }: ListarUsinasDto, usuario: UsuarioAutenticado) {
    const where: Prisma.PlantWhereInput = { ...this.filtroDoUsuario(usuario) };
    if (status) {
      const fresh: Prisma.PlantWhereInput = {
        integration: { enabled: true, archivedAt: null },
        lastDataAt: { gte: new Date(Date.now() - TELEMETRY_MAX_AGE_MS) },
      };
      where.AND =
        status === 'UNKNOWN'
          ? [
              {
                OR: [
                  { status: 'UNKNOWN' },
                  { integrationId: null },
                  { lastDataAt: null },
                  { lastDataAt: { lt: new Date(Date.now() - TELEMETRY_MAX_AGE_MS) } },
                  { integration: { enabled: false } },
                  { integration: { archivedAt: { not: null } } },
                ],
              },
            ]
          : [fresh, { status }];
    }
    if (busca) {
      where.OR = [
        { name: { contains: busca, mode: 'insensitive' } },
        { city: { contains: busca, mode: 'insensitive' } },
      ];
    }
    const [total, itens] = await this.prisma.$transaction([
      this.prisma.plant.count({ where }),
      this.prisma.plant.findMany({
        where,
        include: incluir,
        orderBy: { name: 'asc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);
    return { itens: itens.map((item) => plantDto(item)), total, pagina, porPagina };
  }

  async buscarPorId(id: string, usuario: UsuarioAutenticado) {
    // findFirst (e não findUnique) porque o where combina o id COM o filtro do usuário.
    // Usina de outro cliente = 404, como na aula 12.
    const usina = await this.prisma.plant.findFirst({
      where: { id, ...this.filtroDoUsuario(usuario) },
      include: incluir,
    });
    if (!usina) throw new NotFoundException('Usina não encontrada');
    return plantDto(usina);
  }

  async vincularCliente(id: string, clientId: string | null, usuario: UsuarioAutenticado) {
    await this.buscarPorId(id, usuario); // 404 se não existir
    if (clientId) {
      const cliente = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
      if (!cliente) throw new BadRequestException('O cliente informado não existe');
    }
    return catalogTransaction(this.prisma, async (tx) => {
      const updated = await tx.plant.update({
        where: { id },
        data: { clientId, revision: { increment: 1 } },
        include: incluir,
      });
      await this.catalog.audit(tx, id, usuario.id, 'CLIENT', { clientId });
      return plantDto(updated);
    });
  }

  async criar(input: CriarUsinaDto, user: UsuarioAutenticado) {
    const { clientId, ...overrides } = input;
    const effective = metadataSchema.parse({ city: null, state: null, capacityKwp: null, ...overrides });
    return catalogTransaction(this.prisma, async (tx) => {
      if (input.clientId && !(await tx.client.findUnique({ where: { id: input.clientId } })))
        throw new BadRequestException('Cliente não encontrado');
      const plant = await tx.plant.create({
        data: {
          ...effective,
          origin: 'MANUAL',
          clientId,
          manualOverrides: json(overrides),
          ...NO_TELEMETRY,
        },
        include: incluir,
      });
      await this.catalog.audit(tx, plant.id, user.id, 'CREATE', {
        metadata: effective,
        clientId: clientId ?? null,
      });
      return plantDto(plant);
    });
  }

  async editar(id: string, input: EditarUsinaDto, user: UsuarioAutenticado) {
    return catalogTransaction(this.prisma, async (tx) => {
      const plant = await tx.plant.findUnique({ where: { id } });
      if (!plant) throw new NotFoundException('Usina não encontrada');
      if (plant.revision !== input.revision)
        throw new ConflictException('Usina alterada. Recarregue antes de salvar.');
      const { revision, useRemote, ...changes } = input;
      const overrides = { ...readOverrides(plant.manualOverrides), ...changes };
      const link = await tx.plantExternalLink.findFirst({ where: { plantId: id, state: 'ACTIVE' } });
      if (useRemote.length && !link) throw new BadRequestException('Usina sem fonte ativa para esses campos');
      for (const key of useRemote) {
        if (Object.hasOwn(changes, key))
          throw new BadRequestException('Não edite e remova o override do mesmo campo');
        delete overrides[key];
      }
      const remote = link ? readMetadata(link.remoteMetadata) : metadata(plant);
      const effective = project(remote, overrides);
      const updated = await tx.plant.update({
        where: { id },
        data: {
          ...effective,
          manualOverrides: json(overrides),
          revision: { increment: 1 },
        },
        include: incluir,
      });
      await this.catalog.audit(tx, id, user.id, 'EDIT', {
        revision,
        before: metadata(plant),
        after: effective,
        useRemote,
      });
      return plantDto(updated);
    });
  }

  async vincularPlataforma(id: string, input: VincularPlataformaDto, user: UsuarioAutenticado) {
    await catalogTransaction(this.prisma, (tx) => this.catalog.link(tx, id, input, user.id));
    return this.buscarPorId(id, user);
  }

  async vinculos(id: string, user: UsuarioAutenticado) {
    await this.buscarPorId(id, user);
    return this.prisma.plantExternalLink.findMany({
      where: { plantId: id },
      orderBy: { linkedAt: 'desc' },
      select: {
        id: true,
        integrationId: true,
        externalId: true,
        state: true,
        linkedAt: true,
        detachedAt: true,
        integration: { select: { id: true, name: true, enabled: true, archivedAt: true } },
      },
    });
  }

  async desvincularPlataforma(id: string, input: DesvincularPlataformaDto, user: UsuarioAutenticado) {
    await catalogTransaction(this.prisma, async (tx) => {
      const plant = await tx.plant.findUnique({ where: { id } });
      if (!plant) throw new NotFoundException('Usina não encontrada');
      if (plant.revision !== input.revision)
        throw new ConflictException('Usina alterada. Recarregue antes de desvincular.');
      const link = await tx.plantExternalLink.findFirst({ where: { plantId: id, state: 'ACTIVE' } });
      if (!link) throw new BadRequestException('Usina já está sem vínculo ativo');
      await tx.plantExternalLink.update({
        where: { id: link.id },
        data: {
          state: 'DETACHED',
          detachedAt: new Date(),
          revision: { increment: 1 },
        },
      });
      await tx.integration.update({
        where: { id: link.integrationId },
        data: { revision: { increment: 1 } },
      });
      await tx.plant.update({
        where: { id },
        data: {
          integrationId: null,
          externalId: null,
          manualOverrides: json(metadata(plant)),
          ...NO_TELEMETRY,
          lastDataAt: null,
          revision: { increment: 1 },
        },
      });
      await this.catalog.audit(tx, id, user.id, 'DETACH', {
        linkId: link.id,
        reason: input.reason,
        revision: input.revision,
      });
    });
    return this.buscarPorId(id, user);
  }
}

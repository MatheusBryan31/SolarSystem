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
import { checkCoordinates, detailsForDatabase, splitPlantFields } from './plant-details';
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

  async listar({ busca, status, pagina, porPagina }: ListarUsinasDto, usuario: UsuarioAutenticado) {
    const cliente = usuario.role === Role.CLIENT;
    if (cliente && !usuario.clientId) return { itens: [], total: 0, pagina, porPagina };
    const where: Prisma.PlantWhereInput = cliente ? { clientId: usuario.clientId } : {};
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
    return { itens: itens.map((item) => this.projetar(item, cliente)), total, pagina, porPagina };
  }

  async buscarPorId(id: string, usuario: UsuarioAutenticado) {
    // findFirst (e não findUnique) porque o where combina o id COM o filtro do usuário.
    // Usina de outro cliente = 404, como na aula 12.
    const cliente = usuario.role === Role.CLIENT;
    if (cliente && !usuario.clientId) throw new NotFoundException('Usina não encontrada');
    const usina = await this.prisma.plant.findFirst({
      where: { id, ...(cliente ? { clientId: usuario.clientId } : {}) },
      include: incluir,
    });
    if (!usina) throw new NotFoundException('Usina não encontrada');
    return this.projetar(usina, cliente);
  }

  private projetar(usina: Parameters<typeof plantDto>[0], cliente: boolean) {
    const dto = plantDto(usina);
    // Metadados da conta remota são internos. O vínculo próprio continua disponível para medições.
    return cliente
      ? {
          ...dto,
          integrationId: null,
          externalId: null,
          integration: null,
          postalCode: null,
          street: null,
          addressNumber: null,
          addressComplement: null,
          latitude: null,
          longitude: null,
          technicalNotes: null,
        }
      : dto;
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
    const { clientId, ...fields } = input;
    const { metadata: overrides, details } = splitPlantFields(fields);
    checkCoordinates(details);
    const effective = metadataSchema.parse({ city: null, state: null, capacityKwp: null, ...overrides });
    return catalogTransaction(this.prisma, async (tx) => {
      if (input.clientId && !(await tx.client.findUnique({ where: { id: input.clientId } })))
        throw new BadRequestException('Cliente não encontrado');
      const plant = await tx.plant.create({
        data: {
          ...effective,
          ...detailsForDatabase(details),
          origin: 'MANUAL',
          clientId,
          manualOverrides: json(overrides),
          ...NO_TELEMETRY,
        },
        include: incluir,
      });
      await this.catalog.audit(tx, plant.id, user.id, 'CREATE', { clientId: clientId ?? null });
      return plantDto(plant);
    });
  }

  async editar(id: string, input: EditarUsinaDto, user: UsuarioAutenticado) {
    return catalogTransaction(this.prisma, async (tx) => {
      const plant = await tx.plant.findUnique({ where: { id } });
      if (!plant) throw new NotFoundException('Usina não encontrada');
      if (plant.revision !== input.revision)
        throw new ConflictException('Usina alterada. Recarregue antes de salvar.');
      const { revision, useRemote, ...fields } = input;
      const { metadata: changes, details } = splitPlantFields(fields);
      checkCoordinates({ ...plant, ...details });
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
          ...detailsForDatabase(details),
          manualOverrides: json(overrides),
          revision: { increment: 1 },
        },
        include: incluir,
      });
      await this.catalog.audit(tx, id, user.id, 'EDIT', {
        revision,
        fields: [...Object.keys(changes), ...Object.keys(details)],
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
        revision: input.revision,
      });
    });
    return this.buscarPorId(id, user);
  }
}

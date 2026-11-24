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
import { catalogTransaction } from '../plants/catalog-transaction';
import {
  identityKey,
  type CriarInversorDto,
  type EditarInversorDto,
  type RemoverInversorDto,
  type ListarInversoresDto,
} from './inverters.schemas';

// Chaves internas e dados administrativos não fazem parte do DTO público.
const select = {
  id: true,
  plantId: true,
  manufacturer: true,
  model: true,
  serialNumber: true,
  status: true,
  origin: true,
  integrationId: true,
  externalId: true,
  lastCommunicationAt: true,
  revision: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.InverterSelect;

function inverterDto(item: Prisma.InverterGetPayload<{ select: typeof select }>, user: UsuarioAutenticado) {
  return user.role === Role.CLIENT ? { ...item, integrationId: null, externalId: null } : item;
}

@Injectable()
export class InvertersService {
  constructor(private readonly prisma: PrismaService) {}

  private write(user: UsuarioAutenticado, admin = false) {
    if (user.role !== Role.ADMIN && (admin || user.role !== Role.OPERATOR))
      throw new ForbiddenException('Perfil sem permissão para esta operação');
  }

  private async plant(db: Prisma.TransactionClient, plantId: string, user: UsuarioAutenticado) {
    if (user.role === Role.CLIENT && !user.clientId) throw new NotFoundException('Usina não encontrada');
    const plant = await db.plant.findFirst({
      where: {
        id: plantId,
        ...(user.role === Role.CLIENT ? { clientId: user.clientId } : {}),
      },
      select: { id: true },
    });
    if (!plant) throw new NotFoundException('Usina não encontrada');
  }

  async listar(plantId: string, input: ListarInversoresDto, user: UsuarioAutenticado) {
    return this.prisma.$transaction(async (tx) => {
      await this.plant(tx, plantId, user);
      // Reaplica o escopo na consulta, inclusive se o cliente for trocado concorrentemente.
      const where: Prisma.InverterWhereInput = {
        plantId,
        archivedAt: null,
        ...(user.role === Role.CLIENT ? { plant: { clientId: user.clientId } } : {}),
      };
      const total = await tx.inverter.count({ where });
      const itens = await tx.inverter.findMany({
        where,
        select,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (input.pagina - 1) * input.porPagina,
        take: input.porPagina,
      });
      return { itens: itens.map((item) => inverterDto(item, user)), total, ...input };
    });
  }

  async buscar(plantId: string, id: string, user: UsuarioAutenticado) {
    await this.plant(this.prisma, plantId, user);
    const item = await this.prisma.inverter.findFirst({
      where: {
        id,
        plantId,
        archivedAt: null,
        ...(user.role === Role.CLIENT ? { plant: { clientId: user.clientId } } : {}),
      },
      select,
    });
    if (!item) throw new NotFoundException('Inversor não encontrado');
    return inverterDto(item, user);
  }

  async criar(plantId: string, input: CriarInversorDto, user: UsuarioAutenticado) {
    this.write(user);
    return catalogTransaction(this.prisma, async (tx) => {
      await this.plant(tx, plantId, user);
      return tx.inverter.create({
        data: {
          ...input,
          plantId,
          origin: 'MANUAL',
          manufacturerKey: identityKey(input.manufacturer),
          serialKey: identityKey(input.serialNumber),
        },
        select,
      });
    });
  }

  async editar(plantId: string, id: string, input: EditarInversorDto, user: UsuarioAutenticado) {
    this.write(user);
    return catalogTransaction(this.prisma, async (tx) => {
      await this.plant(tx, plantId, user);
      const item = await tx.inverter.findFirst({ where: { id, plantId, archivedAt: null } });
      if (!item) throw new NotFoundException('Inversor não encontrado');
      if (item.revision !== input.revision)
        throw new ConflictException('Inversor alterado. Recarregue os dados.');
      if (item.origin === 'IMPORTED')
        throw new ConflictException('Edição de equipamento importado exige conciliação com a fonte');
      const { revision, ...changes } = input;
      return tx.inverter.update({
        where: { id, revision },
        data: {
          ...changes,
          ...(changes.manufacturer ? { manufacturerKey: identityKey(changes.manufacturer) } : {}),
          ...(changes.serialNumber ? { serialKey: identityKey(changes.serialNumber) } : {}),
          revision: { increment: 1 },
        },
        select,
      });
    });
  }

  async remover(plantId: string, id: string, input: RemoverInversorDto, user: UsuarioAutenticado) {
    this.write(user, true);
    return catalogTransaction(this.prisma, async (tx) => {
      await this.plant(tx, plantId, user);
      const item = await tx.inverter.findFirst({ where: { id, plantId, archivedAt: null } });
      if (!item) throw new NotFoundException('Inversor não encontrado');
      if (item.revision !== input.revision)
        throw new ConflictException('Inversor alterado. Recarregue os dados.');
      if (identityKey(input.confirmSerialNumber) !== item.serialKey)
        throw new BadRequestException('Confirme o número de série do equipamento');
      await tx.inverter.update({
        where: { id, revision: input.revision },
        data: {
          archivedAt: new Date(),
          archiveReason: input.reason,
          archivedById: user.id,
          revision: { increment: 1 },
        },
      });
      return { id, archived: true };
    });
  }
}

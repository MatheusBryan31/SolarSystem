import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import type { ListarUsinasDto } from './plants.schemas';

const incluir = {
  client: { select: { id: true, name: true } },
  integration: { select: { id: true, name: true, provider: true } },
} as const;

@Injectable()
export class PlantsService {
  constructor(private readonly prisma: PrismaService) {}

  // O MESMO isolamento da aula 12: CLIENT só enxerga as usinas do próprio cliente
  private filtroDoUsuario(usuario: UsuarioAutenticado): Prisma.PlantWhereInput {
    if (usuario.role !== Role.CLIENT) return {};
    // CLIENT sem cliente vinculado: um id impossível garante lista vazia
    return { clientId: usuario.clientId ?? '00000000-0000-0000-0000-000000000000' };
  }

  async listar({ busca, status, pagina, porPagina }: ListarUsinasDto, usuario: UsuarioAutenticado) {
    const where: Prisma.PlantWhereInput = { ...this.filtroDoUsuario(usuario) };
    if (status) where.status = status;
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
    return { itens, total, pagina, porPagina };
  }

  async buscarPorId(id: string, usuario: UsuarioAutenticado) {
    // findFirst (e não findUnique) porque o where combina o id COM o filtro do usuário.
    // Usina de outro cliente = 404, como na aula 12.
    const usina = await this.prisma.plant.findFirst({
      where: { id, ...this.filtroDoUsuario(usuario) },
      include: incluir,
    });
    if (!usina) throw new NotFoundException('Usina não encontrada');
    return usina;
  }

  async vincularCliente(id: string, clientId: string | null, usuario: UsuarioAutenticado) {
    await this.buscarPorId(id, usuario); // 404 se não existir
    if (clientId) {
      const cliente = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
      if (!cliente) throw new BadRequestException('O cliente informado não existe');
    }
    return this.prisma.plant.update({ where: { id }, data: { clientId }, include: incluir });
  }
}

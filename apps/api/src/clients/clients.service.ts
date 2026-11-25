import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { ehViolacaoDeUnicidade, relancarErroDeReferencia } from '../common/prisma-errors';
import { transacaoComAuditoria } from '../common/audit-transaction';
import { PrismaService } from '../prisma/prisma.service';
import type { AtualizarClienteDto, CriarClienteDto, ListarClientesDto } from './clients.schemas';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async listar({ busca, pagina, porPagina }: ListarClientesDto, usuario: UsuarioAutenticado) {
    const where: Prisma.ClientWhereInput = {};

    // Isolamento: CLIENT só enxerga o próprio cadastro
    if (usuario.role === Role.CLIENT) {
      if (!usuario.clientId) return { itens: [], total: 0, pagina, porPagina };
      where.id = usuario.clientId;
    }

    if (busca) {
      where.OR = [
        { name: { contains: busca, mode: 'insensitive' } }, // ignora maiúsculas/minúsculas
        { document: { contains: busca } },
        { email: { contains: busca, mode: 'insensitive' } },
      ];
    }

    // Duas consultas numa única ida ao banco: o total (para a paginação) e a página pedida
    const [total, itens] = await this.prisma.$transaction([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);

    return { itens, total, pagina, porPagina };
  }

  async buscarPorId(id: string, usuario?: UsuarioAutenticado) {
    // CLIENT pedindo o cadastro de outro: respondemos 404, como se não existisse
    if (usuario?.role === Role.CLIENT && usuario.clientId !== id) {
      throw new NotFoundException('Cliente não encontrado');
    }
    const cliente = await this.prisma.client.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        document: true,
        email: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    return cliente;
  }

  async criar(dados: CriarClienteDto) {
    try {
      return await transacaoComAuditoria(this.prisma, (tx) => tx.client.create({ data: dados }));
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro)) {
        throw new ConflictException('Já existe um cliente com este CPF/CNPJ');
      }
      relancarErroDeReferencia(erro);
    }
  }

  async atualizar(id: string, dados: AtualizarClienteDto) {
    await this.buscarPorId(id); // garante 404 se não existir
    try {
      return await transacaoComAuditoria(this.prisma, (tx) =>
        tx.client.update({ where: { id }, data: dados }),
      );
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro)) {
        throw new ConflictException('Já existe um cliente com este CPF/CNPJ');
      }
      relancarErroDeReferencia(erro);
    }
  }

  async remover(id: string) {
    try {
      await transacaoComAuditoria(this.prisma, async (tx) => {
        // FOR UPDATE também bloqueia novos vínculos por FK até o commit.
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM clients WHERE id = ${id} FOR UPDATE`;
        if (!rows.length) throw new NotFoundException('Cliente não encontrado');
        const users = await tx.user.count({ where: { clientId: id } });
        const plants = await tx.plant.count({ where: { clientId: id } });
        if (users || plants)
          throw new ConflictException(
            'Cliente possui usuários ou usinas vinculados. Revise os vínculos antes de excluir.',
          );
        await tx.client.delete({ where: { id } });
      });
    } catch (erro) {
      relancarErroDeReferencia(erro);
    }
  }
}

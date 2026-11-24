import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { hash } from 'bcryptjs';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { transacaoComAuditoria } from '../common/audit-transaction';
import { ehViolacaoDeUnicidade } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import type { AtualizarUsuarioDto, CriarUsuarioDto, ListarUsuariosDto } from './users.schemas';

// Lista BRANCA dos campos que podem sair da API. O passwordHash não está aqui, então nunca é lido.
export const camposPublicos = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  clientId: true,
  client: { select: { id: true, name: true } }, // nome do cliente vinculado, útil para a tela
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.UserSelect;

const CUSTO_BCRYPT = 12; // o mesmo do seed

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listar({ busca, role, pagina, porPagina }: ListarUsuariosDto) {
    const where: Prisma.UserWhereInput = {};
    if (role) where.role = role;
    if (busca) {
      where.OR = [
        { name: { contains: busca, mode: 'insensitive' } },
        { email: { contains: busca, mode: 'insensitive' } },
      ];
    }

    const [total, itens] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: camposPublicos,
        orderBy: { name: 'asc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);
    return { itens, total, pagina, porPagina };
  }

  async buscarPorId(id: string) {
    const usuario = await this.prisma.user.findUnique({ where: { id }, select: camposPublicos });
    if (!usuario) throw new NotFoundException('Usuário não encontrado');
    return usuario;
  }

  async criar({ senha, clientId, ...dados }: CriarUsuarioDto) {
    const vinculo = await this.validarVinculo(dados.role, clientId ?? null);
    try {
      const passwordHash = await hash(senha, CUSTO_BCRYPT);
      return await transacaoComAuditoria(this.prisma, (tx) =>
        tx.user.create({
          data: { ...dados, clientId: vinculo, passwordHash },
          select: camposPublicos,
        }),
      );
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro)) throw new ConflictException('Já existe um usuário com este e-mail');
      throw erro;
    }
  }

  async atualizar(
    id: string,
    { senha, clientId, ...dados }: AtualizarUsuarioDto,
    quemPede: UsuarioAutenticado,
  ) {
    const atual = await this.buscarPorId(id); // 404 se não existir

    // Trava anti-tranca: o admin não pode desativar nem rebaixar a si mesmo
    if (id === quemPede.id) {
      if (dados.active === false)
        throw new BadRequestException('Você não pode desativar o seu próprio usuário');
      if (dados.role && dados.role !== Role.ADMIN) {
        throw new BadRequestException('Você não pode remover o seu próprio perfil de administrador');
      }
    }

    // Calcula como o usuário FICARÁ depois da alteração e valida esse estado final
    const roleFinal = dados.role ?? atual.role;
    let clientIdFinal: string | null;
    if (clientId !== undefined)
      clientIdFinal = clientId; // veio no corpo (pode ser null)
    else if (roleFinal !== Role.CLIENT)
      clientIdFinal = null; // deixou de ser CLIENT: desvincula sozinho
    else clientIdFinal = atual.clientId; // continua CLIENT: mantém o vínculo
    const vinculo = await this.validarVinculo(roleFinal, clientIdFinal);

    try {
      const passwordHash = senha ? await hash(senha, CUSTO_BCRYPT) : undefined;
      return await transacaoComAuditoria(this.prisma, (tx) =>
        tx.user.update({
          where: { id },
          data: {
            ...dados,
            clientId: vinculo,
            ...(passwordHash ? { passwordHash, sessionVersion: { increment: 1 } } : {}),
            ...(senha || dados.email !== undefined || dados.active === false
              ? { passwordResetDigest: null, passwordResetExpiresAt: null }
              : {}),
          },
          select: camposPublicos,
        }),
      );
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro)) throw new ConflictException('Já existe um usuário com este e-mail');
      throw erro;
    }
  }

  // Regra: CLIENT precisa de um cliente existente; ADMIN e OPERATOR não podem ter cliente
  private async validarVinculo(role: Role, clientId: string | null): Promise<string | null> {
    if (role !== Role.CLIENT) {
      if (clientId)
        throw new BadRequestException('Apenas usuários com perfil CLIENT podem ter um cliente vinculado');
      return null;
    }
    if (!clientId) throw new BadRequestException('Usuários com perfil CLIENT precisam de um clientId');
    const existe = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!existe) throw new BadRequestException('O cliente informado não existe');
    return clientId;
  }
}

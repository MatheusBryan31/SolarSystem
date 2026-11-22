import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  atualizarUsuarioSchema,
  criarUsuarioSchema,
  listarUsuariosSchema,
  type AtualizarUsuarioDto,
  type CriarUsuarioDto,
  type ListarUsuariosDto,
} from './users.schemas';
import { UsersService } from './users.service';

// @Roles no CONTROLLER vale para todas as rotas abaixo: só ADMIN gerencia usuários
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  listar(@Query(new ZodValidationPipe(listarUsuariosSchema)) filtros: ListarUsuariosDto) {
    return this.usersService.listar(filtros);
  }

  @Get(':id')
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.buscarPorId(id);
  }

  @Post()
  criar(@Body(new ZodValidationPipe(criarUsuarioSchema)) dados: CriarUsuarioDto) {
    return this.usersService.criar(dados);
  }

  // Não existe DELETE: usuário se desativa com { "active": false }, preservando o histórico
  @Patch(':id')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(atualizarUsuarioSchema)) dados: AtualizarUsuarioDto,
    @CurrentUser() quemPede: UsuarioAutenticado,
  ) {
    return this.usersService.atualizar(id, dados, quemPede);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  atualizarClienteSchema,
  criarClienteSchema,
  listarClientesSchema,
  type AtualizarClienteDto,
  type CriarClienteDto,
  type ListarClientesDto,
} from './clients.schemas';
import { ClientsService } from './clients.service';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  listar(
    @Query(new ZodValidationPipe(listarClientesSchema)) filtros: ListarClientesDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.clientsService.listar(filtros, usuario);
  }

  @Get(':id')
  buscar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.clientsService.buscarPorId(id, usuario);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATOR)
  criar(@Body(new ZodValidationPipe(criarClienteSchema)) dados: CriarClienteDto) {
    return this.clientsService.criar(dados);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPERATOR)
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(atualizarClienteSchema)) dados: AtualizarClienteDto,
  ) {
    return this.clientsService.atualizar(id, dados);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(204)
  async remover(@Param('id', ParseUUIDPipe) id: string) {
    await this.clientsService.remover(id);
  }
}

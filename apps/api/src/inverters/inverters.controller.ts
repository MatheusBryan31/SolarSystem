import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { InvertersService } from './inverters.service';
import {
  criarInversorSchema,
  editarInversorSchema,
  removerInversorSchema,
  listarInversoresSchema,
  type CriarInversorDto,
  type EditarInversorDto,
  type RemoverInversorDto,
  type ListarInversoresDto,
} from './inverters.schemas';

@Controller('plants/:plantId/inverters')
export class InvertersController {
  constructor(private readonly service: InvertersService) {}

  @Get()
  listar(
    @Param('plantId', ParseUUIDPipe) plantId: string,
    @Query(new ZodValidationPipe(listarInversoresSchema)) input: ListarInversoresDto,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.service.listar(plantId, input, user);
  }

  @Get(':id')
  buscar(
    @Param('plantId', ParseUUIDPipe) plantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.service.buscar(plantId, id, user);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OPERATOR)
  criar(
    @Param('plantId', ParseUUIDPipe) plantId: string,
    @Body(new ZodValidationPipe(criarInversorSchema)) input: CriarInversorDto,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.service.criar(plantId, input, user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPERATOR)
  editar(
    @Param('plantId', ParseUUIDPipe) plantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editarInversorSchema)) input: EditarInversorDto,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.service.editar(plantId, id, input, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remover(
    @Param('plantId', ParseUUIDPipe) plantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(removerInversorSchema)) input: RemoverInversorDto,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.service.remover(plantId, id, input, user);
  }
}

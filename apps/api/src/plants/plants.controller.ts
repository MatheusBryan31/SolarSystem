import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  listarUsinasSchema,
  vincularClienteSchema,
  type ListarUsinasDto,
  type VincularClienteDto,
} from './plants.schemas';
import { PlantsService } from './plants.service';
import {
  criarUsinaSchema,
  editarUsinaSchema,
  vincularPlataformaSchema,
  desvincularPlataformaSchema,
  type CriarUsinaDto,
  type EditarUsinaDto,
  type VincularPlataformaDto,
  type DesvincularPlataformaDto,
} from './plants.schemas';

@Controller('plants')
export class PlantsController {
  constructor(private readonly plantsService: PlantsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPERATOR)
  criar(
    @Body(new ZodValidationPipe(criarUsinaSchema)) input: CriarUsinaDto,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.plantsService.criar(input, user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPERATOR)
  editar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editarUsinaSchema)) input: EditarUsinaDto,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.plantsService.editar(id, input, user);
  }

  @Post(':id/external-link')
  @Roles(Role.ADMIN)
  vincularPlataforma(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(vincularPlataformaSchema)) input: VincularPlataformaDto,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.plantsService.vincularPlataforma(id, input, user);
  }

  @Get(':id/external-links')
  @Roles(Role.ADMIN)
  vinculos(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UsuarioAutenticado) {
    return this.plantsService.vinculos(id, user);
  }

  @Post(':id/external-link/detach')
  @Roles(Role.ADMIN)
  desvincularPlataforma(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(desvincularPlataformaSchema)) input: DesvincularPlataformaDto,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.plantsService.desvincularPlataforma(id, input, user);
  }

  @Get()
  listar(
    @Query(new ZodValidationPipe(listarUsinasSchema)) filtros: ListarUsinasDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.plantsService.listar(filtros, usuario);
  }

  @Get(':id')
  buscar(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.plantsService.buscarPorId(id, usuario);
  }

  @Patch(':id/client')
  @Roles(Role.ADMIN, Role.OPERATOR)
  vincular(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(vincularClienteSchema)) { clientId }: VincularClienteDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.plantsService.vincularCliente(id, clientId, usuario);
  }
}

import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
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

@Controller('plants')
export class PlantsController {
  constructor(private readonly plantsService: PlantsService) {}

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

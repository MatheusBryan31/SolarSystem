import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { listarAlertasSchema, type ListarAlertasDto } from './alerts.schemas';
import { AlertsService } from './alerts.service';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  listar(
    @Query(new ZodValidationPipe(listarAlertasSchema)) filtros: ListarAlertasDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.alertsService.listar(filtros, usuario);
  }

  @Patch(':id/ack')
  @Roles(Role.ADMIN, Role.OPERATOR)
  reconhecer(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() usuario: UsuarioAutenticado) {
    return this.alertsService.reconhecer(id, usuario);
  }
}

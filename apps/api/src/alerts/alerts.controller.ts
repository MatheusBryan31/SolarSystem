import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { z } from 'zod';
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
  @Get(':id/history')
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(listarAlertasSchema)) query: ListarAlertasDto,
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.alertsService.historico(id, user, query.pagina, query.porPagina);
  }
  @Patch(':id/resolve')
  @Roles(Role.ADMIN, Role.OPERATOR)
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(z.object({ reason: z.string().trim().min(3).max(500) }).strict()))
    body: { reason: string },
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.alertsService.resolver(id, body.reason, user);
  }
}

import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Patch, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProviderRegistry } from '../providers/provider-registry';
import { criarIntegracaoSchema, type CriarIntegracaoDto } from './integrations.schemas';
import { IntegrationsService } from './integrations.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UsuarioAutenticado } from '../auth/auth.types';
import { listarUsinasSchema, type ListarUsinasDto } from '../plants/plants.schemas';
import {
  estadoIntegracaoSchema,
  importarDescobertaSchema,
  type EstadoIntegracaoDto,
} from './integrations.schemas';

@Roles(Role.ADMIN, Role.OPERATOR) // cliente final não mexe em integrações
@Controller()
export class IntegrationsController {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly registry: ProviderRegistry,
  ) {}

  @Patch('integrations/:id')
  @Roles(Role.ADMIN)
  estado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(estadoIntegracaoSchema)) input: EstadoIntegracaoDto,
  ) {
    return this.integrationsService.estado(id, input);
  }

  @Get('integrations/:id/discoveries')
  descobertas(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(listarUsinasSchema)) query: ListarUsinasDto,
  ) {
    return this.integrationsService.descobertas(id, query.pagina, query.porPagina);
  }

  @Post('integrations/:id/discoveries/:discoveryId/import')
  @Roles(Role.ADMIN)
  importar(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('discoveryId', ParseUUIDPipe) discoveryId: string,
    @Body(new ZodValidationPipe(importarDescobertaSchema)) input: { revision: number },
    @CurrentUser() user: UsuarioAutenticado,
  ) {
    return this.integrationsService.importar(id, discoveryId, input.revision, user.id);
  }

  // Catálogo de plataformas suportadas e os campos que cada uma pede
  @Get('providers')
  plataformas() {
    return this.registry.definicoes();
  }

  @Get('integrations')
  listar() {
    return this.integrationsService.listar();
  }

  @Post('integrations')
  @Roles(Role.ADMIN) // no método, SOBRESCREVE o do controller: só o admin cadastra credenciais
  criar(@Body(new ZodValidationPipe(criarIntegracaoSchema)) dados: CriarIntegracaoDto) {
    return this.integrationsService.criar(dados);
  }

  // POST porque é uma AÇÃO que altera dados (não é uma simples leitura)
  @Post('integrations/:id/sync')
  @HttpCode(200)
  sincronizar(@Param('id', ParseUUIDPipe) id: string) {
    return this.integrationsService.sincronizar(id);
  }
}

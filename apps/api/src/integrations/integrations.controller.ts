import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProviderRegistry } from '../providers/provider-registry';
import { criarIntegracaoSchema, type CriarIntegracaoDto } from './integrations.schemas';
import { IntegrationsService } from './integrations.service';

@Roles(Role.ADMIN, Role.OPERATOR) // cliente final não mexe em integrações
@Controller()
export class IntegrationsController {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly registry: ProviderRegistry,
  ) {}

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

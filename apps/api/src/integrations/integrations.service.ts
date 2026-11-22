import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderRegistry } from '../providers/provider-registry';
import { ErroDaPlataforma, type Credenciais } from '../providers/provider.types';
import type { CriarIntegracaoDto } from './integrations.schemas';

// O que pode sair da API. As credenciais NÃO estão aqui: senha de plataforma não volta para a tela.
const camposPublicos = {
  id: true,
  provider: true,
  name: true,
  enabled: true,
  lastSyncAt: true,
  lastError: true,
  createdAt: true,
  _count: { select: { plants: true } }, // quantas usinas essa integração trouxe
} as const;

const mensagemDe = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro));

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry,
  ) {}

  listar() {
    return this.prisma.integration.findMany({ select: camposPublicos, orderBy: { name: 'asc' } });
  }

  async criar(dados: CriarIntegracaoDto) {
    // Só salva credenciais que FUNCIONAM: testa antes de gravar
    try {
      await this.registry.obter(dados.provider).testarConexao(dados.credentials);
    } catch (erro) {
      if (erro instanceof ErroDaPlataforma) {
        throw new BadRequestException(`Não foi possível conectar: ${erro.message}`);
      }
      throw erro;
    }
    return this.prisma.integration.create({ data: dados, select: camposPublicos });
  }

  // Busca as usinas na plataforma e grava/atualiza no nosso banco
  async sincronizar(id: string) {
    const integracao = await this.prisma.integration.findUnique({ where: { id } });
    if (!integracao) throw new NotFoundException('Integração não encontrada');

    const adaptador = this.registry.obter(integracao.provider);
    const agora = new Date();
    try {
      const usinas = await adaptador.listarUsinas(integracao.credentials as Credenciais, agora);

      // UPSERT = "update or insert": se a usina já existe (mesma integração + mesmo externalId),
      // atualiza; senão, cria. Rodar duas vezes NÃO duplica (operação idempotente).
      // O update não mexe no clientId: o vínculo feito por uma pessoa é preservado.
      await this.prisma.$transaction(
        usinas.map((usina) =>
          this.prisma.plant.upsert({
            where: { integrationId_externalId: { integrationId: id, externalId: usina.externalId } },
            create: { ...usina, integrationId: id },
            update: usina,
          }),
        ),
      );
      await this.prisma.integration.update({ where: { id }, data: { lastSyncAt: agora, lastError: null } });
      return { usinasSincronizadas: usinas.length };
    } catch (erro) {
      // Registra a falha para aparecer na tela (e, na aula 14, virar alerta)
      await this.prisma.integration.update({
        where: { id },
        data: { lastSyncAt: agora, lastError: mensagemDe(erro) },
      });
      throw new BadGatewayException(`Falha ao sincronizar: ${mensagemDe(erro)}`); // 502
    }
  }
}

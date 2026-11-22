import type { HealthStatus, ProviderType } from '@prisma/client';

/*
 * A PORTA (Ports & Adapters).
 * Este arquivo é o "contrato" que TODA plataforma precisa cumprir. O resto do sistema
 * (banco, alertas, dashboard, front) só conhece estes tipos, nunca os detalhes de cada fabricante.
 */

// Os dados de acesso de uma conta na plataforma (login, token, chave de API...)
export type Credenciais = Record<string, string>;

// Descreve um campo do formulário de credenciais (o front monta a tela a partir disso)
export interface CampoCredencial {
  chave: string;
  rotulo: string;
  tipo: 'text' | 'password' | 'number';
  obrigatorio: boolean;
  ajuda?: string;
}

export interface DefinicaoPlataforma {
  tipo: ProviderType;
  nome: string;
  descricao: string;
  campos: CampoCredencial[];
}

// Uma usina JÁ TRADUZIDA para o nosso formato (os nomes batem com as colunas de Plant)
export interface UsinaLida {
  externalId: string;
  name: string;
  capacityKwp: number | null;
  city: string | null;
  state: string | null;
  status: HealthStatus;
  currentPowerKw: number | null;
  todayEnergyKwh: number | null;
  totalEnergyKwh: number | null;
  lastDataAt: Date | null;
}

export interface ProviderAdapter {
  readonly definicao: DefinicaoPlataforma;
  // Confere se as credenciais funcionam
  testarConexao(credenciais: Credenciais): Promise<{ usinasEncontradas: number }>;
  // Lê as usinas e as medições mais recentes
  listarUsinas(credenciais: Credenciais, agora: Date): Promise<UsinaLida[]>;
}

// Erro "esperado" de uma plataforma (credencial errada, fora do ar...), com mensagem amigável
export class ErroDaPlataforma extends Error {}

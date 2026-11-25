import type { AlertSeverity, AlertType, HealthStatus } from '@prisma/client';

/*
 * AS REGRAS: funções PURAS (sem banco, sem relógio, sem efeitos colaterais).
 * Recebem a usina e o "agora" e devolvem quais problemas existem. Por serem puras,
 * são fáceis de testar e de explicar: "dada esta usina, neste horário, estes alertas".
 */

// Depois de quantos minutos sem dados a usina é considerada sem comunicação
export const MINUTOS_SEM_DADOS = 60;

export interface Condicao {
  tipo: AlertType;
  severidade: AlertSeverity;
  mensagem: string;
}

export interface UsinaParaRegras {
  name: string;
  status: HealthStatus;
  lastDataAt: Date | null;
}

export function avaliarUsina(
  usina: UsinaParaRegras,
  agora: Date,
  communicationMinutes = MINUTOS_SEM_DADOS,
): Condicao[] {
  const condicoes: Condicao[] = [];

  const minutosSemDados = usina.lastDataAt
    ? (agora.getTime() - usina.lastDataAt.getTime()) / 60_000
    : Number.POSITIVE_INFINITY;
  if (minutosSemDados < 0) return condicoes;

  // Regra 1: a plataforma diz que está offline OU os dados pararam de chegar
  if (usina.status === 'OFFLINE' || minutosSemDados > communicationMinutes) {
    const desde = Number.isFinite(minutosSemDados)
      ? `há ${Math.round(minutosSemDados)} minutos`
      : 'desde o cadastro (nunca enviou dados)';
    condicoes.push({
      tipo: 'PLANT_OFFLINE',
      severidade: 'CRITICAL',
      mensagem: `A usina ${usina.name} está sem comunicação ${desde}`,
    });
  }

  // Regra 2: a fonte reportou estado de falha da usina
  if (usina.status === 'FAULT' && minutosSemDados >= 0 && minutosSemDados <= communicationMinutes) {
    condicoes.push({
      tipo: 'PLANT_FAULT',
      severidade: 'CRITICAL',
      mensagem: `A usina ${usina.name} reportou estado de falha`,
    });
  }

  return condicoes;
}

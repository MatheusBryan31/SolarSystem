import type { HealthStatus } from '@prisma/client';
import {
  ErroDaPlataforma,
  type Credenciais,
  type DefinicaoPlataforma,
  type ProviderAdapter,
  type UsinaLida,
} from '../provider.types';

/*
 * UM ADAPTADOR: a plataforma de DEMONSTRAÇÃO.
 * Gera usinas simuladas com uma curva solar realista. Serve para desenvolver e apresentar
 * o sistema sem depender de credenciais reais de nenhum fabricante.
 */

const FUSO = 'America/Sao_Paulo';
const NASCER = 6; // hora em que a geração começa
const POR = 18; // hora em que termina
const CIDADES = [
  ['Almenara', 'MG'],
  ['Rubim', 'MG'],
  ['Jacinto', 'MG'],
  ['Jequitinhonha', 'MG'],
  ['Havai do Jacinto', 'MG'],
] as const;
const NOMES = [
  'Residência Almeida',
  'Padaria Pão Dourado',
  'Fazenda Boa Esperança',
  'Supermercado Bom Preço',
  'Clínica Vida',
  'Sítio Três Irmãos',
];

// Número "aleatório" entre 0 e 1, mas DETERMINÍSTICO: a mesma chave sempre gera o mesmo número.
// Assim a usina 3 tem sempre a mesma potência instalada, em toda sincronização.
function numeroDaChave(chave: string): number {
  let h = 2166136261; // algoritmo de hash FNV-1a
  for (const letra of chave) {
    h ^= letra.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

// Hora local (ex.: 13.5 = 13h30) no fuso informado, independente do fuso do servidor
export function horaLocal(data: Date, fuso: string): number {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: fuso,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(data);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  return valor('hour') + valor('minute') / 60;
}

const arredondar = (n: number, casas: number) => Math.round(n * 10 ** casas) / 10 ** casas;

export class DemoAdapter implements ProviderAdapter {
  readonly definicao: DefinicaoPlataforma = {
    tipo: 'DEMO',
    nome: 'Demonstração',
    descricao: 'Usinas simuladas com curva solar realista, sem precisar de credenciais reais.',
    campos: [
      {
        chave: 'quantidade',
        rotulo: 'Quantidade de usinas',
        tipo: 'number',
        obrigatorio: true,
        ajuda: '1 a 30',
      },
      {
        chave: 'semente',
        rotulo: 'Semente',
        tipo: 'text',
        obrigatorio: false,
        ajuda: 'Mude para variar as características da simulação',
      },
    ],
  };

  // Os métodos são async porque adaptadores REAIS fazem chamadas HTTP (demoram).
  // O de demonstração não espera nada (não tem await), mas mantém o contrato: um erro aqui
  // vira uma Promise REJEITADA, igual aconteceria num adaptador real.
  // eslint-disable-next-line @typescript-eslint/require-await
  async testarConexao(credenciais: Credenciais) {
    return { usinasEncontradas: this.quantidade(credenciais) };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async listarUsinas(credenciais: Credenciais, agora: Date): Promise<UsinaLida[]> {
    const semente = credenciais.semente?.trim() || 'solarsystem';
    const hora = horaLocal(agora, FUSO);
    // Ângulo do sol no céu: 0 no nascer, PI no pôr (fora desse intervalo, travado nas pontas)
    const angulo = (Math.PI * (Math.min(Math.max(hora, NASCER), POR) - NASCER)) / (POR - NASCER);
    const temSol = hora > NASCER && hora < POR;

    return Array.from({ length: this.quantidade(credenciais) }, (_, i): UsinaLida => {
      const chave = `${semente}:${i}`;
      const [cidade, estado] = CIDADES[Math.floor(numeroDaChave(`${chave}:cidade`) * CIDADES.length)];
      const capacidadeKwp = arredondar(5 + numeroDaChave(`${chave}:kwp`) * 145, 2); // 5 a 150 kWp
      const picoKw = capacidadeKwp * 0.8; // perdas reais: calor, sujeira, cabos, inversor

      // Alguns cenários fixos, para termos o que mostrar nos alertas (aula 14)
      const status: HealthStatus = i === 2 ? 'OFFLINE' : i === 4 ? 'FAULT' : 'ONLINE';

      // Potência agora: um "morro" (seno) entre o nascer e o pôr do sol
      const potenciaKw = status === 'ONLINE' && temSol ? picoKw * Math.sin(angulo) : 0;
      // Energia hoje = área sob a curva até agora (integral do seno)
      const energiaHojeKwh =
        status === 'OFFLINE' ? 0 : ((picoKw * (POR - NASCER)) / Math.PI) * (1 - Math.cos(angulo));
      const diasDeUso = 200 + Math.floor(numeroDaChave(`${chave}:idade`) * 1000);

      return {
        externalId: `DEMO2-${String(i + 1).padStart(3, '0')}`,
        name: `${NOMES[i % NOMES.length]} (${cidade})`,
        capacityKwp: capacidadeKwp,
        city: cidade,
        state: estado,
        status,
        currentPowerKw: arredondar(potenciaKw, 3),
        todayEnergyKwh: arredondar(energiaHojeKwh, 2),
        totalEnergyKwh: arredondar(picoKw * 4.5 * diasDeUso + energiaHojeKwh, 1),
        // A usina offline "parou de falar" há 3 horas
        lastDataAt: status === 'OFFLINE' ? new Date(agora.getTime() - 3 * 3_600_000) : agora,
      };
    });
  }

  private quantidade(credenciais: Credenciais): number {
    const n = Number(credenciais.quantidade ?? 6);
    if (!Number.isInteger(n) || n < 1 || n > 30) {
      throw new ErroDaPlataforma('A quantidade de usinas deve ser um número inteiro de 1 a 30');
    }
    return n;
  }
}

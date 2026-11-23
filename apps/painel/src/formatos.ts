// Formatação no padrão brasileiro (vírgula decimal, ponto de milhar)

const numero = (valor: number, casas = 0) =>
  valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

// 1234.5 -> "1.234,5 kW"; acima de 1000 kW vira "1,23 MW"
export const potencia = (kw: number) => (kw >= 1000 ? `${numero(kw / 1000, 2)} MW` : `${numero(kw, 1)} kW`);

export const energia = (kwh: number) =>
  kwh >= 1000 ? `${numero(kwh / 1000, 2)} MWh` : `${numero(kwh, 1)} kWh`;

export const capacidade = (kwp: number) =>
  kwp >= 1000 ? `${numero(kwp / 1000, 2)} MWp` : `${numero(kwp)} kWp`;

export const porcentagem = (fracao: number) => `${numero(fracao * 100, 1)}%`;

export const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

// "há 5 min", "há 3 h", "há 2 dias"
export function haQuantoTempo(iso: string, agora = new Date()) {
  const minutos = Math.max(0, Math.round((agora.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  if (minutos < 60 * 24) return `há ${Math.round(minutos / 60)} h`;
  return `há ${Math.round(minutos / (60 * 24))} dias`;
}

export function saudacao(agora = new Date()) {
  const h = agora.getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

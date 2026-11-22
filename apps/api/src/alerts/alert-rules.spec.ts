import { avaliarUsina } from './alert-rules';

const AGORA = new Date('2026-11-20T15:00:00Z');
const minutosAtras = (min: number) => new Date(AGORA.getTime() - min * 60_000);

describe('avaliarUsina', () => {
  it('usina saudável e com dados recentes: nenhum alerta', () => {
    expect(avaliarUsina({ name: 'A', status: 'ONLINE', lastDataAt: minutosAtras(5) }, AGORA)).toEqual([]);
  });

  it('status OFFLINE gera PLANT_OFFLINE', () => {
    const [c] = avaliarUsina({ name: 'A', status: 'OFFLINE', lastDataAt: minutosAtras(180) }, AGORA);
    expect(c.tipo).toBe('PLANT_OFFLINE');
    expect(c.mensagem).toContain('há 180 minutos');
  });

  it('dados parados há mais de 60 min geram PLANT_OFFLINE, mesmo com status ONLINE', () => {
    const condicoes = avaliarUsina({ name: 'A', status: 'ONLINE', lastDataAt: minutosAtras(61) }, AGORA);
    expect(condicoes.map((c) => c.tipo)).toEqual(['PLANT_OFFLINE']);
  });

  it('status FAULT gera PLANT_FAULT', () => {
    const condicoes = avaliarUsina({ name: 'A', status: 'FAULT', lastDataAt: minutosAtras(1) }, AGORA);
    expect(condicoes.map((c) => c.tipo)).toEqual(['PLANT_FAULT']);
  });

  it('usina que nunca enviou dados é considerada sem comunicação', () => {
    const [c] = avaliarUsina({ name: 'A', status: 'UNKNOWN', lastDataAt: null }, AGORA);
    expect(c.mensagem).toContain('nunca enviou dados');
  });
});

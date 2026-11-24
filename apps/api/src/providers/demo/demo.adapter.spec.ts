import { DemoAdapter } from './demo.adapter';

// Horários em UTC: 15h UTC = 12h em Brasília (sol a pino); 03h UTC = 00h em Brasília (noite)
const MEIO_DIA = new Date('2026-11-20T15:00:00Z');
const MEIA_NOITE = new Date('2026-11-20T03:00:00Z');

describe('DemoAdapter', () => {
  const adaptador = new DemoAdapter();

  it('gera a quantidade pedida de usinas', async () => {
    const usinas = await adaptador.listarUsinas({ quantidade: '8' }, MEIO_DIA);
    expect(usinas).toHaveLength(8);
  });

  it('é determinístico: mesma semente, mesmas usinas', async () => {
    const a = await adaptador.listarUsinas({ quantidade: '5', semente: 'x' }, MEIO_DIA);
    const b = await adaptador.listarUsinas({ quantidade: '5', semente: 'x' }, MEIO_DIA);
    expect(a).toEqual(b);
    expect(a[0].externalId).toBe('DEMO2-001');
  });

  it('gera energia ao meio-dia e nada à meia-noite', async () => {
    const [diaUsina] = await adaptador.listarUsinas({ quantidade: '1' }, MEIO_DIA);
    const [noiteUsina] = await adaptador.listarUsinas({ quantidade: '1' }, MEIA_NOITE);
    expect(diaUsina.currentPowerKw).toBeGreaterThan(0);
    expect(noiteUsina.currentPowerKw).toBe(0);
  });

  it('recusa quantidade inválida', async () => {
    await expect(adaptador.testarConexao({ quantidade: '500' })).rejects.toThrow('1 a 30');
  });
});

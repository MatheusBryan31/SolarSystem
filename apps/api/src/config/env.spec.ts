import { validateEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://teste@localhost/teste',
  JWT_SECRET: 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres',
};

describe('configuração da origem web', () => {
  it('usa a origem HTTP local por padrão em desenvolvimento', () => {
    expect(validateEnv(base).WEB_ORIGIN).toBe('http://localhost:5173');
  });

  it('exige origem HTTPS explícita em produção', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow('WEB_ORIGIN');
    expect(
      validateEnv({ ...base, NODE_ENV: 'production', WEB_ORIGIN: 'https://painel.example.test' }).WEB_ORIGIN,
    ).toBe('https://painel.example.test');
  });

  it.each([
    '*',
    'null',
    'https://painel.example.test/',
    'https://painel.example.test/api',
    'https://conta@painel.example.test',
    'https://painel.example.test?chave=valor',
    'https://painel.example.test,https://outro.example.test',
  ])('rejeita origem ambígua ou inválida: %s', (WEB_ORIGIN) => {
    expect(() => validateEnv({ ...base, WEB_ORIGIN })).toThrow('WEB_ORIGIN');
  });
});

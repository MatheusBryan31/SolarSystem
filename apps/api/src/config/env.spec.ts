import { validateEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://teste@localhost/teste',
  JWT_SECRET: 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres',
  INTEGRATION_CREDENTIALS_KEY: Buffer.alloc(32, 4).toString('base64'),
};

describe('configuração da origem web', () => {
  it('mantém entrega de alertas desabilitada por padrão', () => {
    expect(validateEnv(base).ALERT_EMAIL_WORKER_ENABLED).toBe(false);
    expect(validateEnv(base).ALERT_EVALUATION_INTERVAL_SECONDS).toBe(60);
  });
  it('não permite habilitar entrega sem SMTP e remetente próprios', () => {
    expect(() => validateEnv({ ...base, ALERT_EMAIL_WORKER_ENABLED: 'true' })).toThrow(
      'ALERT_EMAIL_WORKER_ENABLED',
    );
    expect(() =>
      validateEnv({
        ...base,
        SMTP_URL: 'smtp://localhost:1025',
        PASSWORD_RESET_FROM: 'reset@example.test',
        ALERT_EMAIL_WORKER_ENABLED: 'true',
      }),
    ).toThrow('ALERT_EMAIL_WORKER_ENABLED');
    expect(
      validateEnv({
        ...base,
        SMTP_URL: 'smtp://localhost:1025',
        ALERT_EMAIL_FROM: 'alerts@example.test',
        ALERT_EMAIL_WORKER_ENABLED: 'true',
      }).ALERT_EMAIL_WORKER_ENABLED,
    ).toBe(true);
  });
  it('rejeita intervalo negativo sem desativar validação', () => {
    expect(() => validateEnv({ ...base, ALERT_EVALUATION_INTERVAL_SECONDS: -1 })).toThrow(
      'ALERT_EVALUATION_INTERVAL_SECONDS',
    );
  });
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

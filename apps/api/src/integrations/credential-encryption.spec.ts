import { CredentialEncryption } from './credential-encryption';

const key = (value: number) => Buffer.alloc(32, value).toString('base64');
const cipher = new CredentialEncryption(key(1));

describe('credenciais autenticadas', () => {
  it('reconstitui a credencial com nonce diferente a cada gravação', () => {
    const original = { chave: 'segredo ☀', vazia: '' };
    const a = cipher.cifrar(original, 'i', 'DEMO');
    const b = cipher.cifrar(original, 'i', 'DEMO');
    expect(a.split('.')[1]).not.toBe(b.split('.')[1]);
    expect(a).not.toContain('segredo');
    expect(cipher.decifrar(a, 'i', 'DEMO')).toEqual(original);
    expect(cipher.decifrar(b, 'i', 'DEMO')).toEqual(original);
  });

  it('recusa adulteração, troca de registro, formato legado e chave errada', () => {
    const envelope = cipher.cifrar({ segredo: 'amostra' }, 'i', 'DEMO');
    const partes = envelope.split('.');
    partes[3] = (partes[3][0] === 'A' ? 'B' : 'A') + partes[3].slice(1);
    for (const tentar of [
      () => cipher.decifrar(partes.join('.'), 'i', 'DEMO'),
      () => cipher.decifrar(envelope, 'outro', 'DEMO'),
      () => cipher.decifrar(envelope, 'i', 'OUTRO'),
      () => cipher.decifrar({ segredo: 'amostra' }, 'i', 'DEMO'),
      () => new CredentialEncryption(key(2)).decifrar(envelope, 'i', 'DEMO'),
    ])
      expect(tentar).toThrow(/^Credenciais da integração indisponíveis$/);
  });

  it.each([undefined, 'invalid', Buffer.alloc(31).toString('base64')])('rejeita chave inválida', (valor) => {
    expect(() => new CredentialEncryption(valor)).toThrow('INTEGRATION_CREDENTIALS_KEY');
  });
});

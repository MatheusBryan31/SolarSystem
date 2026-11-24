import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Credenciais } from '../providers/provider.types';

const FORMATO = 'ss:v1';
const ALGORITMO = 'aes-256-gcm';
const TAG_BYTES = 16;
const NONCE_BYTES = 12;
const codificacao = /^[A-Za-z0-9_-]+$/;
const credenciaisSchema = z.record(z.string(), z.string());

export function chaveDeCredenciais(valor: string | undefined): Buffer {
  if (valor && /^[A-Za-z0-9+/]{43}=$/.test(valor)) {
    const chave = Buffer.from(valor, 'base64');
    if (chave.length === 32 && chave.toString('base64') === valor) return chave;
  }
  throw new Error('INTEGRATION_CREDENTIALS_KEY deve conter 32 bytes em Base64 canônico');
}

export const chaveDeCredenciaisValida = (valor: string) => {
  try {
    chaveDeCredenciais(valor);
    return true;
  } catch {
    return false;
  }
};

function parte(valor: string, tamanho?: number): Buffer {
  const bytes = Buffer.from(valor, 'base64url');
  if (
    !codificacao.test(valor) ||
    bytes.toString('base64url') !== valor ||
    (tamanho !== undefined && bytes.length !== tamanho)
  )
    throw new Error();
  return bytes;
}

export class CredentialEncryption {
  private readonly chave: Buffer;

  constructor(base64: string | undefined) {
    this.chave = chaveDeCredenciais(base64);
  }

  cifrar(credenciais: Credenciais, id: string, provedor: string): string {
    const iv = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITMO, this.chave, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(this.contexto(id, provedor));
    const cifrado = Buffer.concat([cipher.update(JSON.stringify(credenciais), 'utf8'), cipher.final()]);
    return [FORMATO, iv, cipher.getAuthTag(), cifrado]
      .map((valor) => (typeof valor === 'string' ? valor : valor.toString('base64url')))
      .join('.');
  }

  decifrar(valor: unknown, id: string, provedor: string): Credenciais {
    try {
      const [formato, iv, tag, cifrado, extra] = typeof valor === 'string' ? valor.split('.') : [];
      if (formato !== FORMATO || !iv || !tag || !cifrado || extra !== undefined) throw new Error();
      const decipher = createDecipheriv(ALGORITMO, this.chave, parte(iv, NONCE_BYTES), {
        authTagLength: TAG_BYTES,
      });
      decipher.setAAD(this.contexto(id, provedor));
      decipher.setAuthTag(parte(tag, TAG_BYTES));
      const json = Buffer.concat([decipher.update(parte(cifrado)), decipher.final()]).toString('utf8');
      return credenciaisSchema.parse(JSON.parse(json));
    } catch {
      throw new Error('Credenciais da integração indisponíveis');
    }
  }

  private contexto(id: string, provedor: string): Buffer {
    return Buffer.from(JSON.stringify(['SolarSystem', FORMATO, id, provedor]), 'utf8');
  }
}

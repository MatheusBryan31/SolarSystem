import type { Request } from 'express';
import { lerTokenDoCookie, NOME_DO_COOKIE, opcoesDoCookie } from './sessao-cookie';

const requisicao = (cookie?: string) => ({ headers: { cookie } }) as Request;

describe('lerTokenDoCookie', () => {
  it('encontra o token no meio de outros cookies', () => {
    expect(lerTokenDoCookie(requisicao(`tema=escuro; ${NOME_DO_COOKIE}=abc.def.ghi; idioma=pt`))).toBe(
      'abc.def.ghi',
    );
  });

  it('sem cabeçalho Cookie ou sem o nosso cookie: undefined', () => {
    expect(lerTokenDoCookie(requisicao())).toBeUndefined();
    expect(lerTokenDoCookie(requisicao('tema=escuro'))).toBeUndefined();
  });
});

describe('opcoesDoCookie', () => {
  it('é httpOnly, SameSite=Strict e só vale para /api', () => {
    expect(opcoesDoCookie(false, 60)).toMatchObject({
      httpOnly: true,
      sameSite: 'strict',
      path: '/api',
      secure: false,
      maxAge: 60_000,
    });
  });

  it('em produção exige HTTPS; sem validade (logout) não tem maxAge', () => {
    const opcoes = opcoesDoCookie(true);
    expect(opcoes.secure).toBe(true);
    expect(opcoes).not.toHaveProperty('maxAge');
  });
});

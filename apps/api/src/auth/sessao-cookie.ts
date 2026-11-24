import type { CookieOptions, Request } from 'express';

/*
 * A SESSÃO MORA NUM COOKIE httpOnly.
 * O navegador guarda o token e o envia sozinho em toda chamada à API,
 * mas o JavaScript da página NÃO consegue lê-lo (document.cookie não o mostra).
 */
export const NOME_DO_COOKIE = 'solarsystem_sessao';

// segundos = validade do cookie. Sem segundos (no logout), o navegador apaga o cookie.
export function opcoesDoCookie(producao: boolean, segundos?: number): CookieOptions {
  return {
    httpOnly: true, // invisível para o JavaScript da página
    sameSite: 'strict',
    secure: producao, // em produção, só trafega por HTTPS
    path: '/api', // só é enviado nas chamadas à API
    ...(segundos !== undefined && { maxAge: segundos * 1000 }), // o Express usa milissegundos
  };
}

// Lê o token do cabeçalho "Cookie: a=1; solarsystem_sessao=eyJ...; b=2"
export function lerTokenDoCookie(req: Request): string | undefined {
  const cabecalho = req.headers.cookie;
  if (!cabecalho) return undefined;
  for (const parte of cabecalho.split(';')) {
    const [nome, ...valor] = parte.trim().split('=');
    if (nome === NOME_DO_COOKIE) {
      try {
        return decodeURIComponent(valor.join('='));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

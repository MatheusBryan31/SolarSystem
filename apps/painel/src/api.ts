/*
 * O CLIENTE HTTP: a ÚNICA porta de saída do painel para a API.
 * Toda tela chama api(...) em vez de usar fetch direto. Assim, num lugar só:
 *  - colocamos o token no cabeçalho Authorization;
 *  - transformamos respostas de erro em exceções com a mensagem da API;
 *  - avisamos o resto do app quando o token expira (401).
 */

const CHAVE_TOKEN = 'solarsystem.token';

export const tokenSalvo = () => localStorage.getItem(CHAVE_TOKEN);
export const salvarToken = (token: string) => localStorage.setItem(CHAVE_TOKEN, token);
export const apagarToken = () => localStorage.removeItem(CHAVE_TOKEN);

// Erro que carrega o status HTTP, para a tela decidir o que fazer (ex.: 404 -> "não encontrado")
export class ErroDaApi extends Error {
  constructor(
    public readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

// Quem quiser saber que a sessão caiu (o AuthProvider) se registra aqui
let aoExpirar: () => void = () => {};
export const quandoSessaoExpirar = (fn: () => void) => {
  aoExpirar = fn;
};

export async function api<T>(caminho: string, opcoes: { metodo?: string; corpo?: unknown } = {}): Promise<T> {
  const token = tokenSalvo();
  const headers: Record<string, string> = {};
  if (opcoes.corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const resposta = await fetch(`/api${caminho}`, {
    method: opcoes.metodo ?? 'GET',
    headers,
    body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
  });

  if (resposta.status === 401 && token) aoExpirar(); // tinha token e mesmo assim deu 401: expirou

  const dados: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    // A API manda { message: "..." } (ou uma lista de mensagens)
    const mensagem = (dados as { message?: string | string[] } | null)?.message;
    throw new ErroDaApi(
      resposta.status,
      Array.isArray(mensagem) ? mensagem.join('; ') : (mensagem ?? 'Erro inesperado. Tente novamente.'),
    );
  }
  return dados as T;
}

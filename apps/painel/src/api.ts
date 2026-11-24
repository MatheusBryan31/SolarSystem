/*
 * O CLIENTE HTTP: a ÚNICA porta de saída do painel para a API.
 * Toda tela chama api(...) em vez de usar fetch direto. Assim, num lugar só:
 *  - garantimos que o cookie de sessão vá junto;
 *  - transformamos respostas de erro em exceções com a mensagem da API;
 *  - avisamos o resto do app quando a sessão cai (401).
 *
 * Repare: este arquivo NÃO toca no token. Ele mora num cookie httpOnly,
 * que o navegador guarda e envia sozinho, e que o JavaScript não consegue ler.
 */

// Erro que carrega o status HTTP, para a tela decidir o que fazer (ex.: 404 -> "não encontrado")
export class ErroDaApi extends Error {
  constructor(
    public readonly status: number,
    mensagem: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(mensagem);
  }
}

// Quem quiser saber que a sessão caiu (o AuthProvider) se registra aqui
const ouvintesDaSessao = new Set<() => void>();
let versaoDaSessao = 0;
export const quandoSessaoExpirar = (fn: () => void) => {
  ouvintesDaSessao.add(fn);
  return () => {
    ouvintesDaSessao.delete(fn);
  };
};

export async function api<T>(caminho: string, opcoes: { metodo?: string; corpo?: unknown } = {}): Promise<T> {
  const versaoDaRequisicao = versaoDaSessao;
  const alteraSessao = caminho === '/auth/login' || caminho === '/auth/logout';
  const resposta = await fetch(`/api${caminho}`, {
    method: opcoes.metodo ?? 'GET',
    credentials: 'same-origin', // envia o cookie de sessão (o painel e a API têm a mesma origem, via proxy)
    headers: opcoes.corpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
  });

  if (alteraSessao && resposta.ok) versaoDaSessao++;
  if (!alteraSessao && resposta.status === 401 && versaoDaRequisicao === versaoDaSessao) {
    ouvintesDaSessao.forEach((fn) => fn());
  }

  const dados: unknown = await resposta.json().catch(() => null); // 204 não tem corpo
  if (!resposta.ok) {
    // A API manda { message: "..." } (ou uma lista de mensagens)
    const mensagem = (dados as { message?: string | string[] } | null)?.message;
    const retryAfter = resposta.status === 429 ? resposta.headers.get('Retry-After') : null;
    const segundos = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : undefined;
    throw new ErroDaApi(
      resposta.status,
      Array.isArray(mensagem) ? mensagem.join('; ') : (mensagem ?? 'Erro inesperado. Tente novamente.'),
      segundos && segundos <= 2_147_483 ? segundos : undefined,
    );
  }
  return dados as T;
}

// Percorre as páginas existentes; uma listagem não é um snapshot transacional do banco.
export async function listarTudo<T extends { id: string }>(caminho: string): Promise<T[]> {
  const itens = new Map<string, T>();
  let pagina = 1;
  let totalPaginas = 1;
  do {
    const response = await api<{ itens: T[]; total: number }>(
      `${caminho}${caminho.includes('?') ? '&' : '?'}porPagina=100&pagina=${pagina}`,
    );
    response.itens.forEach((item) => itens.set(item.id, item));
    totalPaginas = Math.ceil(response.total / 100);
    pagina++;
  } while (pagina <= totalPaginas);
  return [...itens.values()];
}

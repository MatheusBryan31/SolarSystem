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
  const resposta = await fetch(`/api${caminho}`, {
    method: opcoes.metodo ?? 'GET',
    credentials: 'same-origin', // envia o cookie de sessão (o painel e a API têm a mesma origem, via proxy)
    headers: opcoes.corpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
  });

  if (resposta.status === 401) aoExpirar(); // sessão vencida, inválida ou inexistente

  const dados: unknown = await resposta.json().catch(() => null); // 204 não tem corpo
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

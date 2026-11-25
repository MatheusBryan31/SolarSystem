import { useEffect, useState, type ReactNode } from 'react';
import { api, listarTudo } from '../api';
import type { Pagina, Usina } from '../tipos';

export function useCatalogoUsinas() {
  const [data, setData] = useState<Pagina<Usina> | null>(null),
    [erro, setErro] = useState(''),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setErro('');
    void listarTudo<Usina>('/plants')
      .then((itens) => {
        if (active) setData({ itens, total: itens.length, pagina: 1, porPagina: 100 });
      })
      .catch((e: unknown) => {
        if (active) setErro(mensagem(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [version]);
  return { data, erro, loading, reload: () => setVersion((v) => v + 1) };
}

export function useDados<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null),
    [erro, setErro] = useState(''),
    [loading, setLoading] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setErro('');
    setLoading(!!path);
    if (path)
      void api<T>(path)
        .then((value) => {
          if (active) setData(value);
        })
        .catch((e: unknown) => {
          if (active) setErro(e instanceof Error ? e.message : 'Falha ao carregar');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    return () => {
      active = false;
    };
  }, [path, version]);
  return { data, erro, loading, reload: () => setVersion((n) => n + 1) };
}
export function Estado({ loading, erro, reload }: { loading: boolean; erro: string; reload: () => void }) {
  return (
    <>
      {loading && <p role="status">Carregando dados…</p>}
      {erro && (
        <div className="erro" role="alert">
          {erro}{' '}
          <button type="button" onClick={reload}>
            Tentar novamente
          </button>
        </div>
      )}
    </>
  );
}
export function Paginacao({
  pagina,
  total,
  tamanho = 20,
  mudar,
}: {
  pagina: number;
  total: number;
  tamanho?: number;
  mudar: (n: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / tamanho));
  return (
    <nav className="paginacao" aria-label="Paginação">
      <button type="button" disabled={pagina <= 1} onClick={() => mudar(pagina - 1)}>
        Anterior
      </button>
      <span>
        Página {pagina} de {pages} · {total} registros
      </span>
      <button type="button" disabled={pagina >= pages} onClick={() => mudar(pagina + 1)}>
        Próxima
      </button>
    </nav>
  );
}
export function Titulo({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <header className="catalogo-heading">
      <h1>{titulo}</h1>
      <div className="catalogo-actions">{children}</div>
    </header>
  );
}
export const mensagem = (error: unknown) =>
  error instanceof Error ? error.message : 'Não foi possível concluir a operação';
export const dataHora = (value?: string | null) =>
  value ? new Date(value).toLocaleString('pt-BR') : 'Não informado';
export const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(
  ' ',
);

import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Estado, dataHora, mensagem, Paginacao, Titulo, useDados } from '../componentes/Dados';
import type { Alerta, Pagina } from '../tipos';
export function Alarmes() {
  const { usuario } = useAuth();
  const [status, setStatus] = useState(''),
    [pagina, setPagina] = useState(1),
    [busca, setBusca] = useState(''),
    [erro, setErro] = useState(''),
    [busy, setBusy] = useState(false);
  const result = useDados<Pagina<Alerta>>(
    `/alerts?pagina=${pagina}&porPagina=20${status ? `&status=${status}` : ''}`,
  );
  async function reconhecer(item: Alerta) {
    setBusy(true);
    setErro('');
    try {
      await api(`/alerts/${item.id}/ack`, { metodo: 'PATCH' });
      result.reload();
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="catalogo-usinas">
      <Titulo titulo="Alarmes" />
      <section className="cartao filtros">
        <label>
          Situação
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPagina(1);
            }}
          >
            <option value="">Todas</option>
            {[
              ['OPEN', 'Aberto'],
              ['ACKNOWLEDGED', 'Reconhecido'],
              ['RESOLVED', 'Resolvido'],
            ].map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filtrar mensagem nesta página
          <input value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
      </section>
      <Estado {...result} />
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      {result.data && (
        <section className="cartao">
          <ul className="catalogo-lista">
            {result.data.itens
              .filter((a) => a.message.toLowerCase().includes(busca.toLowerCase()))
              .map((a) => (
                <li key={a.id}>
                  <div>
                    <strong>{a.plant?.name ?? 'Integração'}</strong>
                    <p>{a.message}</p>
                    <small>
                      {a.severity} · {a.status} · {dataHora(a.openedAt)}
                    </small>
                  </div>
                  {usuario?.role !== 'CLIENT' && a.status === 'OPEN' && (
                    <button disabled={busy} onClick={() => void reconhecer(a)}>
                      Reconhecer
                    </button>
                  )}
                </li>
              ))}
          </ul>
          {!result.data.itens.length && <p>Nenhum alarme encontrado.</p>}
          <Paginacao pagina={pagina} total={result.data.total} mudar={setPagina} />
        </section>
      )}
    </div>
  );
}

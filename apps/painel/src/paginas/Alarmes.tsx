import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Estado, dataHora, mensagem, Paginacao, Titulo, useDados } from '../componentes/Dados';
import type { Alerta, Pagina } from '../tipos';
export function Alarmes() {
  const { usuario } = useAuth();
  const [status, setStatus] = useState(''),
    [tipo, setTipo] = useState(''),
    [pagina, setPagina] = useState(1),
    [busca, setBusca] = useState(''),
    [erro, setErro] = useState(''),
    [busy, setBusy] = useState(false);
  const result = useDados<Pagina<Alerta>>(
    `/alerts?pagina=${pagina}&porPagina=20${status ? `&status=${status}` : ''}${tipo ? `&type=${tipo}` : ''}`,
  );
  const [historyId, setHistoryId] = useState(''),
    [historyPage, setHistoryPage] = useState(1),
    [resolve, setResolve] = useState<Alerta | null>(null),
    [reason, setReason] = useState('');
  const history = useDados<
    Pagina<{ id: string; status: string; createdAt: string; reason: string | null; isSimulated: boolean }>
  >(historyId ? `/alerts/${historyId}/history?pagina=${historyPage}&porPagina=20` : null);
  async function resolver(e: React.FormEvent) {
    e.preventDefault();
    if (!resolve) return;
    setBusy(true);
    setErro('');
    try {
      await api(`/alerts/${resolve.id}/resolve`, { metodo: 'PATCH', corpo: { reason } });
      setResolve(null);
      result.reload();
      history.reload();
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setBusy(false);
    }
  }
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
          Tipo
          <select
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value);
              setPagina(1);
            }}
          >
            <option value="">Todos</option>
            {[
              ['PLANT_FAULT', 'Falha'],
              ['PLANT_OFFLINE', 'Sem comunicação'],
              ['GENERATION_ABNORMAL', 'Geração anormal'],
              ...(usuario?.role !== 'CLIENT' ? [['SYNC_FAILED', 'Falha de sincronização']] : []),
            ].map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
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
                    {a.isSimulated && <p className="aviso-simulacao">SIMULADO · não gera e-mail</p>}
                    <small>
                      {a.severity} · {a.status} · {dataHora(a.openedAt)}
                    </small>
                  </div>
                  <div className="catalogo-actions">
                    <button
                      onClick={() => {
                        setHistoryId(a.id);
                        setHistoryPage(1);
                      }}
                    >
                      Histórico
                    </button>
                    {usuario?.role !== 'CLIENT' && a.status !== 'RESOLVED' && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          setResolve(a);
                          setReason('');
                        }}
                      >
                        Resolver
                      </button>
                    )}
                    {usuario?.role !== 'CLIENT' && a.status === 'OPEN' && (
                      <button disabled={busy} onClick={() => void reconhecer(a)}>
                        Reconhecer
                      </button>
                    )}
                  </div>
                </li>
              ))}
          </ul>
          {!result.data.itens.length && <p>Nenhum alarme encontrado.</p>}
          <Paginacao pagina={pagina} total={result.data.total} mudar={setPagina} />
        </section>
      )}
      {resolve && (
        <section className="cartao">
          <h2>Resolver alerta</h2>
          <p>
            A condição deve ter cessado, ou o monitoramento/política deve ter sido desativado após revisão. O
            servidor verifica essa condição.
          </p>
          <form className="catalogo-form" onSubmit={resolver}>
            <label>
              Motivo da resolução
              <input
                required
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button className="botao" disabled={busy}>
              Confirmar resolução
            </button>
            <button type="button" onClick={() => setResolve(null)}>
              Cancelar
            </button>
          </form>
        </section>
      )}
      {historyId && (
        <section className="cartao">
          <h2>Histórico do alerta</h2>
          <button onClick={() => setHistoryId('')}>Fechar histórico</button>
          <Estado {...history} />
          {history.data && (
            <>
              <ol>
                {history.data.itens.map((event) => (
                  <li key={event.id}>
                    {dataHora(event.createdAt)} · {event.status}
                    {event.isSimulated ? ' · SIMULADO' : ''}
                    {event.reason ? ` · ${event.reason}` : ''}
                  </li>
                ))}
              </ol>
              <Paginacao pagina={historyPage} total={history.data.total} mudar={setHistoryPage} />
            </>
          )}
        </section>
      )}
    </div>
  );
}

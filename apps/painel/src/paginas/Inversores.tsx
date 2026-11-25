import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../api';
import { useAuth } from '../auth';
import {
  Estado,
  dataHora,
  mensagem,
  Paginacao,
  Titulo,
  useDados,
  useCatalogoUsinas,
} from '../componentes/Dados';
import type { Pagina } from '../tipos';
interface Inversor {
  id: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  status: string;
  origin: string;
  revision: number;
  lastCommunicationAt: string | null;
}
export function Inversores() {
  const [params, setParams] = useSearchParams();
  const plant = params.get('usina') ?? '';
  const { usuario } = useAuth();
  const staff = usuario?.role !== 'CLIENT';
  const choices = useCatalogoUsinas();
  const [pagina, setPagina] = useState(1),
    [busca, setBusca] = useState('');
  const result = useDados<Pagina<Inversor>>(
    plant ? `/plants/${plant}/inverters?pagina=${pagina}&porPagina=20` : null,
  );
  const [editor, setEditor] = useState<Partial<Inversor> | null>(null),
    [archive, setArchive] = useState<Inversor | null>(null),
    [serial, setSerial] = useState(''),
    [reason, setReason] = useState(''),
    [erro, setErro] = useState(''),
    [busy, setBusy] = useState(false),
    [aviso, setAviso] = useState('');
  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!editor) return;
    setBusy(true);
    setErro('');
    try {
      await api(`/plants/${plant}/inverters${editor.id ? `/${editor.id}` : ''}`, {
        metodo: editor.id ? 'PATCH' : 'POST',
        corpo: {
          manufacturer: editor.manufacturer,
          model: editor.model,
          serialNumber: editor.serialNumber,
          status: editor.status,
          ...(editor.id ? { revision: editor.revision } : {}),
        },
      });
      setEditor(null);
      setAviso('Inversor salvo.');
      result.reload();
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setBusy(false);
    }
  }
  async function arquivar(e: FormEvent) {
    e.preventDefault();
    if (!archive) return;
    setBusy(true);
    setErro('');
    try {
      await api(`/plants/${plant}/inverters/${archive.id}`, {
        metodo: 'DELETE',
        corpo: { revision: archive.revision, confirmSerialNumber: serial, reason },
      });
      setArchive(null);
      setAviso('Inversor arquivado; histórico e identidade preservados.');
      result.reload();
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="catalogo-usinas">
      <Titulo titulo="Inversores">
        {staff && plant && (
          <button
            className="botao"
            disabled={busy}
            onClick={() => setEditor({ manufacturer: '', model: '', serialNumber: '', status: 'UNKNOWN' })}
          >
            Novo inversor
          </button>
        )}
      </Titulo>
      <section className="cartao filtros">
        <label>
          Usina
          <select
            value={plant}
            onChange={(e) => {
              setParams({ usina: e.target.value });
              setPagina(1);
              setEditor(null);
              setArchive(null);
              setErro('');
            }}
          >
            <option value="">Selecione a usina</option>
            {plant && !choices.data?.itens.some((p) => p.id === plant) && (
              <option value={plant}>Usina selecionada</option>
            )}
            {choices.data?.itens.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filtrar nesta página
          <input value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
      </section>
      <Estado {...choices} />
      <Estado {...result} />
      {!plant && <p>Selecione uma usina para consultar os equipamentos.</p>}
      {erro && (
        <p role="alert" className="erro">
          {erro}
        </p>
      )}
      {aviso && <p role="status">{aviso}</p>}
      {editor && (
        <section className="cartao">
          <h2>{editor.id ? 'Editar' : 'Cadastrar'} inversor</h2>
          <form className="catalogo-form" onSubmit={salvar}>
            {(
              [
                ['manufacturer', 'Fabricante'],
                ['model', 'Modelo'],
                ['serialNumber', 'Número de série'],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  required
                  maxLength={160}
                  disabled={busy}
                  value={editor[key] ?? ''}
                  onChange={(e) => setEditor({ ...editor, [key]: e.target.value })}
                />
              </label>
            ))}
            <label>
              Estado operacional
              <select
                value={editor.status}
                onChange={(e) => setEditor({ ...editor, status: e.target.value })}
              >
                {['UNKNOWN', 'ONLINE', 'OFFLINE', 'FAULT', 'MAINTENANCE'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <p className="sutil">Estado declarado manualmente. Não cria uma leitura de comunicação.</p>
            <button className="botao" disabled={busy}>
              Salvar inversor
            </button>
            <button type="button" disabled={busy} onClick={() => setEditor(null)}>
              Cancelar
            </button>
          </form>
        </section>
      )}
      {archive && (
        <section className="cartao">
          <h2>Arquivar {archive.serialNumber}</h2>
          <form className="catalogo-form" onSubmit={arquivar}>
            <label>
              Confirme a série
              <input required value={serial} onChange={(e) => setSerial(e.target.value)} />
            </label>
            <label>
              Motivo
              <input
                required
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button disabled={busy}>Confirmar arquivamento</button>
            <button type="button" onClick={() => setArchive(null)}>
              Cancelar
            </button>
          </form>
        </section>
      )}
      {result.data && (
        <section className="cartao">
          <ul className="catalogo-lista">
            {result.data.itens
              .filter((i) =>
                `${i.manufacturer} ${i.model} ${i.serialNumber}`.toLowerCase().includes(busca.toLowerCase()),
              )
              .map((i) => (
                <li key={i.id}>
                  <div>
                    <strong>
                      {i.manufacturer} · {i.model}
                    </strong>
                    <p>
                      Série: {i.serialNumber} · {i.status} · {i.origin}
                    </p>
                    <small>Última comunicação: {dataHora(i.lastCommunicationAt)}</small>
                  </div>
                  <div className="catalogo-actions">
                    {staff && i.origin === 'MANUAL' && (
                      <button disabled={busy} onClick={() => setEditor(i)}>
                        Editar
                      </button>
                    )}
                    {usuario?.role === 'ADMIN' && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          setArchive(i);
                          setSerial('');
                          setReason('');
                        }}
                      >
                        Arquivar
                      </button>
                    )}
                  </div>
                </li>
              ))}
          </ul>
          {!result.data.itens.length && <p>Nenhum inversor cadastrado.</p>}
          <Paginacao pagina={pagina} total={result.data.total} mudar={setPagina} />
        </section>
      )}
    </div>
  );
}

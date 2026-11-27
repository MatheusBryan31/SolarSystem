import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Paginacao } from '../componentes/Dados';
import { api, listarTudo } from '../api';
import { useAuth } from '../auth';
import type { Descoberta, Integracao, Pagina, Usina } from '../tipos';

const campos = ['name', 'city', 'state', 'capacityKwp'] as const;
type Campo = (typeof campos)[number];
const rotulos: Record<Campo, string> = {
  name: 'Nome',
  city: 'Cidade',
  state: 'UF',
  capacityKwp: 'Capacidade (kWp)',
};
const monitoramento: Record<Usina['monitoring'], string> = {
  ACTIVE: 'Leitura atual',
  UNLINKED: 'Sem vínculo',
  PAUSED: 'Pausado',
  WAITING: 'Aguardando leitura',
  STALE: 'Leitura antiga',
};
interface Editor {
  plant?: Usina;
  values: Record<Campo, string>;
  clientId: string;
  useRemote: Campo[];
}

interface VinculoHistorico {
  id: string;
  integrationId: string;
  externalId: string;
  state: 'ACTIVE' | 'DETACHED';
  integration: { name: string; enabled: boolean; archivedAt: string | null };
}

export function Usinas() {
  const { usuario } = useAuth();
  const staff = usuario?.role !== 'CLIENT';
  const admin = usuario?.role === 'ADMIN';
  const [usinas, setUsinas] = useState<Usina[]>([]);
  const [pagina, setPagina] = useState(1),
    [busca, setBusca] = useState(''),
    [status, setStatus] = useState(''),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [clientes, setClientes] = useState<{ id: string; name: string }[]>([]);
  const [integrationId, setIntegrationId] = useState('');
  const [descobertas, setDescobertas] = useState<Descoberta[]>([]);
  const [destinos, setDestinos] = useState<Record<string, string>>({});
  const [editor, setEditor] = useState<Editor | null>(null);
  const [historico, setHistorico] = useState<{ plant: Usina; itens: VinculoHistorico[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  async function carregar() {
    const current = ++generation.current;
    setLoading(true);
    try {
      const [plants, integrations, clients] = await Promise.all([
        api<Pagina<Usina>>(
          `/plants?pagina=${pagina}&porPagina=20&busca=${encodeURIComponent(busca)}${status ? `&status=${status}` : ''}`,
        ),
        staff ? api<Integracao[]>('/integrations') : Promise.resolve([]),
        staff ? listarTudo<{ id: string; name: string }>('/clients') : Promise.resolve([]),
      ]);
      if (current !== generation.current) return;
      setUsinas(plants.itens);
      setTotal(plants.total);
      setErro('');
      setIntegracoes(integrations);
      setClientes(clients);
    } catch (error) {
      if (current === generation.current) throw error;
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    void carregar().catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Falha ao carregar'));
    return () => {
      generation.current++;
    };
  }, [usuario?.id, pagina, busca, status]);
  useEffect(() => {
    let active = true;
    setDescobertas([]);
    if (integrationId)
      void listarTudo<Descoberta>(`/integrations/${integrationId}/discoveries`)
        .then((items) => {
          if (active) setDescobertas(items);
        })
        .catch((e: unknown) => {
          if (active) setErro(e instanceof Error ? e.message : 'Falha ao carregar descobertas');
        });
    return () => {
      active = false;
    };
  }, [integrationId]);

  async function executar(work: () => Promise<unknown>, sucesso: string) {
    setBusy(true);
    setErro('');
    setAviso('');
    try {
      await work();
      setEditor(null);
      setHistorico(null);
      await carregar();
      if (integrationId)
        setDescobertas(await listarTudo<Descoberta>(`/integrations/${integrationId}/discoveries`));
      setAviso(sucesso);
    } catch (e) {
      setErro(
        e instanceof Error ? e.message : 'Não foi possível concluir. Recarregue antes de tentar novamente.',
      );
    } finally {
      setBusy(false);
    }
  }
  function abrir(plant?: Usina) {
    setEditor({
      plant,
      values: {
        name: plant?.name ?? '',
        city: plant?.city ?? '',
        state: plant?.state ?? '',
        capacityKwp: plant?.capacityKwp?.toString() ?? '',
      },
      clientId: '',
      useRemote: [],
    });
  }
  function salvar(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const values: Record<string, unknown> = {};
    for (const key of campos) {
      if (editor.useRemote.includes(key)) continue;
      if (!editor.plant && !editor.values[key] && key !== 'name') continue;
      if (editor.plant && editor.values[key] === (editor.plant[key]?.toString() ?? '')) continue;
      values[key] =
        key === 'capacityKwp'
          ? editor.values[key] === ''
            ? null
            : Number(editor.values[key])
          : editor.values[key].trim() || null;
    }
    const plant = editor.plant;
    if (plant && !Object.keys(values).length && !editor.useRemote.length) {
      setAviso('Nenhuma alteração para salvar.');
      return;
    }
    void executar(
      () =>
        api(plant ? `/plants/${plant.id}` : '/plants', {
          metodo: plant ? 'PATCH' : 'POST',
          corpo: plant
            ? { ...values, revision: plant.revision, useRemote: editor.useRemote }
            : { ...values, clientId: editor.clientId || null },
        }),
      'Cadastro salvo.',
    );
  }
  const integration = integracoes.find((item) => item.id === integrationId);
  return (
    <div className="catalogo-usinas">
      <header className="catalogo-heading">
        <div>
          <h1>Usinas</h1>
          <p className="sutil">Cadastro único, com dados manuais preservados.</p>
        </div>
        {staff && (
          <Link to="/usinas/cadastro">
            <button className="botao" disabled={busy} onClick={() => abrir()}>
              Cadastrar usina
            </button>
          </Link>
        )}
      </header>
      {erro && (
        <p className="erro" role="alert">
          {erro}{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() => void executar(carregar, 'Dados recarregados.')}
          >
            Recarregar
          </button>
        </p>
      )}
      {aviso && <p role="status">{aviso}</p>}
      {editor && (
        <section className="cartao">
          <h2>{editor.plant ? 'Editar usina' : 'Cadastrar usina'}</h2>
          <form className="catalogo-form" onSubmit={salvar}>
            {campos.map((key) => (
              <div key={key}>
                <label>
                  {rotulos[key]}
                  <input
                    required={key === 'name' && !editor.useRemote.includes(key)}
                    disabled={busy || editor.useRemote.includes(key)}
                    type={key === 'capacityKwp' ? 'number' : 'text'}
                    min={key === 'capacityKwp' ? 0 : undefined}
                    step={key === 'capacityKwp' ? 'any' : undefined}
                    maxLength={key === 'state' ? 2 : 160}
                    value={editor.values[key]}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        values: {
                          ...editor.values,
                          [key]: key === 'state' ? e.target.value.toUpperCase() : e.target.value,
                        },
                      })
                    }
                  />
                </label>
                {editor.plant && (
                  <small>
                    Origem atual:{' '}
                    {editor.plant.metadataSources[key] === 'MANUAL' ? 'manual' : 'plataforma/não informado'}
                  </small>
                )}
                {editor.plant?.integrationId && (
                  <label className="catalogo-check">
                    <input
                      type="checkbox"
                      checked={editor.useRemote.includes(key)}
                      disabled={busy}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          useRemote: e.target.checked
                            ? [...editor.useRemote, key]
                            : editor.useRemote.filter((value) => value !== key),
                        })
                      }
                    />{' '}
                    Usar valor da plataforma
                  </label>
                )}
              </div>
            ))}
            {!editor.plant && (
              <label>
                Cliente (opcional)
                <select
                  value={editor.clientId}
                  onChange={(e) => setEditor({ ...editor, clientId: e.target.value })}
                >
                  <option value="">Sem cliente vinculado</option>
                  {clientes.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="catalogo-actions">
              <button className="botao" disabled={busy}>
                Salvar
              </button>
              <button type="button" disabled={busy} onClick={() => setEditor(null)}>
                Cancelar
              </button>
            </div>
          </form>
        </section>
      )}
      <section className="cartao">
        <h2>Cadastros ({total})</h2>
        <div className="filtros">
          <label>
            Buscar usina
            <input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(1);
              }}
            />
          </label>
          <label>
            Status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPagina(1);
              }}
            >
              <option value="">Todos</option>
              {['ONLINE', 'WARNING', 'FAULT', 'OFFLINE', 'UNKNOWN'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        {loading && <p role="status">Carregando usinas…</p>}
        {!usinas.length && <p>Nenhuma usina cadastrada.</p>}
        <ul className="catalogo-lista">
          {usinas.map((plant) => (
            <li key={plant.id}>
              <div>
                <strong>
                  <Link to={`/usinas/${plant.id}`}>{plant.name}</Link>
                </strong>
                {plant.integration?.provider === 'DEMO' && (
                  <p className="aviso-simulacao">Leituras simuladas · DEMO</p>
                )}
                <p>
                  {plant.origin === 'MANUAL' ? 'Cadastro manual' : 'Importada'} •{' '}
                  {monitoramento[plant.monitoring]} • {plant.capacityKwp ?? '—'} kWp
                </p>
                <small>
                  Cliente: {plant.client?.name ?? 'Não vinculado'} • {plant.city ?? 'Cidade não informada'}{' '}
                  {plant.state ?? ''}
                </small>
              </div>
              {staff && (
                <button disabled={busy} onClick={() => abrir(plant)}>
                  Editar
                </button>
              )}
              {admin && (
                <button
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void api<VinculoHistorico[]>(`/plants/${plant.id}/external-links`)
                      .then((itens) => setHistorico({ plant, itens }))
                      .catch((e: unknown) =>
                        setErro(e instanceof Error ? e.message : 'Falha ao consultar vínculos'),
                      )
                      .finally(() => setBusy(false));
                  }}
                >
                  Ver vínculos
                </button>
              )}
              {admin && plant.integrationId && (
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Desvincular ${plant.name}? Cadastro e histórico serão preservados; a coleta será interrompida.`,
                      )
                    )
                      void executar(
                        () =>
                          api(`/plants/${plant.id}/external-link/detach`, {
                            metodo: 'POST',
                            corpo: { revision: plant.revision, reason: 'Desvinculação confirmada no painel' },
                          }),
                        'Usina desvinculada; identidade externa reservada.',
                      );
                  }}
                >
                  Desvincular
                </button>
              )}
            </li>
          ))}
        </ul>
        <Paginacao pagina={pagina} total={total} mudar={setPagina} />
      </section>
      {historico && (
        <section className="cartao">
          <h2>Vínculos de {historico.plant.name}</h2>
          <p>Identidades desvinculadas permanecem reservadas a este cadastro.</p>
          {!historico.itens.length && <p>Nenhum vínculo registrado.</p>}
          <ul className="catalogo-lista">
            {historico.itens.map((link) => (
              <li key={link.id}>
                <div>
                  <strong>{link.integration.name}</strong>
                  <p>
                    {link.externalId} • {link.state === 'ACTIVE' ? 'Ativo' : 'Desvinculado'}
                  </p>
                </div>
                {link.state === 'DETACHED' && (
                  <button
                    disabled={
                      busy ||
                      !!historico.plant.integrationId ||
                      !link.integration.enabled ||
                      !!link.integration.archivedAt
                    }
                    onClick={() => {
                      if (
                        window.confirm(
                          `Reconectar ${historico.plant.name} a esta identidade? Os campos manuais serão preservados.`,
                        )
                      )
                        void executar(
                          () =>
                            api(`/plants/${historico.plant.id}/external-link`, {
                              metodo: 'POST',
                              corpo: {
                                integrationId: link.integrationId,
                                externalId: link.externalId,
                                revision: historico.plant.revision,
                              },
                            }),
                          'Vínculo reativado. Sincronize para receber novas leituras.',
                        );
                    }}
                  >
                    Reconectar
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button onClick={() => setHistorico(null)}>Fechar vínculos</button>
        </section>
      )}
      {staff && (
        <section className="cartao">
          <h2>Descobertas de integração</h2>
          <p className="sutil">
            Revise a identidade e o cadastro antes de importar ou vincular. Nomes iguais não comprovam que são
            a mesma usina.
          </p>
          <label>
            Integração
            <select
              aria-label="Integração"
              disabled={busy}
              value={integrationId}
              onChange={(e) => setIntegrationId(e.target.value)}
            >
              <option value="">Selecione</option>
              {integracoes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.archivedAt ? ' (arquivada)' : !item.enabled ? ' (pausada)' : ''}
                </option>
              ))}
            </select>
          </label>
          {integration && (
            <div className="catalogo-actions">
              <button
                disabled={busy || !integration.enabled || !!integration.archivedAt}
                onClick={() =>
                  void executar(
                    () => api(`/integrations/${integrationId}/sync`, { metodo: 'POST' }),
                    'Coleta concluída. Revise as descobertas pendentes.',
                  )
                }
              >
                Sincronizar
              </button>
              {admin && !integration.archivedAt && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void executar(
                      () =>
                        api(`/integrations/${integrationId}`, {
                          metodo: 'PATCH',
                          corpo: { revision: integration.revision, enabled: !integration.enabled },
                        }),
                      'Estado da integração atualizado.',
                    )
                  }
                >
                  {integration.enabled ? 'Pausar' : 'Reativar'}
                </button>
              )}
            </div>
          )}
          <ul className="catalogo-lista">
            {descobertas.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.snapshot.name}</strong>
                  <p>
                    ID externo: {item.externalId} • {item.snapshot.capacityKwp ?? '—'} kWp •{' '}
                    {item.snapshot.city ?? 'Sem cidade'}
                  </p>
                  {admin && (
                    <>
                      <label>
                        Cadastro existente
                        <select
                          aria-label="Cadastro existente"
                          disabled={busy}
                          value={destinos[item.id] ?? ''}
                          onChange={(e) => setDestinos({ ...destinos, [item.id]: e.target.value })}
                        >
                          <option value="">Selecione para vincular</option>
                          {usinas
                            .filter((plant) => !plant.integrationId)
                            .map((plant) => (
                              <option key={plant.id} value={plant.id}>
                                {plant.name} • {plant.client?.name ?? 'Sem cliente'} •{' '}
                                {plant.capacityKwp ?? '—'} kWp
                              </option>
                            ))}
                        </select>
                      </label>
                      <div className="catalogo-actions">
                        <button
                          disabled={busy || !destinos[item.id]}
                          onClick={() => {
                            const target = usinas.find((plant) => plant.id === destinos[item.id]);
                            if (
                              target &&
                              window.confirm(
                                `Vincular ${item.externalId} a ${target.name}? Os campos manuais e o cliente serão preservados.`,
                              )
                            )
                              void executar(
                                () =>
                                  api(`/plants/${target.id}/external-link`, {
                                    metodo: 'POST',
                                    corpo: {
                                      integrationId,
                                      externalId: item.externalId,
                                      revision: target.revision,
                                      discoveryRevision: item.revision,
                                    },
                                  }),
                                'Vínculo criado sem duplicar o cadastro.',
                              );
                          }}
                        >
                          Vincular existente
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Importar ${item.snapshot.name} como nova? Confirme que não corresponde a um cadastro existente.`,
                              )
                            )
                              void executar(
                                () =>
                                  api(`/integrations/${integrationId}/discoveries/${item.id}/import`, {
                                    metodo: 'POST',
                                    corpo: { revision: item.revision },
                                  }),
                                'Usina importada.',
                              );
                          }}
                        >
                          Importar como nova
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {integrationId && !descobertas.length && (
            <p>
              Sem descobertas pendentes. Identidades desvinculadas continuam reservadas e não são importadas
              novamente.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

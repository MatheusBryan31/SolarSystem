import { useState, type FormEvent } from 'react';
import { api, listarTudo } from '../api';
import { useAuth } from '../auth';
import { Estado, mensagem, Paginacao, Titulo, useDados } from '../componentes/Dados';
import type { Pagina, Perfil } from '../tipos';

interface Registro {
  id: string;
  name: string;
  email?: string | null;
  document?: string | null;
  phone?: string | null;
  role?: Perfil;
  active?: boolean;
  clientId?: string | null;
}
export function Cadastros({ usuarios = false }: { usuarios?: boolean }) {
  const { usuario } = useAuth();
  const [busca, setBusca] = useState(''),
    [role, setRole] = useState(''),
    [pagina, setPagina] = useState(1);
  const [editor, setEditor] = useState<Registro | null>(null),
    [senha, setSenha] = useState(''),
    [busy, setBusy] = useState(false),
    [erro, setErro] = useState(''),
    [aviso, setAviso] = useState('');
  const [clientes, setClientes] = useState<Registro[]>([]);
  const [original, setOriginal] = useState<Registro | null>(null);
  const permitida = !usuarios || usuario?.role === 'ADMIN';
  const equipe = usuario?.role !== 'CLIENT';
  const base = usuarios ? '/users' : '/clients';
  const result = useDados<Pagina<Registro>>(
    permitida
      ? `${base}?busca=${encodeURIComponent(busca)}&pagina=${pagina}&porPagina=20${usuarios && role ? `&role=${role}` : ''}`
      : null,
  );
  async function abrir(item?: Registro) {
    setBusy(true);
    setErro('');
    setAviso('');
    setSenha('');
    try {
      const [registro, choices] = await Promise.all([
        item
          ? api<Registro>(`${base}/${item.id}`)
          : Promise.resolve({ id: '', name: '', email: '', role: 'OPERATOR' as Perfil, clientId: null }),
        usuarios ? listarTudo<Registro>('/clients') : Promise.resolve([]),
      ]);
      setClientes(choices);
      setEditor(registro);
      setOriginal(registro);
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setBusy(false);
    }
  }
  async function salvar(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setBusy(true);
    setErro('');
    try {
      if (senha && new TextEncoder().encode(senha).length > 72)
        throw new Error('A senha deve ter no máximo 72 bytes.');
      const body = usuarios
        ? {
            name: editor.name,
            email: editor.email,
            role: editor.role,
            clientId: editor.role === 'CLIENT' ? editor.clientId : null,
            ...(editor.id ? { active: editor.active } : {}),
            ...(senha ? { senha } : {}),
          }
        : {
            name: editor.name,
            email: editor.email || null,
            document: editor.document || null,
            phone: editor.phone || null,
          };
      const payload =
        editor.id && original
          ? Object.fromEntries(
              Object.entries(body).filter(([key, value]) => {
                if (key === 'senha') return true;
                const before = original[key as keyof Registro];
                return (
                  value !==
                  (key === 'clientId' || (!usuarios && ['email', 'document', 'phone'].includes(key))
                    ? (before ?? null)
                    : before)
                );
              }),
            )
          : body;
      if (editor.id && !Object.keys(payload).length) throw new Error('Nenhuma informação alterada.');
      await api(`${base}${editor.id ? `/${editor.id}` : ''}`, {
        metodo: editor.id ? 'PATCH' : 'POST',
        corpo: payload,
      });
      const self = usuarios && editor.id === usuario?.id;
      setEditor(null);
      result.reload();
      setAviso(
        self
          ? 'Usuário atualizado. Alterações de acesso ou senha podem exigir novo login.'
          : 'Cadastro salvo.',
      );
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setBusy(false);
    }
  }
  async function excluir(item: Registro) {
    if (!window.confirm(`Excluir ${item.name}? Clientes com vínculos serão preservados pela API.`)) return;
    setBusy(true);
    setErro('');
    try {
      await api(`/clients/${item.id}`, { metodo: 'DELETE' });
      setAviso('Cliente excluído.');
      result.reload();
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setBusy(false);
    }
  }
  if (!permitida) return <p role="alert">Acesso restrito a administradores.</p>;
  return (
    <div className="catalogo-usinas">
      <Titulo titulo={usuarios ? 'Usuários' : 'Clientes'}>
        {equipe && (
          <button className="botao" disabled={busy} onClick={() => void abrir()}>
            Novo {usuarios ? 'usuário' : 'cliente'}
          </button>
        )}
      </Titulo>
      <section className="cartao filtros">
        <label>
          Buscar
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(1);
            }}
          />
        </label>
        {usuarios && (
          <label>
            Perfil
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPagina(1);
              }}
            >
              <option value="">Todos</option>
              {['ADMIN', 'OPERATOR', 'CLIENT'].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
        )}
      </section>
      <Estado {...result} />
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      {aviso && <p role="status">{aviso}</p>}
      {editor && (
        <section className="cartao">
          <h2>{editor.id ? 'Dados do cadastro' : 'Novo cadastro'}</h2>
          <form onSubmit={salvar} className="catalogo-form">
            <label>
              Nome
              <input
                required
                minLength={2}
                maxLength={120}
                disabled={!equipe || busy}
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              />
            </label>
            <label>
              E-mail
              <input
                type="email"
                required={usuarios}
                disabled={!equipe || busy}
                value={editor.email ?? ''}
                onChange={(e) => setEditor({ ...editor, email: e.target.value })}
              />
            </label>
            {usuarios ? (
              <>
                <label>
                  Perfil
                  <select
                    disabled={busy || editor.id === usuario?.id}
                    aria-label="Perfil do usuário"
                    value={editor.role}
                    onChange={(e) => setEditor({ ...editor, role: e.target.value as Perfil, clientId: null })}
                  >
                    {['ADMIN', 'OPERATOR', 'CLIENT'].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                {editor.role === 'CLIENT' && (
                  <label>
                    Cliente responsável
                    <select
                      required
                      value={editor.clientId ?? ''}
                      onChange={(e) => setEditor({ ...editor, clientId: e.target.value })}
                    >
                      <option value="">Selecione</option>
                      {clientes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  {editor.id ? 'Nova senha (opcional)' : 'Senha'}
                  <input
                    type="password"
                    autoComplete="new-password"
                    required={!editor.id}
                    minLength={10}
                    disabled={busy}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                  />
                </label>
                {editor.id && (
                  <label className="catalogo-check">
                    <input
                      type="checkbox"
                      disabled={busy || editor.id === usuario?.id}
                      checked={editor.active}
                      onChange={(e) => setEditor({ ...editor, active: e.target.checked })}
                    />
                    Usuário ativo
                  </label>
                )}
              </>
            ) : (
              <>
                <label>
                  CPF/CNPJ (somente números)
                  <input
                    maxLength={14}
                    pattern="([0-9]{11}|[0-9]{14})"
                    disabled={!equipe || busy}
                    value={editor.document ?? ''}
                    onChange={(e) => setEditor({ ...editor, document: e.target.value })}
                  />
                </label>
                <label>
                  Telefone
                  <input
                    maxLength={20}
                    disabled={!equipe || busy}
                    value={editor.phone ?? ''}
                    onChange={(e) => setEditor({ ...editor, phone: e.target.value })}
                  />
                </label>
              </>
            )}
            <div className="catalogo-actions">
              {equipe && (
                <button className="botao" disabled={busy}>
                  Salvar
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => setEditor(null)}>
                Fechar
              </button>
            </div>
          </form>
        </section>
      )}
      {result.data && (
        <section className="cartao">
          <ul className="catalogo-lista">
            {result.data.itens.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  {usuarios && (
                    <p>
                      {item.email} · {item.role} · {item.active ? 'Ativo' : 'Desativado'}
                    </p>
                  )}
                </div>
                <div className="catalogo-actions">
                  <button disabled={busy} onClick={() => void abrir(item)}>
                    {equipe ? 'Editar' : 'Consultar'}
                  </button>
                  {!usuarios && usuario?.role === 'ADMIN' && (
                    <button disabled={busy} onClick={() => void excluir(item)}>
                      Excluir
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {!result.data.itens.length && <p>Nenhum cadastro encontrado.</p>}
          <Paginacao pagina={pagina} total={result.data.total} mudar={setPagina} />
        </section>
      )}
    </div>
  );
}

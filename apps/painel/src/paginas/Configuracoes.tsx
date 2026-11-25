import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { useAuth } from '../auth';
import { Estado, mensagem, Titulo, useDados } from '../componentes/Dados';
import type { Integracao } from '../tipos';
interface Provider {
  tipo: string;
  nome: string;
  descricao: string;
  campos: { chave: string; rotulo: string; tipo: string; obrigatorio: boolean; ajuda?: string }[];
}
export function Configuracoes() {
  const { usuario } = useAuth(),
    staff = usuario?.role !== 'CLIENT',
    admin = usuario?.role === 'ADMIN';
  const providers = useDados<Provider[]>(staff ? '/providers' : null),
    integrations = useDados<Integracao[]>(staff ? '/integrations' : null);
  const [name, setName] = useState(''),
    [provider, setProvider] = useState(''),
    [credentials, setCredentials] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [erro, setErro] = useState(''),
    [aviso, setAviso] = useState('');
  async function criar(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErro('');
    try {
      await api('/integrations', { metodo: 'POST', corpo: { name, provider, credentials } });
      setCredentials({});
      setName('');
      setAviso('Integração cadastrada. Revise as descobertas na página Usinas.');
      integrations.reload();
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setBusy(false);
    }
  }
  async function estado(item: Integracao, archive = false) {
    if (archive && !window.confirm(`Arquivar ${item.name}? Vínculos e histórico serão preservados.`)) return;
    setBusy(true);
    setErro('');
    try {
      await api(`/integrations/${item.id}`, {
        metodo: 'PATCH',
        corpo: { revision: item.revision, ...(archive ? { archive: true } : { enabled: !item.enabled }) },
      });
      integrations.reload();
      setAviso('Estado da integração atualizado.');
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="catalogo-usinas">
      <Titulo titulo="Configurações" />
      <section className="cartao">
        <h2>Conta e segurança</h2>
        <p>
          {usuario?.nome} · {usuario?.email}
        </p>
        <p>Perfil: {usuario?.role}</p>
        <Link to="/alterar-senha">Alterar senha</Link>
        <p className="sutil">
          Preferências globais ainda não estão disponíveis. As alterações de integrações só são confirmadas
          depois de salvas no servidor.
        </p>
      </section>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      {aviso && <p role="status">{aviso}</p>}
      <Estado {...providers} />
      <Estado {...integrations} />
      {staff && (
        <section className="cartao">
          <h2>Integrações</h2>
          <p className="aviso-simulacao">
            DEMO gera somente leituras simuladas. Nenhuma integração real de fabricante está disponível no
            catálogo atual.
          </p>
          {integrations.data?.map((i) => (
            <article className="linha-config" key={i.id}>
              <strong>{i.name}</strong>
              <span>
                {i.provider} · {i.archivedAt ? 'Arquivada' : i.enabled ? 'Ativa' : 'Pausada'}
              </span>
              {admin && !i.archivedAt && (
                <div className="catalogo-actions">
                  <button disabled={busy} onClick={() => void estado(i)}>
                    {i.enabled ? 'Pausar' : 'Ativar'}
                  </button>
                  <button disabled={busy} onClick={() => void estado(i, true)}>
                    Arquivar integração
                  </button>
                </div>
              )}
            </article>
          ))}
          {integrations.data?.length === 0 && <p>Nenhuma integração cadastrada.</p>}
        </section>
      )}
      {admin && (
        <section className="cartao">
          <h2>Nova integração</h2>
          <form className="catalogo-form" onSubmit={criar}>
            <label>
              Nome da conta
              <input
                required
                minLength={2}
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Plataforma
              <select
                required
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setCredentials({});
                }}
              >
                <option value="">Selecione</option>
                {providers.data?.map((p) => (
                  <option key={p.tipo} value={p.tipo}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
            {providers.data
              ?.find((p) => p.tipo === provider)
              ?.campos.map((field) => (
                <label key={field.chave}>
                  {field.rotulo}
                  <input
                    required={field.obrigatorio}
                    type={
                      field.tipo === 'number' ? 'number' : field.tipo === 'password' ? 'password' : 'text'
                    }
                    autoComplete="off"
                    value={credentials[field.chave] ?? ''}
                    onChange={(e) => setCredentials({ ...credentials, [field.chave]: e.target.value })}
                  />
                  <small>{field.ajuda}</small>
                </label>
              ))}
            <button className="botao" disabled={busy || !provider}>
              Cadastrar integração
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { Estado, mensagem, Paginacao, useCatalogoUsinas, useDados } from './Dados';
interface Settings {
  enabled: boolean;
  recipients: string[];
  statuses: string[];
  revision: number;
  workerEnabled: boolean;
  smtpConfigured: boolean;
}
interface Policy {
  communicationMinutes: number;
  generationEnabled: boolean;
  lowPowerRatio: number;
  highPowerRatio: number;
  durationMinutes: number;
  minimumSamples: number;
  dayStartHour: number;
  dayEndHour: number;
  timeZone: string;
  allowSimulated: boolean;
  revision: number;
}
export function AlertSettings() {
  const settings = useDados<Settings>('/alerts/notification-settings'),
    choices = useCatalogoUsinas();
  const [plant, setPlant] = useState('');
  const policy = useDados<Policy>(plant ? `/plants/${plant}/alert-policy` : null);
  const [form, setForm] = useState<Settings | null>(null),
    [recipients, setRecipients] = useState(''),
    [rules, setRules] = useState<Policy | null>(null),
    [erro, setErro] = useState(''),
    [aviso, setAviso] = useState(''),
    [busy, setBusy] = useState(false);
  const [pagina, setPagina] = useState(1);
  const deliveries = useDados<{
    itens: { id: string; recipient: string; status: string; createdAt: string; failureCode: string | null }[];
    total: number;
  }>(`/alerts/notifications?porPagina=20&pagina=${pagina}`);
  useEffect(() => {
    setForm(settings.data);
    setRecipients(settings.data?.recipients.join('\n') ?? '');
  }, [settings.data]);
  useEffect(() => {
    setRules(policy.data);
  }, [policy.data]);
  async function saveMail(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setErro('');
    setAviso('');
    try {
      await api('/alerts/notification-settings', {
        metodo: 'PATCH',
        corpo: {
          revision: form.revision,
          enabled: form.enabled,
          recipients: recipients
            .split(/[\n,;]/)
            .map((s) => s.trim())
            .filter(Boolean),
          statuses: form.statuses,
        },
      });
      settings.reload();
      setAviso('Configuração salva. Envio depende de SMTP e worker habilitados.');
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setBusy(false);
    }
  }
  async function savePolicy(e: FormEvent) {
    e.preventDefault();
    if (!rules) return;
    setBusy(true);
    setErro('');
    setAviso('');
    try {
      const { revision, ...fields } = rules;
      const allowed = [
        'communicationMinutes',
        'generationEnabled',
        'lowPowerRatio',
        'highPowerRatio',
        'durationMinutes',
        'minimumSamples',
        'dayStartHour',
        'dayEndHour',
        'timeZone',
        'allowSimulated',
      ];
      await api(`/plants/${plant}/alert-policy`, {
        metodo: 'PATCH',
        corpo: {
          revision,
          ...Object.fromEntries(Object.entries(fields).filter(([key]) => allowed.includes(key))),
        },
      });
      policy.reload();
      setAviso('Política de alertas salva.');
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="cartao">
        <h2>Notificações de alarmes</h2>
        <p>
          Somente eventos futuros podem gerar e-mails. DEMO nunca envia notificações. Aceite pelo SMTP não
          comprova entrega na caixa postal.
        </p>
        <Estado {...settings} />
        {erro && (
          <p role="alert" className="erro">
            {erro}
          </p>
        )}
        {aviso && <p role="status">{aviso}</p>}
        {form && (
          <form className="catalogo-form" onSubmit={saveMail}>
            <label className="catalogo-check">
              <input
                type="checkbox"
                checked={form.enabled}
                disabled={busy}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              />
              Habilitar notificações de alarmes
            </label>
            <label>
              Destinatários (um por linha)
              <textarea
                required={form.enabled}
                disabled={busy}
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
              />
            </label>
            <fieldset>
              <legend>Eventos por e-mail</legend>
              {[
                ['OPEN', 'Abertura'],
                ['ACKNOWLEDGED', 'Reconhecimento'],
                ['RESOLVED', 'Resolução'],
              ].map(([key, label]) => (
                <label key={key} className="catalogo-check">
                  <input
                    type="checkbox"
                    checked={form.statuses.includes(key)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        statuses: e.target.checked
                          ? [...form.statuses, key]
                          : form.statuses.filter((s) => s !== key),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <p>
              Worker: {form.workerEnabled ? 'habilitado' : 'desabilitado'} · SMTP:{' '}
              {form.smtpConfigured ? 'configurado' : 'não configurado'}. Sem os dois, não há envio.
            </p>
            <button className="botao" disabled={busy}>
              Salvar notificações
            </button>
          </form>
        )}
      </section>
      <section className="cartao">
        <h2>Política por usina</h2>
        <Estado {...choices} />
        <label>
          Usina da política
          <select value={plant} onChange={(e) => setPlant(e.target.value)}>
            <option value="">Selecione</option>
            {choices.data?.itens.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <Estado {...policy} />
        {rules && (
          <form className="catalogo-form" onSubmit={savePolicy}>
            <label className="catalogo-check">
              <input
                type="checkbox"
                checked={rules.generationEnabled}
                onChange={(e) => setRules({ ...rules, generationEnabled: e.target.checked })}
              />
              Detectar geração anormal
            </label>
            <p className="sutil">
              Limites declarados em relação à potência instalada; não representam previsão meteorológica.
              Exige leituras consecutivas na janela configurada.
            </p>
            {[
              ['communicationMinutes', 'Minutos sem comunicação', 5, 1440],
              ['lowPowerRatio', 'Limite inferior (fração da capacidade)', 0, 2],
              ['highPowerRatio', 'Limite superior (fração da capacidade)', 0, 3],
              ['durationMinutes', 'Persistência mínima (minutos)', 1, 120],
              ['minimumSamples', 'Mínimo de amostras', 2, 100],
              ['dayStartHour', 'Início da janela (hora)', 0, 23],
              ['dayEndHour', 'Fim da janela (hora)', 1, 24],
            ].map(([key, label, min, max]) => (
              <label key={key}>
                {label}
                <input
                  required
                  type="number"
                  step={String(key).includes('Ratio') ? 'any' : '1'}
                  min={min}
                  max={max}
                  value={rules[key as keyof Policy] as number}
                  onChange={(e) => setRules({ ...rules, [key]: Number(e.target.value) })}
                />
              </label>
            ))}
            <label>
              Fuso da política
              <input
                required
                value={rules.timeZone}
                onChange={(e) => setRules({ ...rules, timeZone: e.target.value })}
              />
            </label>
            <label className="catalogo-check">
              <input
                type="checkbox"
                checked={rules.allowSimulated}
                onChange={(e) => setRules({ ...rules, allowSimulated: e.target.checked })}
              />
              Avaliar geração DEMO como simulação (sem e-mail)
            </label>
            <button className="botao" disabled={busy}>
              Salvar política
            </button>
          </form>
        )}
      </section>
      <section className="cartao">
        <h2>Histórico de e-mails</h2>
        <button onClick={deliveries.reload}>Atualizar entregas</button>
        <Estado {...deliveries} />
        <p>SENT = aceito pelo SMTP; UNKNOWN = resultado incerto, sem reenvio automático.</p>
        <ul>
          {deliveries.data?.itens.map((item) => (
            <li key={item.id}>
              {item.recipient} · {item.status} · {new Date(item.createdAt).toLocaleString('pt-BR')}
              {item.failureCode ? ` · ${item.failureCode}` : ''}
            </li>
          ))}
        </ul>
        {deliveries.data?.total === 0 && <p>Nenhum envio registrado.</p>}
        {deliveries.data && <Paginacao pagina={pagina} total={deliveries.data.total} mudar={setPagina} />}
      </section>
    </>
  );
}

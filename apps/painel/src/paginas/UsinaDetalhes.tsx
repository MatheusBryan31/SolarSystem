import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, listarTudo } from '../api';
import { useAuth } from '../auth';
import { Estado, mensagem, Titulo, UFS, useDados } from '../componentes/Dados';
import type { Usina } from '../tipos';

const fields = [
  ['name', 'Nome', 'text'],
  ['capacityKwp', 'Potência instalada (kWp)', 'number'],
  ['nominalPowerKw', 'Potência nominal (kW)', 'number'],
  ['moduleTiltDegrees', 'Inclinação (graus)', 'number'],
  ['operationStartDate', 'Início da operação', 'date'],
  ['postalCode', 'CEP', 'text'],
  ['street', 'Logradouro', 'text'],
  ['addressNumber', 'Número', 'text'],
  ['addressComplement', 'Complemento', 'text'],
  ['city', 'Cidade', 'text'],
  ['latitude', 'Latitude', 'number'],
  ['longitude', 'Longitude', 'number'],
] as const;
export function UsinaDetalhes({ nova = false }: { nova?: boolean }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const result = useDados<Usina>(nova ? null : `/plants/${id}`);
  const [values, setValues] = useState<Record<string, string>>({}),
    [original, setOriginal] = useState<Record<string, string>>({}),
    [cliente, setCliente] = useState(''),
    [clientes, setClientes] = useState<{ id: string; name: string }[]>([]),
    [erro, setErro] = useState(''),
    [aviso, setAviso] = useState(''),
    [busy, setBusy] = useState(false);
  const staff = usuario?.role !== 'CLIENT';
  useEffect(() => {
    if (nova || result.data) {
      const record = result.data as unknown as Record<string, unknown> | null;
      const initial = Object.fromEntries(
        [...fields.map(([key]) => key), 'technicalNotes', 'installationType', 'state'].map((key) => [
          key,
          String(record?.[key] ?? ''),
        ]),
      );
      setValues(initial);
      setOriginal(initial);
      setCliente(result.data?.clientId ?? '');
    }
  }, [result.data, nova]);
  useEffect(() => {
    let active = true;
    if (staff)
      void listarTudo<{ id: string; name: string }>('/clients')
        .then((data) => {
          if (active) setClientes(data);
        })
        .catch((e: unknown) => {
          if (active) setErro(mensagem(e));
        });
    return () => {
      active = false;
    };
  }, [staff]);
  async function salvar(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErro('');
    setAviso('');
    try {
      const body: Record<string, unknown> = nova ? {} : { revision: result.data!.revision };
      for (const [key, type] of [
        ...fields.map(([key, , type]) => [key, type]),
        ['state', 'text'],
        ['installationType', 'text'],
        ['technicalNotes', 'text'],
      ]) {
        const value = values[key] ?? '';
        if (nova ? value !== '' : value !== original[key])
          body[key] = value === '' ? null : type === 'number' ? Number(value) : value;
      }
      if (nova) body.clientId = cliente || undefined;
      if (!nova && Object.keys(body).length === 1) throw new Error('Nenhuma informação alterada.');
      const saved = await api<Usina>(nova ? '/plants' : `/plants/${id}`, {
        metodo: nova ? 'POST' : 'PATCH',
        corpo: body,
      });
      setAviso('Usina salva.');
      if (nova) navigate(`/usinas/${saved.id}`);
      else result.reload();
    } catch (error) {
      setErro(mensagem(error));
    } finally {
      setBusy(false);
    }
  }
  async function vincularCliente() {
    setBusy(true);
    setErro('');
    try {
      await api(`/plants/${id}/client`, { metodo: 'PATCH', corpo: { clientId: cliente || null } });
      setAviso('Cliente atualizado.');
      result.reload();
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setBusy(false);
    }
  }
  if (nova && !staff) return <p role="alert">Cadastro permitido somente à equipe.</p>;
  return (
    <div className="catalogo-usinas">
      <Titulo titulo={nova ? 'Cadastro de usina' : (result.data?.name ?? 'Detalhes da usina')}>
        <Link to="/usinas">Voltar às usinas</Link>
        {!nova && (
          <>
            <Link to={`/inversores?usina=${id}`}>Inversores</Link>
            <Link to={`/relatorios?usina=${id}`}>Relatórios</Link>
          </>
        )}
      </Titulo>
      <Estado {...result} />
      {erro && (
        <p role="alert" className="erro">
          {erro}
        </p>
      )}
      {aviso && <p role="status">{aviso}</p>}
      {(nova || result.data) && (
        <section className="cartao">
          <h2>Informações cadastrais e técnicas</h2>
          {result.data?.integration?.provider === 'DEMO' && (
            <p className="aviso-simulacao">Fonte DEMO: leituras simuladas.</p>
          )}
          <p className="sutil">
            Nome, cidade, UF e potência instalada editados manualmente têm precedência sobre a plataforma. Os
            demais campos são locais. Campos vazios alterados serão limpos.
          </p>
          <form className="catalogo-form" onSubmit={salvar}>
            <fieldset className="campos-grade" disabled={!staff || busy}>
              {fields.map(([key, label, type]) => (
                <label key={key}>
                  {label}
                  <input
                    type={type}
                    step={type === 'number' ? 'any' : undefined}
                    min={type === 'number' && !['latitude', 'longitude'].includes(key) ? 0 : undefined}
                    max={
                      key === 'moduleTiltDegrees'
                        ? 90
                        : key === 'latitude'
                          ? 90
                          : key === 'longitude'
                            ? 180
                            : undefined
                    }
                    required={key === 'name'}
                    value={values[key] ?? ''}
                    onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                  />
                </label>
              ))}
              <label>
                UF
                <select
                  value={values.state ?? ''}
                  onChange={(e) => setValues({ ...values, state: e.target.value })}
                >
                  <option value="">Não informado</option>
                  {values.state && !UFS.includes(values.state) && <option>{values.state}</option>}
                  {UFS.map((uf) => (
                    <option key={uf}>{uf}</option>
                  ))}
                </select>
              </label>
              <label>
                Tipo de instalação
                <select
                  value={values.installationType ?? ''}
                  onChange={(e) => setValues({ ...values, installationType: e.target.value })}
                >
                  <option value="">Não informado</option>
                  {[
                    ['GROUND', 'Solo'],
                    ['ROOFTOP', 'Telhado'],
                    ['HYBRID', 'Híbrida'],
                    ['CARPORT', 'Carport'],
                    ['FLOATING', 'Flutuante'],
                    ['OTHER', 'Outro'],
                  ].map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Observações técnicas
                <textarea
                  maxLength={5000}
                  value={values.technicalNotes ?? ''}
                  onChange={(e) => setValues({ ...values, technicalNotes: e.target.value })}
                />
              </label>
            </fieldset>
            {nova && (
              <label>
                Cliente
                <select value={cliente} onChange={(e) => setCliente(e.target.value)}>
                  <option value="">Sem vínculo</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {staff && (
              <button className="botao" disabled={busy}>
                {busy ? 'Salvando…' : 'Salvar usina'}
              </button>
            )}
          </form>
        </section>
      )}
      {!nova && result.data && (
        <section className="cartao">
          <h2>Vínculo comercial</h2>
          <p>{result.data.client?.name ?? 'Sem cliente vinculado'}</p>
          {staff && (
            <div className="filtros">
              <label>
                Cliente responsável
                <select value={cliente} onChange={(e) => setCliente(e.target.value)}>
                  <option value="">Sem vínculo</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={busy} onClick={() => void vincularCliente()}>
                Atualizar cliente
              </button>
            </div>
          )}
          <p className="sutil">
            Origem: {result.data.origin} · Monitoramento: {result.data.monitoring} · Última leitura:{' '}
            {result.data.lastDataAt ? new Date(result.data.lastDataAt).toLocaleString('pt-BR') : 'Sem dados'}
          </p>
        </section>
      )}
    </div>
  );
}

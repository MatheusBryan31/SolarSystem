import { useEffect, useState } from 'react';
import { listarTudo } from '../api';
import { useAuth } from '../auth';
import { Icone, type NomeIcone } from '../componentes/Icone';
import * as f from '../formatos';
import type { Alerta, StatusUsina, Usina } from '../tipos';

const statusInfo: Record<StatusUsina, { rotulo: string; classe: string }> = {
  ONLINE: { rotulo: 'Online', classe: 'ok' },
  WARNING: { rotulo: 'Atenção', classe: 'atencao' },
  FAULT: { rotulo: 'Falha', classe: 'perigo' },
  OFFLINE: { rotulo: 'Offline', classe: 'desligado' },
  UNKNOWN: { rotulo: 'Sem dados', classe: 'neutro' },
};

const soma = (usinas: Usina[], campo: (u: Usina) => number | null) =>
  usinas.reduce((total, u) => total + (campo(u) ?? 0), 0);

// A tela "Visão geral": tudo aqui vem da API, nada é inventado no front
export function Inicio() {
  const { usuario } = useAuth();
  const [usinas, setUsinas] = useState<Usina[] | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [erro, setErro] = useState('');
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let active = true;
    const carregar = () =>
      Promise.all([listarTudo<Usina>('/plants'), listarTudo<Alerta>('/alerts?ativos=true')])
        .then(([u, a]) => {
          if (!active) return;
          setUsinas(u);
          setAlertas(a);
          setErro('');
        })
        .catch((e: unknown) => {
          if (active) setErro(e instanceof Error ? e.message : 'Falha ao carregar');
        });
    void carregar();
    const timer = setInterval(carregar, 60_000); // a coleta roda a cada 10 min; o painel confere a cada 1
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [tentativa]);

  if (erro)
    return (
      <div role="alert" className="erro">
        {erro}
        <button
          onClick={() => {
            setErro('');
            setTentativa((v) => v + 1);
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  if (!usinas) return <div className="carregando">Carregando dados das usinas...</div>;

  // ===== Os números (calculados a partir das usinas) =====
  const capacidadeTotal = soma(usinas, (u) => u.capacityKwp);
  const potenciaAgora = soma(usinas, (u) => u.currentPowerKw);
  const energiaHoje = soma(usinas, (u) => u.todayEnergyKwh);
  const energiaTotal = soma(usinas, (u) => u.totalEnergyKwh);
  const temPotencia = usinas.some((u) => u.currentPowerKw !== null);
  const temEnergiaHoje = usinas.some((u) => u.todayEnergyKwh !== null);
  const temEnergiaTotal = usinas.some((u) => u.totalEnergyKwh !== null);
  const capacidadeMonitorada = soma(
    usinas.filter((u) => u.monitoring === 'ACTIVE' && u.currentPowerKw !== null),
    (u) => u.capacityKwp,
  );
  const fator = capacidadeMonitorada > 0 ? potenciaAgora / capacidadeMonitorada : 0;
  const online = usinas.filter((u) => u.status === 'ONLINE').length;
  const criticos = alertas.filter((a) => a.severity === 'CRITICAL').length;
  const leituras = usinas.map((u) => u.lastDataAt).filter((d): d is string => d !== null);
  const ultimaLeitura = leituras.sort().at(-1);

  const ranking = [...usinas].sort((a, b) => (b.todayEnergyKwh ?? 0) - (a.todayEnergyKwh ?? 0)).slice(0, 8);
  const maiorGeracao = Math.max(1, ...ranking.map((u) => u.todayEnergyKwh ?? 0));

  const contagem = (Object.keys(statusInfo) as StatusUsina[])
    .map((s) => ({ status: s, qtd: usinas.filter((u) => u.status === s).length }))
    .filter((c) => c.qtd > 0);

  const cartoes: { icone: NomeIcone; cor: string; rotulo: string; valor: string; detalhe: string }[] = [
    {
      icone: 'usina',
      cor: 'verde',
      rotulo: 'Usinas monitoradas',
      valor: String(usinas.length),
      detalhe: `${online} online agora`,
    },
    {
      icone: 'raio',
      cor: 'azul',
      rotulo: 'Potência instalada',
      valor: usinas.some((u) => u.capacityKwp !== null) ? f.capacidade(capacidadeTotal) : '—',
      detalhe: temPotencia
        ? `${f.potencia(potenciaAgora)} nas leituras disponíveis`
        : 'Sem leitura atual de potência',
    },
    {
      icone: 'grafico',
      cor: 'ambar',
      rotulo: 'Energia gerada hoje',
      valor: temEnergiaHoje ? f.energia(energiaHoje) : '—',
      detalhe: temEnergiaTotal
        ? `${f.energia(energiaTotal)} nas leituras disponíveis`
        : 'Sem leitura de energia',
    },
    {
      icone: 'alerta',
      cor: 'vermelho',
      rotulo: 'Alertas ativos',
      valor: String(alertas.length),
      detalhe: criticos > 0 ? `${criticos} crítico(s)` : 'Nenhum crítico',
    },
  ];

  // O anel do fator de capacidade: circunferência de raio 52
  const circunferencia = 2 * Math.PI * 52;

  return (
    <div className="visao-geral">
      <p className="aviso-simulacao">
        O catálogo atual da API suporta apenas DEMO. As leituras dessas integrações são simuladas. Campos sem
        leitura não representam geração zero.
      </p>
      <section className="faixa">
        <div>
          <span className="selo">
            <Icone nome="sol" tamanho={16} /> {f.saudacao()}, {usuario?.nome.split(' ')[0]}
          </span>
          <h1>
            {temPotencia ? f.potencia(potenciaAgora) : '—'}{' '}
            <small>{temPotencia ? 'nas leituras atuais disponíveis' : 'sem leitura atual de potência'}</small>
          </h1>
          <p>
            {usinas.length} usina(s) monitorada(s)
            {ultimaLeitura && ` · última leitura às ${f.hora(ultimaLeitura)}`}
          </p>
        </div>
        <div className={`faixa-status ${criticos > 0 ? 'tem-alerta' : ''}`}>
          <Icone nome={criticos > 0 ? 'alerta' : 'check'} tamanho={22} />
          <div>
            <strong>{criticos > 0 ? `${criticos} alerta(s) crítico(s)` : 'Sem alertas críticos'}</strong>
            <small>
              {usinas.filter((u) => u.monitoring === 'ACTIVE').length} com leitura atual •{' '}
              {usinas.filter((u) => u.monitoring !== 'ACTIVE').length} sem leitura atual
            </small>
          </div>
        </div>
      </section>

      {usinas.length === 0 ? (
        <section className="cartao vazio">
          <Icone nome="usina" tamanho={40} />
          <h2>Nenhuma usina por aqui ainda</h2>
          <p className="sutil">
            Cadastre uma usina manual ou revise e confirme uma descoberta de integração para começar.
          </p>
        </section>
      ) : (
        <>
          <section className="kpis">
            {cartoes.map((c) => (
              <article key={c.rotulo} className="cartao kpi">
                <span className={`kpi-icone ${c.cor}`}>
                  <Icone nome={c.icone} tamanho={22} />
                </span>
                <div>
                  <span className="kpi-rotulo">{c.rotulo}</span>
                  <strong className="kpi-valor">{c.valor}</strong>
                  <span className="kpi-detalhe">{c.detalhe}</span>
                </div>
              </article>
            ))}
          </section>

          <section className="grade">
            <article className="cartao">
              <header className="cartao-topo">
                <h2>Desempenho agora</h2>
                <span className="etiqueta">
                  {usinas.some((u) => u.monitoring === 'ACTIVE')
                    ? 'Leituras disponíveis'
                    : 'Sem leitura atual'}
                </span>
              </header>
              <div className="anel-area">
                <svg
                  viewBox="0 0 120 120"
                  className="anel"
                  role="img"
                  aria-label={
                    capacidadeMonitorada > 0
                      ? `Fator de capacidade monitorada ${f.porcentagem(fator)}`
                      : 'Fator de capacidade indisponível'
                  }
                >
                  <circle cx="60" cy="60" r="52" className="anel-fundo" />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    className="anel-valor"
                    strokeDasharray={circunferencia}
                    strokeDashoffset={circunferencia * (1 - Math.min(fator, 1))}
                  />
                </svg>
                <div className="anel-texto">
                  <strong>{capacidadeMonitorada > 0 ? f.porcentagem(fator) : '—'}</strong>
                  <span>da capacidade monitorada</span>
                </div>
              </div>
              <dl className="numeros">
                <div>
                  <dt>Gerando agora</dt>
                  <dd>{temPotencia ? f.potencia(potenciaAgora) : '—'}</dd>
                </div>
                <div>
                  <dt>Capacidade</dt>
                  <dd>{f.capacidade(capacidadeTotal)}</dd>
                </div>
              </dl>
            </article>

            <article className="cartao largo">
              <header className="cartao-topo">
                <h2>Geração de hoje por usina</h2>
                <span className="sutil">
                  {temEnergiaHoje
                    ? `${f.energia(energiaHoje)} nas leituras disponíveis`
                    : 'Sem leitura de energia'}
                </span>
              </header>
              <ul className="barras">
                {ranking.map((u) => (
                  <li key={u.id}>
                    <span className="barras-nome" title={u.name}>
                      {u.name}
                    </span>
                    <span className="barras-trilho">
                      <span
                        className={`barras-valor ${statusInfo[u.status].classe}`}
                        style={{ width: `${((u.todayEnergyKwh ?? 0) / maiorGeracao) * 100}%` }}
                      />
                    </span>
                    <span className="barras-numero">
                      {u.todayEnergyKwh === null ? '—' : f.energia(u.todayEnergyKwh)}
                    </span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="cartao">
              <header className="cartao-topo">
                <h2>Status das usinas</h2>
              </header>
              <div className="pilha" role="img" aria-label="Distribuição das usinas por status">
                {contagem.map((c) => (
                  <span key={c.status} className={statusInfo[c.status].classe} style={{ flexGrow: c.qtd }} />
                ))}
              </div>
              <ul className="legenda">
                {contagem.map((c) => (
                  <li key={c.status}>
                    <i className={statusInfo[c.status].classe} />
                    {statusInfo[c.status].rotulo}
                    <b>{c.qtd}</b>
                  </li>
                ))}
              </ul>
            </article>

            <article className="cartao largo">
              <header className="cartao-topo">
                <h2>Alertas que precisam de atenção</h2>
                <span className="sutil">{alertas.length} ativo(s)</span>
              </header>
              {alertas.length === 0 ? (
                <p className="tudo-certo">
                  <Icone nome="check" /> Nenhum alerta ativo. Todas as usinas operando normalmente.
                </p>
              ) : (
                <ul className="alertas">
                  {alertas.slice(0, 5).map((a) => (
                    <li key={a.id}>
                      <span className={`alerta-icone ${a.severity === 'CRITICAL' ? 'perigo' : 'atencao'}`}>
                        <Icone nome="alerta" tamanho={18} />
                      </span>
                      <div>
                        <strong>{a.plant?.name ?? 'Integração'}</strong>
                        <span>{a.message}</span>
                      </div>
                      <span className="alerta-quando">
                        <Icone nome="relogio" tamanho={14} /> {f.haQuantoTempo(a.openedAt)}
                        {a.status === 'ACKNOWLEDGED' && <em>Reconhecido</em>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        </>
      )}
    </div>
  );
}

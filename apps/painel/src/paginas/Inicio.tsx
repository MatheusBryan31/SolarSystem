import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Icone, type NomeIcone } from '../componentes/Icone';
import * as f from '../formatos';
import type { Alerta, Pagina, StatusUsina, Usina } from '../tipos';

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

  useEffect(() => {
    const carregar = () =>
      Promise.all([
        api<Pagina<Usina>>('/plants?porPagina=100'),
        api<Pagina<Alerta>>('/alerts?ativos=true&porPagina=100'),
      ])
        .then(([u, a]) => {
          setUsinas(u.itens);
          setAlertas(a.itens);
          setErro('');
        })
        .catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Falha ao carregar'));
    void carregar();
    const timer = setInterval(carregar, 60_000); // a coleta roda a cada 10 min; o painel confere a cada 1
    return () => clearInterval(timer);
  }, []);

  if (erro) return <p className="erro">{erro}</p>;
  if (!usinas) return <div className="carregando">Carregando dados das usinas...</div>;

  // ===== Os números (calculados a partir das usinas) =====
  const capacidadeTotal = soma(usinas, (u) => u.capacityKwp);
  const potenciaAgora = soma(usinas, (u) => u.currentPowerKw);
  const energiaHoje = soma(usinas, (u) => u.todayEnergyKwh);
  const energiaTotal = soma(usinas, (u) => u.totalEnergyKwh);
  const fator = capacidadeTotal > 0 ? potenciaAgora / capacidadeTotal : 0;
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
      valor: f.capacidade(capacidadeTotal),
      detalhe: `${f.potencia(potenciaAgora)} gerando agora`,
    },
    {
      icone: 'grafico',
      cor: 'ambar',
      rotulo: 'Energia gerada hoje',
      valor: f.energia(energiaHoje),
      detalhe: `${f.energia(energiaTotal)} acumulados`,
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
      <section className="faixa">
        <div>
          <span className="selo">
            <Icone nome="sol" tamanho={16} /> {f.saudacao()}, {usuario?.nome.split(' ')[0]}
          </span>
          <h1>
            {f.potencia(potenciaAgora)} <small>sendo gerados agora</small>
          </h1>
          <p>
            {usinas.length} usina(s) monitorada(s)
            {ultimaLeitura && ` · última leitura às ${f.hora(ultimaLeitura)}`}
          </p>
        </div>
        <div className={`faixa-status ${criticos > 0 ? 'tem-alerta' : ''}`}>
          <Icone nome={criticos > 0 ? 'alerta' : 'check'} tamanho={22} />
          <div>
            <strong>{criticos > 0 ? `${criticos} alerta(s) crítico(s)` : 'Tudo operando'}</strong>
            <small>{criticos > 0 ? 'Precisam de atenção' : 'Nenhum problema crítico'}</small>
          </div>
        </div>
      </section>

      {usinas.length === 0 ? (
        <section className="cartao vazio">
          <Icone nome="usina" tamanho={40} />
          <h2>Nenhuma usina por aqui ainda</h2>
          <p className="sutil">
            Assim que uma integração for cadastrada e sincronizada, as usinas aparecem nesta tela.
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
                <span className="etiqueta">Ao vivo</span>
              </header>
              <div className="anel-area">
                <svg
                  viewBox="0 0 120 120"
                  className="anel"
                  role="img"
                  aria-label={`Fator de capacidade ${f.porcentagem(fator)}`}
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
                  <strong>{f.porcentagem(fator)}</strong>
                  <span>da capacidade</span>
                </div>
              </div>
              <dl className="numeros">
                <div>
                  <dt>Gerando agora</dt>
                  <dd>{f.potencia(potenciaAgora)}</dd>
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
                <span className="sutil">{f.energia(energiaHoje)} no total</span>
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
                    <span className="barras-numero">{f.energia(u.todayEnergyKwh ?? 0)}</span>
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

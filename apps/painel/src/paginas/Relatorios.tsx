import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Estado, dataHora, Titulo, useDados, useCatalogoUsinas } from '../componentes/Dados';
import type { Pagina, Usina } from '../tipos';
interface Reading {
  id: string;
  measuredAt: string;
  powerKw: number | null;
  totalEnergyKwh: number | null;
  periodEnergyKwh: number | null;
  isSimulated: boolean;
  quality: string;
}
interface Bucket {
  bucket: string;
  peakPowerKw: number | null;
  observedPeriodEnergyKwh: number | null;
  samples: number;
  excludedPeriods: number;
  simulated: boolean;
}
export function Relatorios() {
  const [params] = useSearchParams();
  const [plant, setPlant] = useState(params.get('usina') ?? ''),
    [start, setStart] = useState(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 16)),
    [end, setEnd] = useState(new Date().toISOString().slice(0, 16)),
    [period, setPeriod] = useState('history'),
    [zone, setZone] = useState('America/Sao_Paulo'),
    [sim, setSim] = useState(false),
    [path, setPath] = useState<string | null>(null),
    [pagina, setPagina] = useState(1),
    [formError, setFormError] = useState('');
  const choices = useCatalogoUsinas(),
    selected = useDados<Usina>(plant ? `/plants/${plant}` : null);
  const result = useDados<Pagina<Reading> | { buckets: Bucket[] }>(
    path ? `${path}${period === 'history' ? `&pagina=${pagina}&porPagina=100` : ''}` : null,
  );
  function consultar(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (new Date(start + 'Z') >= new Date(end + 'Z')) {
      setFormError('O fim deve ser posterior ao início.');
      return;
    }
    if (period !== 'history' && !selected.data?.activeLink?.id) {
      setFormError('Sem fonte ativa disponível para agregação. Consulte o histórico ou revise os vínculos.');
      return;
    }
    const q = new URLSearchParams({
      from: new Date(start + 'Z').toISOString(),
      to: new Date(end + 'Z').toISOString(),
      includeSimulated: String(sim),
    });
    if (period !== 'history') {
      q.set('sourceLinkId', selected.data!.activeLink!.id);
      q.set('period', period);
      q.set('timeZone', zone);
    }
    setPagina(1);
    setPath(`/plants/${plant}/measurements${period === 'history' ? '' : '/aggregations'}?${q}`);
    result.reload();
  }
  const rows = result.data ? ('itens' in result.data ? result.data.itens : result.data.buckets) : [];
  function exportar() {
    const cells = rows.map((row) =>
      'measuredAt' in row
        ? [
            row.measuredAt,
            row.powerKw,
            row.totalEnergyKwh,
            row.periodEnergyKwh,
            row.quality,
            row.isSimulated ? 'SIMULADO' : 'NÃO SIMULADO',
          ]
        : [
            row.bucket,
            row.peakPowerKw,
            '',
            row.observedPeriodEnergyKwh,
            `Amostras: ${row.samples}; períodos excluídos: ${row.excludedPeriods}`,
            row.simulated ? 'SIMULADO' : 'NÃO SIMULADO',
          ],
    );
    const csv = [
      [
        'Instante/período',
        'Potência kW',
        'Acumulador kWh',
        'Energia período kWh',
        'Qualidade/cobertura',
        'Origem',
      ],
      ...cells,
    ]
      .map((line) =>
        line
          .map(
            (cell) =>
              `"${String(cell ?? '')
                .replace(/^[=+@-]/, "'$&")
                .replaceAll('"', '""')}"`,
          )
          .join(';'),
      )
      .join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'solarsystem-medicoes.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="catalogo-usinas">
      <Titulo titulo="Relatórios" />
      <section className="cartao">
        <form className="catalogo-form" onSubmit={consultar}>
          <label>
            Usina
            <select
              required
              value={plant}
              onChange={(e) => {
                setPlant(e.target.value);
                setPath(null);
              }}
            >
              <option value="">Selecione</option>
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
            Início (UTC)
            <input
              type="datetime-local"
              required
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setPath(null);
              }}
            />
          </label>
          <label>
            Fim exclusivo (UTC)
            <input
              type="datetime-local"
              required
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                setPath(null);
              }}
            />
          </label>
          <label>
            Apresentação
            <select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setPath(null);
              }}
            >
              {[
                ['history', 'Leituras'],
                ['day', 'Diário'],
                ['month', 'Mensal'],
                ['year', 'Anual'],
              ].map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fuso da agregação
            <input
              required
              value={zone}
              onChange={(e) => {
                setZone(e.target.value);
                setPath(null);
              }}
            />
          </label>
          <label className="catalogo-check">
            <input
              type="checkbox"
              checked={sim}
              onChange={(e) => {
                setSim(e.target.checked);
                setPath(null);
              }}
            />
            Incluir dados simulados (DEMO)
          </label>
          <button className="botao" disabled={!plant || selected.loading || result.loading}>
            Consultar relatório
          </button>
        </form>
        <p className="sutil">
          Não somamos potência ou acumuladores. Energia de período desconhecida aparece como —. Agregações
          representam períodos observados, sem garantia de cobertura completa. Máximo de 366 dias nas leituras
          e 50.000 amostras por agregação. Instantes das leituras são exibidos no fuso do navegador; os
          filtros de início e fim são UTC.
        </p>
      </section>
      <Estado {...choices} />
      <Estado {...selected} />
      <Estado {...result} />
      {formError && (
        <p role="alert" className="erro">
          {formError}
        </p>
      )}
      {result.data && (
        <section className="cartao">
          <header className="catalogo-heading">
            <h2>Resultado da consulta</h2>
            <button disabled={!rows.length} onClick={exportar}>
              Exportar página em CSV
            </button>
          </header>
          <div className="tabela-rolagem">
            <table>
              <thead>
                <tr>
                  <th>Instante/período</th>
                  <th>Potência (kW)</th>
                  <th>Acumulador (kWh)</th>
                  <th>Energia de período (kWh)</th>
                  <th>Qualidade</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {'measuredAt' in r ? (
                      <>
                        <td>{dataHora(r.measuredAt)}</td>
                        <td>{r.powerKw ?? '—'}</td>
                        <td>{r.totalEnergyKwh ?? '—'}</td>
                        <td>{r.periodEnergyKwh ?? '—'}</td>
                        <td>
                          {r.quality}
                          {r.isSimulated ? ' · SIMULADO' : ''}
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{r.bucket}</td>
                        <td>{r.peakPowerKw ?? '—'}</td>
                        <td>Não somado</td>
                        <td>{r.observedPeriodEnergyKwh ?? '—'}</td>
                        <td>
                          {r.samples} amostras · {r.excludedPeriods} períodos excluídos · cobertura não
                          estabelecida{r.simulated ? ' · SIMULADO' : ''}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && <p>Sem medições no intervalo e filtros informados.</p>}
          {'itens' in result.data && (
            <div className="paginacao">
              <button disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>
                Anterior
              </button>
              <span>
                Página {pagina} · {result.data.total} leituras
              </span>
              <button disabled={pagina * 100 >= result.data.total} onClick={() => setPagina(pagina + 1)}>
                Próxima
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

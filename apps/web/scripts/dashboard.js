/* SolarSystem — interações exclusivas da Visão Geral.
   Reaproveita o array `plants` carregado pelo app.js e não altera seus dados. */
(() => {
  'use strict';

  const dashboardPlants = plants;
  const $ = byId;
  const fmt = (value, decimals = 0) =>
    Number(value).toLocaleString('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  const total = dashboardPlants.length;
  const counts = { Online: 0, Atenção: 0, Offline: 0, 'Sem dados': 0 };
  dashboardPlants.forEach((plant) => counts[statusOf(plant)]++);
  const capacity = dashboardPlants.reduce((sum, plant) => sum + Number(plant.capacity || 0), 0);
  const openAlarms = dashboardPlants.flatMap((plant) =>
    (plant.alarms || []).filter((alarm) => alarm.status === 'Aberto').map((alarm) => ({ plant, alarm })),
  );

  $('metric-plants').textContent = total;
  $('metric-capacity').textContent = `${formatNumber(capacity)} kWp`;
  $('metric-alarms').textContent = openAlarms.length;
  $('count-online').textContent = counts.Online;
  $('count-attention').textContent = counts.Atenção;
  $('count-offline').textContent = counts.Offline;
  $('count-unknown').textContent = counts['Sem dados'];
  fillPlantsTable($('recent-plants'), dashboardPlants.slice(0, 5));
  $('dash-total-plants').textContent = fmt(total);
  $('dash-ring-total').textContent = fmt(total);
  $('dash-capacity-detail').textContent = `${formatNumber(capacity)} kWp`;
  $('dash-map-total').textContent = fmt(total);
  $('dash-map-online').textContent = fmt(counts.Online);
  $('dash-map-attention').textContent = fmt(counts.Atenção);
  $('dash-map-offline').textContent = fmt(counts.Offline);

  $('dash-map-unknown').textContent = counts['Sem dados'];

  const statusRing = $('dash-status-ring');
  if (total > 0) {
    const online = (counts.Online / total) * 100;
    const attention = ((counts.Online + counts.Atenção) / total) * 100;
    const offline = attention + (counts.Offline / total) * 100;
    statusRing.style.background = `conic-gradient(#13b450 0 ${online}%, #ffa916 ${online}% ${attention}%, #f23c4a ${attention}% ${offline}%, #718299 ${offline}% 100%)`;
  }
  statusRing.setAttribute(
    'aria-label',
    `${counts.Online} online, ${counts.Atenção} em atenção, ${counts.Offline} offline, ${counts['Sem dados']} sem dados`,
  );

  // Lista de alarmes baseada somente no cadastro local (não há atualização ao vivo).
  const alarmList = $('dash-alarm-list');
  if (openAlarms.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'dash-empty';
    empty.textContent = 'Nenhum alarme em aberto nos dados locais.';
    alarmList.append(empty);
  } else {
    openAlarms.slice(0, 4).forEach(({ plant, alarm }) => {
      const link = document.createElement('a');
      link.className = 'dash-alarm-item';
      link.href = `detalhes.html?id=${encodeURIComponent(plant.id)}`;
      const glyph = document.createElement('span');
      glyph.className = `dash-alarm-glyph${alarm.severity === 'Média' || alarm.severity === 'Baixa' ? ' medium' : ''}`;
      glyph.setAttribute('aria-hidden', 'true');
      glyph.textContent = '⚠';
      const detail = document.createElement('span');
      detail.className = 'dash-alarm-content';
      const name = document.createElement('strong');
      name.textContent = alarm.title;
      const description = document.createElement('small');
      description.textContent = `${plant.name} · ${alarm.date || 'Data não informada'}`;
      detail.append(name, description);
      link.append(glyph, detail);
      alarmList.append(link);
    });
  }

  // Apenas cidades de referência conhecidas têm posições aproximadas.
  // Outros cadastros continuam listados no painel, mas não recebem um marcador inventado.
  const cityPositions = {
    'Uberlândia-MG': [214, 188],
    'Montes Claros-MG': [245, 173],
    'Juiz de Fora-MG': [249, 209],
  };
  const svgNamespace = 'http://www.w3.org/2000/svg';
  dashboardPlants.forEach((plant) => {
    const coordinates = cityPositions[`${plant.city}-${plant.state}`];
    if (!coordinates) return;
    const dot = document.createElementNS(svgNamespace, 'circle');
    dot.setAttribute('cx', coordinates[0]);
    dot.setAttribute('cy', coordinates[1]);
    dot.setAttribute('r', '7');
    dot.setAttribute(
      'class',
      `dash-map-point ${statusOf(plant) === 'Atenção' ? 'attention' : statusOf(plant) === 'Sem dados' ? 'unknown' : statusOf(plant).toLowerCase()}`,
    );
    const tooltip = document.createElementNS(svgNamespace, 'title');
    tooltip.textContent = `${plant.name} — ${plant.city}/${plant.state} — ${statusOf(plant)} (posição aproximada)`;
    dot.append(tooltip);
    $('dash-map-points').append(dot);
  });

  // Gráficos de EXEMPLO: NÃO são leituras reais de inversores ou de uma API.
  const monthlySamples = [24, 31, 28, 36, 35, 41, 44, 43, 39, 48, 47, 43, 46, 52, 49, 55, 58];
  const monthlyScale = 771.49 / monthlySamples.reduce((a, b) => a + b, 0);
  const monthValues = [...monthlySamples.map((v) => v * monthlyScale), ...Array(13).fill(0)];
  const periods = {
    dia: {
      description: 'Produção por hora (simulação)',
      unit: 'kWh',
      values: [0, 0.03, 0.08, 0.18, 0.32, 0.43, 0.48, 0.41, 0.31, 0.2, 0.11, 0.04],
      labels: ['06h', '07h', '08h', '09h', '10h', '11h', '12h', '13h', '14h', '15h', '16h', '17h'],
    },
    semana: {
      description: 'Produção nos últimos 7 dias (simulação)',
      unit: 'kWh',
      values: [24, 31, 28, 36, 35, 41, 44],
      labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
    },
    mes: {
      description: 'Produção do mês (simulação)',
      unit: 'kWh',
      values: monthValues,
      labels: Array.from({ length: 30 }, (_, i) => String(i + 1)),
    },
    ano: {
      description: 'Produção anual (simulação)',
      unit: 'MWh',
      values: [4.2, 4.7, 5.1, 5.9, 6.4, 6.8, 6.7, 6.2, 5.8, 5.1, 4.5, 3.7],
      labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
    },
  };

  for (const key of ['dia', 'mes', 'ano']) {
    const { values, unit } = periods[key];
    $(`energy-${key}`).textContent = `${fmt(
      values.reduce((sum, value) => sum + value, 0),
      2,
    )} ${unit}`;
  }
  $('dash-energy-total').textContent = $('energy-mes').textContent;

  const renderChart = (periodKey) => {
    const period = periods[periodKey];
    if (!period) return;
    const chart = $('dash-chart');
    chart.replaceChildren();
    const highest = Math.max(1, ...period.values);
    const chartCeiling = Math.ceil(highest / (highest <= 5 ? 0.5 : 10)) * (highest <= 5 ? 0.5 : 10);
    $('dash-chart-description').textContent = period.description;
    $('dash-chart-total').textContent = `${fmt(
      period.values.reduce((sum, value) => sum + value, 0),
      2,
    )} ${period.unit}`;
    chart.setAttribute(
      'aria-label',
      `${period.description}. Total: ${$('dash-chart-total').textContent}. Dados fictícios.`,
    );

    const ticks = document.querySelectorAll('.dash-chart-yaxis span');
    ticks.forEach((tick, i) => {
      tick.textContent = fmt((chartCeiling * (4 - i)) / 4, chartCeiling <= 5 ? 1 : 0);
    });

    period.values.forEach((value, index) => {
      const col = document.createElement('div');
      col.className = 'dash-chart-col';
      const area = document.createElement('div');
      area.className = 'dash-chart-bar-area';
      const bar = document.createElement('div');
      bar.className = 'dash-chart-bar';
      bar.style.height = `${Math.max(0, (value / chartCeiling) * 100)}%`;
      bar.title = `${period.labels[index]}: ${fmt(value, 2)} ${period.unit} (simulado)`;
      const label = document.createElement('span');
      label.className = 'dash-chart-label';
      label.textContent = period.values.length > 20 && index % 3 !== 0 ? '' : period.labels[index];
      col.setAttribute('role', 'img');
      col.setAttribute('aria-label', bar.title);
      area.append(bar);
      col.append(area, label);
      chart.append(col);
    });

    document.querySelectorAll('[data-period]').forEach((button) => {
      const active = button.dataset.period === periodKey;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };
  document
    .querySelectorAll('[data-period]')
    .forEach((button) => button.addEventListener('click', () => renderChart(button.dataset.period)));
  renderChart('mes');
})();

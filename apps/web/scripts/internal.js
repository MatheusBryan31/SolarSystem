/* SolarSystem Premium Blue — interações das páginas internas.
   O app.js existente continua responsável pelos cadastros, alterações e alarmes.
   Este arquivo adiciona filtros e visualizações sem requisitar serviços externos. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const allPlants = typeof plants !== 'undefined' && Array.isArray(plants) ? plants : [];
  const page = document.body.dataset.page;
  const format = (number, digits = 0) =>
    Number(number || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  const statusOfPlant = (plant) => {
    const statuses = (plant.inverters || []).map((inv) => inv.status);
    if (statuses.includes('Offline')) return 'Offline';
    if (statuses.includes('Atenção')) return 'Atenção';
    return 'Online';
  };
  const normalize = (value) => String(value ?? '').toLocaleLowerCase('pt-BR');
  const make = (tag, label, className) => {
    const element = document.createElement(tag);
    if (label !== undefined) element.textContent = String(label);
    if (className) element.className = className;
    return element;
  };

  // Cabeçalho e navegação: compartilhados nas seis páginas internas.
  const icons = [
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V7l7-4v18M10 12l5-4v13M15 11l6-3v13M2 21h20M6 10h1M6 14h1M6 18h1"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 3.5 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.5 3.5a1.7 1.7 0 0 0-3 0ZM12 9v5M12 17h.01"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V12h4v8M10 20V4h4v16M16 20v-9h4v9M2 20h20"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 14 5l3-.5.7 3 3 1.5-1 3 1 3-3 1.5-.7 3-3-.5-2 2-2-2-3 .5-.7-3-3-1.5 1-3-1-3 3-1.5.7-3 3 .5z"/><circle cx="12" cy="12" r="3"/></svg>',
  ];
  // Padroniza a assinatura do perfil herdado nas telas Detalhes e Relatórios.
  const profileCaption = document.querySelector('#sidebar-container .profile small');
  if (profileCaption) profileCaption.textContent = 'SolarSystem';

  document.querySelectorAll('#sidebar-container .nav a').forEach((link, index) => {
    if (!icons[index]) return;
    const icon = make('span', undefined, 'dash-side-icon');
    icon.innerHTML = icons[index]; // Somente SVGs literais e controlados pelo aplicativo.
    link.prepend(icon);
  });

  const openAlarms = allPlants.flatMap((p) => (p.alarms || []).filter((a) => a.status === 'Aberto'));
  const notification = $('dash-notification-count');
  if (notification) {
    notification.hidden = openAlarms.length === 0;
    notification.textContent = openAlarms.length > 99 ? '99+' : String(openAlarms.length);
  }

  const menuButton = $('dash-menu-button');
  const backdrop = $('dash-menu-backdrop');
  if (menuButton && backdrop) {
    const setMenu = (open) => {
      document.body.classList.toggle('menu-open', open);
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      backdrop.hidden = !open;
    };
    menuButton.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
    backdrop.addEventListener('click', () => setMenu(false));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setMenu(false);
    });
    document
      .querySelectorAll('#sidebar-container .nav a')
      .forEach((link) => link.addEventListener('click', () => setMenu(false)));
  }

  const headerSearch = $('dash-search');
  const headerResults = $('dash-search-results');
  if (headerSearch && headerResults) {
    headerSearch.addEventListener('input', () => {
      const term = normalize(headerSearch.value.trim());
      headerResults.replaceChildren();
      headerResults.hidden = !term;
      if (!term) return;
      const matches = allPlants
        .filter((plant) =>
          normalize(
            [plant.name, plant.city, plant.state, ...(plant.inverters || []).map((inv) => inv.serial)].join(
              ' ',
            ),
          ).includes(term),
        )
        .slice(0, 7);
      if (!matches.length) headerResults.append(make('p', 'Nenhuma usina encontrada.', 'dash-search-empty'));
      matches.forEach((plant) => {
        const link = make('a', plant.name);
        link.href = `detalhes.html?id=${encodeURIComponent(plant.id)}`;
        link.append(make('small', `${plant.city}/${plant.state} · ${statusOfPlant(plant)}`));
        headerResults.append(link);
      });
    });
    headerSearch.addEventListener('focus', () => {
      if (headerSearch.value.trim()) headerResults.hidden = false;
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.dash-search-wrap')) headerResults.hidden = true;
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') headerResults.hidden = true;
    });
  }

  const emptyRow = (colSpan, label) => {
    const tr = make('tr');
    const td = make('td', label, 'empty-state');
    td.colSpan = colSpan;
    tr.append(td);
    return tr;
  };
  const td = (row, label) => {
    const cell = make('td', label);
    row.append(cell);
    return cell;
  };
  const badgeFor = (status) =>
    make(
      'span',
      status,
      `badge ${status === 'Online' ? 'online' : status === 'Offline' ? 'offline' : 'attention'}`,
    );

  if (page === 'plants') {
    const search = $('plant-search');
    const status = $('status-filter');
    const type = $('internal-type-filter');
    const state = $('internal-state-filter');
    const table = $('plant-rows');
    const render = () => {
      const term = normalize(search.value.trim());
      const matches = allPlants.filter((plant) => {
        const searchable = [plant.name, ...(plant.inverters || []).map((inv) => inv.serial)].join(' ');
        return (
          normalize(searchable).includes(term) &&
          (!status.value || statusOfPlant(plant) === status.value) &&
          (!type.value || plant.type === type.value) &&
          (!state.value || plant.state === state.value)
        );
      });
      table.replaceChildren();
      if (!matches.length) table.append(emptyRow(6, 'Nenhuma usina corresponde aos filtros.'));
      matches.forEach((plant) => {
        const row = make('tr');
        const name = td(row, plant.name);
        name.className = 'plant-name';
        name.append(
          make(
            'small',
            (plant.inverters || []).map((inv) => inv.serial).join(', ') || 'Sem inversor',
            'muted row-note',
          ),
        );
        td(row, `${plant.city || '—'} / ${plant.state || '—'}`);
        td(row).append(badgeFor(statusOfPlant(plant)));
        td(row, `${format(plant.capacity)} kWp`);
        td(row, String((plant.inverters || []).length));
        const actions = td(row);
        actions.className = 'internal-table-actions';
        const detail = make('a', 'Ver detalhes', 'internal-table-link');
        detail.href = `detalhes.html?id=${encodeURIComponent(plant.id)}`;
        const edit = make('a', 'Editar', 'internal-table-edit');
        edit.href = `cadastro.html?id=${encodeURIComponent(plant.id)}`;
        actions.append(detail, edit);
        table.append(row);
      });
      $('result-count').textContent = `${matches.length} usina(s) encontrada(s)`;
    };
    for (const control of [search, status, type, state]) {
      control.addEventListener(control === search ? 'input' : 'change', render);
    }
    $('internal-clear-filters').addEventListener('click', () => {
      search.value = '';
      status.value = '';
      type.value = '';
      state.value = '';
      render();
    });
    render();
  }

  if (page === 'details') {
    const id = new URLSearchParams(location.search).get('id') || allPlants[0]?.id;
    const plant = allPlants.find((p) => p.id === id);
    if (plant) {
      $('internal-detail-client').textContent = `Cliente: ${plant.client || 'Não informado'}`;
      $('internal-detail-client-value').textContent = plant.client || 'Não informado';
      $('internal-detail-inverters').textContent = String((plant.inverters || []).length);
      $('internal-detail-alerts').textContent = String(
        (plant.alarms || []).filter((alarm) => alarm.status === 'Aberto').length,
      );
    }
    document.querySelectorAll('.detail-panel[hidden]').forEach((section) => {
      section.style.display = 'none';
    });
    document.querySelectorAll('[data-tab-target]').forEach((tab) => {
      tab.addEventListener('click', () => {
        for (const section of document.querySelectorAll('.detail-panel')) {
          section.style.display = section.id === tab.dataset.tabTarget ? '' : 'none';
        }
      });
    });
  }

  if (page === 'alarms') {
    const allAlarms = allPlants.flatMap((p) => (p.alarms || []).map((a) => a));
    const opened = allAlarms.filter((a) => a.status === 'Aberto');
    $('internal-open-alarms').textContent = String(opened.length);
    $('internal-critical-alarms').textContent = String(opened.filter((a) => a.severity === 'Alta').length);
    $('internal-medium-alarms').textContent = String(opened.filter((a) => a.severity === 'Média').length);
    $('internal-resolved-alarms').textContent = String(
      allAlarms.filter((a) => a.status === 'Resolvido').length,
    );
    const search = $('internal-alarm-search');
    const severity = $('internal-severity-filter');
    const status = $('internal-alarm-status-filter');
    const rows = [...$('alarm-rows').rows];
    rows.forEach((row) => {
      for (const column of [3, 4]) {
        const cell = row.cells[column];
        if (!cell) continue;
        const value = cell.textContent.trim();
        const tone =
          column === 4
            ? value === 'Aberto'
              ? 'offline'
              : 'online'
            : value === 'Alta'
              ? 'offline'
              : value === 'Média'
                ? 'attention'
                : 'low';
        cell.replaceChildren(make('span', value, `badge ${tone}`));
      }
      const button = row.querySelector('[data-alarm]');
      if (button) button.classList.add('internal-action-button');
    });
    const filter = () => {
      let shown = 0;
      rows.forEach((row) => {
        const text = normalize(
          [...row.cells]
            .slice(0, 3)
            .map((cell) => cell.textContent)
            .join(' '),
        );
        const matching =
          text.includes(normalize(search.value.trim())) &&
          (!severity.value || row.cells[3]?.textContent.trim() === severity.value) &&
          (!status.value || row.cells[4]?.textContent.trim() === status.value);
        row.hidden = !matching;
        if (matching) shown++;
      });
      $('internal-alarms-count').textContent = `${shown} ocorrência(s) encontrada(s)`;
    };
    search.addEventListener('input', filter);
    for (const select of [severity, status]) select.addEventListener('change', filter);
    $('internal-alarms-clear').addEventListener('click', () => {
      search.value = '';
      severity.value = '';
      status.value = '';
      filter();
    });
    if (!rows.length) $('alarm-rows').append(emptyRow(6, 'Nenhum alarme registrado.'));
    filter();
  }

  if (page === 'reports') {
    let currentPlants = [...allPlants];
    const bars = $('internal-report-chart');
    const title = $('internal-report-chart-title');
    const note = $('internal-report-chart-note');
    const dataType = $('internal-report-data-type');
    const tabs = [...document.querySelectorAll('[data-report-tab]')];
    const reportExamples = [16, 27, 39, 29, 45, 35, 30];
    const drawChart = (kind) => {
      bars.replaceChildren();
      const items =
        kind === 'producao'
          ? reportExamples.map((value, i) => ({ label: `Dia ${i + 1}`, value, units: 'kWh' }))
          : allPlants.slice(0, 8).map((plant) => ({
              label: plant.name,
              value: kind === 'alarmes' ? (plant.alarms || []).length : Number(plant.capacity || 0),
              units: kind === 'alarmes' ? 'ocorrências' : 'kWp',
            }));
      title.textContent =
        kind === 'producao'
          ? 'Produção de energia ilustrativa'
          : kind === 'alarmes'
            ? 'Alarmes por usina'
            : 'Capacidade instalada por usina';
      note.textContent =
        kind === 'producao'
          ? 'Série fictícia de sete dias, apenas para demonstrar a interface.'
          : kind === 'alarmes'
            ? 'Quantidade de alarmes do cadastro local.'
            : 'Potências cadastradas no navegador.';
      dataType.textContent = kind === 'producao' ? 'Simulação' : 'Dados cadastrados';
      bars.setAttribute(
        'aria-label',
        `${title.textContent}. ${kind === 'producao' ? 'Dados simulados.' : 'Dados cadastrados.'}`,
      );
      if (!items.length) {
        bars.append(make('p', 'Cadastre usinas para visualizar o gráfico.', 'internal-empty-chart'));
        return;
      }
      const max = Math.max(1, ...items.map((item) => item.value));
      items.forEach((item) => {
        const line = make('div', undefined, 'internal-chart-row');
        line.append(make('span', item.label, 'internal-chart-name'));
        const track = make('div', undefined, 'internal-chart-track');
        const fill = make('span', undefined, 'internal-chart-fill');
        fill.style.width = `${Math.max(item.value > 0 ? 2 : 0, (item.value / max) * 100)}%`;
        track.append(fill);
        line.append(
          track,
          make(
            'strong',
            `${format(item.value, kind === 'producao' ? 1 : 0)} ${item.units}`,
            'internal-chart-value',
          ),
        );
        bars.append(line);
      });
    };
    tabs.forEach((tab) =>
      tab.addEventListener('click', () => {
        tabs.forEach((item) => {
          item.classList.toggle('active', item === tab);
          item.setAttribute('aria-pressed', String(item === tab));
        });
        drawChart(tab.dataset.reportTab);
      }),
    );
    drawChart('capacidade');
    const filter = () => {
      const text = normalize($('internal-report-search').value.trim());
      const state = $('internal-report-state').value;
      currentPlants = allPlants.filter(
        (p) => normalize(`${p.name} ${p.city} ${p.state}`).includes(text) && (!state || p.state === state),
      );
      // Tabela originalmente renderizada por app.js; apenas ocultamos os resultados não correspondentes.
      const names = new Set(currentPlants.map((p) => p.name));
      for (const row of $('report-rows').rows)
        row.hidden = !names.has(row.cells[0]?.firstChild?.textContent?.trim());
      $('internal-report-count').textContent = `${currentPlants.length} usina(s) encontrada(s)`;
    };
    $('internal-report-search').addEventListener('input', filter);
    $('internal-report-state').addEventListener('change', filter);
    filter();
    const safeCSV = (value) => {
      let str = String(value ?? '');
      // Impede interpretação de fórmulas ao abrir o arquivo em planilhas.
      if (/^[\s]*[=+@\-\t\r]/.test(str)) str = `'${str}`;
      return `"${str.replaceAll('"', '""')}"`;
    };
    $('internal-export-csv').addEventListener('click', () => {
      const header = ['Usina', 'Cidade', 'UF', 'Status', 'Potência (kWp)', 'Inversores'];
      const body = currentPlants.map((p) => [
        p.name,
        p.city,
        p.state,
        statusOfPlant(p),
        Number(p.capacity || 0),
        (p.inverters || []).length,
      ]);
      const csv = '\uFEFF' + [header, ...body].map((line) => line.map(safeCSV).join(';')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = make('a');
      link.href = url;
      link.download = 'solarsystem-usinas.csv';
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
})();

/* Estruturas das telas ficam nos HTML; este arquivo concentra os comportamentos. */
const STORAGE_KEY = 'solaris.plants.v1';
const examples = [
  { id: 'plant-1', name: 'Fazenda Sol Nascente', type: 'Solo', city: 'Uberlândia', state: 'MG', capacity: 320, tilt: 12, nominal: 300, startDate: '2023-03-15', notes: '', client: 'Energia Solar Ltda.', email: 'contato@energiasolar.example', cep: '38400-000', street: 'Estrada Solar', number: '1200', complement: '', inverters: [{ id: 'inv-1', brand: 'Huawei', model: 'SUN2000-100KTL', serial: 'SN-HW-001245', status: 'Online' }, { id: 'inv-2', brand: 'SMA', model: 'Sunny Tripower', serial: 'SN-SMA-004321', status: 'Online' }], alarms: [{ id: 'alarm-1', severity: 'Baixa', title: 'Comunicação intermitente', description: 'Perda momentânea de comunicação com o inversor INV-03.', date: 'Hoje, 13:47', status: 'Aberto' }] },
  { id: 'plant-2', name: 'Sítio Boa Vista', type: 'Solo', city: 'Montes Claros', state: 'MG', capacity: 180, tilt: 10, nominal: 160, startDate: '2024-06-01', notes: '', client: 'João Pereira', email: 'joao@example.com', cep: '39400-000', street: 'Estrada Boa Vista', number: '45', complement: '', inverters: [{ id: 'inv-3', brand: 'Growatt', model: 'MAX 80KTL3', serial: 'SN-GR-000873', status: 'Atenção' }], alarms: [{ id: 'alarm-2', severity: 'Média', title: 'Temperatura elevada', description: 'Temperatura acima do limite configurado.', date: 'Hoje, 11:20', status: 'Aberto' }] },
  { id: 'plant-3', name: 'Usina Horizonte', type: 'Solo', city: 'Juiz de Fora', state: 'MG', capacity: 250, tilt: 15, nominal: 230, startDate: '2022-11-10', notes: '', client: 'Horizonte Geração', email: 'operacao@horizonte.example', cep: '36000-000', street: 'Rodovia MG-353', number: '80', complement: '', inverters: [{ id: 'inv-4', brand: 'Huawei', model: 'SUN2000-100KTL', serial: 'SN-HW-002019', status: 'Offline' }], alarms: [] },
];

function loadPlants() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(stored)) return stored;
  } catch { /* Dados locais inválidos: iniciar com exemplos. */ }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(examples));
  return examples;
}
let plants = loadPlants();
const page = document.body.dataset.page;
const byId = (id) => document.getElementById(id);
const make = (tag, text, className = '') => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  element.className = className;
  return element;
};
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(plants));
const statusOf = (plant) => {
  const statuses = (plant.inverters || []).map((inverter) => inverter.status);
  if (statuses.includes('Offline')) return 'Offline';
  if (statuses.includes('Atenção')) return 'Atenção';
  return 'Online';
};
const formatNumber = (value) => Number(value || 0).toLocaleString('pt-BR');
const locationOf = (plant) => `${plant.city}, ${plant.state}`;
const byPlantId = (id) => plants.find((plant) => plant.id === id);

function showToast(message) {
  const toast = byId('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2600);
}
function addCell(row, text, className = '') {
  const cell = make('td', text, className);
  row.append(cell);
  return cell;
}
function addBadge(cell, status) {
  const tone = status === 'Online' ? 'online' : status === 'Offline' ? 'offline' : 'attention';
  cell.append(make('span', status, `badge ${tone}`));
}
function plantRow(plant, showSerial = false) {
  const row = make('tr');
  const nameCell = addCell(row, plant.name, 'plant-name');
  if (showSerial) nameCell.append(make('small', (plant.inverters || []).map((item) => item.serial).join(', ') || 'Sem inversor', 'muted row-note'));
  addCell(row, locationOf(plant));
  addBadge(addCell(row), statusOf(plant));
  addCell(row, `${formatNumber(plant.capacity)} kWp`);
  addCell(row, String((plant.inverters || []).length));
  const actionCell = addCell(row);
  const link = make('a', 'Detalhes →', 'table-action');
  link.href = `detalhes.html?id=${encodeURIComponent(plant.id)}`;
  actionCell.append(link);
  return row;
}
function fillPlantsTable(table, data, showSerial = false) {
  table.replaceChildren();
  if (!data.length) {
    const row = make('tr');
    const cell = addCell(row, 'Nenhuma usina encontrada.', 'empty-state');
    cell.colSpan = 6;
    table.append(row);
    return;
  }
  data.forEach((plant) => table.append(plantRow(plant, showSerial)));
}

function initOverview() {
  const statusCounts = { Online: 0, 'Atenção': 0, Offline: 0 };
  plants.forEach((plant) => statusCounts[statusOf(plant)]++);
  byId('metric-plants').textContent = plants.length;
  byId('metric-capacity').textContent = `${formatNumber(plants.reduce((total, plant) => total + Number(plant.capacity || 0), 0))} kWp`;
  byId('metric-alarms').textContent = plants.reduce((total, plant) => total + (plant.alarms || []).filter((alarm) => alarm.status === 'Aberto').length, 0);
  byId('count-online').textContent = statusCounts.Online;
  byId('count-attention').textContent = statusCounts['Atenção'];
  byId('count-offline').textContent = statusCounts.Offline;
  fillPlantsTable(byId('recent-plants'), plants.slice(0, 5));
}

function initPlants() {
  const search = byId('plant-search');
  const filter = byId('status-filter');
  const table = byId('plant-rows');
  function update() {
    const query = search.value.trim().toLocaleLowerCase('pt-BR');
    const selectedStatus = filter.value;
    const matches = plants.filter((plant) => {
      const serials = (plant.inverters || []).map((item) => item.serial).join(' ');
      return `${plant.name} ${serials}`.toLocaleLowerCase('pt-BR').includes(query) && (!selectedStatus || statusOf(plant) === selectedStatus);
    });
    fillPlantsTable(table, matches, true);
    byId('result-count').textContent = `${matches.length} usina(s)`;
    byId('total-count').textContent = plants.length;
    byId('online-count').textContent = plants.filter((plant) => statusOf(plant) === 'Online').length;
    byId('attention-count').textContent = plants.filter((plant) => statusOf(plant) === 'Atenção').length;
    byId('offline-count').textContent = plants.filter((plant) => statusOf(plant) === 'Offline').length;
  }
  search.addEventListener('input', update);
  filter.addEventListener('change', update);
  update();
}

function initForm() {
  const form = byId('plant-form');
  const id = new URLSearchParams(window.location.search).get('id');
  const original = id ? byPlantId(id) : null;
  if (id && !original) { showToast('Não encontramos essa usina.'); return; }
  if (original) {
    byId('form-title').textContent = 'Editar usina';
    form.querySelector('[type="submit"]').textContent = 'Salvar alterações';
    for (const [name, value] of Object.entries(original)) {
      const input = form.elements.namedItem(name);
      if (input && typeof value !== 'object') input.value = value;
    }
    const inverter = original.inverters?.[0] || {};
    ['brand', 'model', 'serial'].forEach((name) => { form.elements.namedItem(name).value = inverter[name] || ''; });
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const serial = data.serial.trim().toLocaleLowerCase('pt-BR');
    const duplicate = plants.some((plant) => plant.id !== original?.id && (plant.inverters || []).some((item) => item.serial.toLocaleLowerCase('pt-BR') === serial));
    if (duplicate) { showToast('Já existe um inversor com esse número de série.'); byId('serial').focus(); return; }
    const inverter = { id: original?.inverters?.[0]?.id || crypto.randomUUID(), brand: data.brand, model: data.model, serial: data.serial.trim(), status: original?.inverters?.[0]?.status || 'Online' };
    const plant = { ...original, ...data, capacity: Number(data.capacity), tilt: Number(data.tilt), nominal: Number(data.nominal), inverters: [inverter, ...(original?.inverters?.slice(1) || [])], alarms: original?.alarms || [], id: original?.id || crypto.randomUUID() };
    plants = original ? plants.map((item) => item.id === original.id ? plant : item) : [plant, ...plants];
    save();
    window.location.href = `detalhes.html?id=${encodeURIComponent(plant.id)}`;
  });
}

function initDetails() {
  const id = new URLSearchParams(window.location.search).get('id') || plants[0]?.id;
  const plant = byPlantId(id);
  if (!plant) { showToast('Cadastre uma usina para ver os detalhes.'); return; }
  byId('plant-title').textContent = plant.name;
  byId('plant-heading').textContent = plant.name;
  byId('plant-location').textContent = locationOf(plant);
  byId('plant-status').textContent = statusOf(plant);
  byId('plant-status').className = `badge ${statusOf(plant) === 'Online' ? 'online' : statusOf(plant) === 'Offline' ? 'offline' : 'attention'}`;
  byId('edit-plant').href = `cadastro.html?id=${encodeURIComponent(plant.id)}`;
  byId('capacity-value').textContent = `${formatNumber(plant.capacity)} kWp`;
  byId('capacity-side').textContent = `${formatNumber(plant.capacity)} kWp`;
  byId('type-value').textContent = plant.type || 'Fotovoltaica';
  byId('date-value').textContent = plant.startDate ? new Date(`${plant.startDate}T12:00:00`).toLocaleDateString('pt-BR') : '—';
  byId('location-value').textContent = locationOf(plant);
  byId('device-count').textContent = plant.inverters.length;
  plant.inverters.forEach((inverter) => {
    const row = make('tr'); addCell(row, inverter.brand); addCell(row, inverter.model); addCell(row, inverter.serial); addBadge(addCell(row), inverter.status);
    const action = addCell(row); const button = make('button', 'Remover', 'table-action'); button.type = 'button'; button.dataset.removeInverter = inverter.id; action.append(button); byId('device-rows').append(row);
  });
  plant.alarms.forEach((alarm) => {
    const row = make('tr'); addCell(row, alarm.date); addCell(row, alarm.title); addCell(row, alarm.severity); addCell(row, alarm.status); byId('detail-alarm-rows').append(row);
  });
  document.querySelectorAll('[data-tab-target]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-tab-target]').forEach((tab) => tab.classList.toggle('active', tab === button));
    document.querySelectorAll('.detail-panel').forEach((panel) => { panel.hidden = panel.id !== button.dataset.tabTarget; });
  }));
  byId('add-inverter').addEventListener('click', () => {
    const serial = window.prompt('Número de série do inversor:'); if (!serial) return;
    if (plants.some((item) => item.inverters.some((device) => device.serial.toLowerCase() === serial.trim().toLowerCase()))) { showToast('Esse número de série já está cadastrado.'); return; }
    plant.inverters.push({ id: crypto.randomUUID(), brand: window.prompt('Marca:') || 'Outra', model: window.prompt('Modelo:') || 'Não informado', serial: serial.trim(), status: 'Online' });
    save(); window.location.reload();
  });
  byId('device-rows').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-inverter]'); if (!button || !window.confirm('Remover este inversor?')) return;
    plant.inverters = plant.inverters.filter((device) => device.id !== button.dataset.removeInverter); save(); window.location.reload();
  });
}

function initAlarms() {
  const table = byId('alarm-rows');
  plants.forEach((plant) => (plant.alarms || []).forEach((alarm) => {
    const row = make('tr'); addCell(row, alarm.date); addCell(row, plant.name); addCell(row, alarm.title); addCell(row, alarm.severity); addCell(row, alarm.status);
    const actionCell = addCell(row); const button = make('button', alarm.status === 'Resolvido' ? 'Reabrir' : 'Concluir', 'table-action'); button.type = 'button'; button.dataset.alarm = `${plant.id}:${alarm.id}`; actionCell.append(button); table.append(row);
  }));
  table.addEventListener('click', (event) => {
    const button = event.target.closest('[data-alarm]'); if (!button) return;
    const [plantId, alarmId] = button.dataset.alarm.split(':'); const alarm = byPlantId(plantId)?.alarms.find((item) => item.id === alarmId);
    if (!alarm) return; alarm.status = alarm.status === 'Resolvido' ? 'Aberto' : 'Resolvido'; save(); window.location.reload();
  });
}

function initReports() {
  byId('report-plants').textContent = plants.length;
  byId('report-capacity').textContent = `${formatNumber(plants.reduce((total, plant) => total + Number(plant.capacity || 0), 0))} kWp`;
  byId('report-alarms').textContent = plants.reduce((total, plant) => total + (plant.alarms || []).length, 0);
  fillPlantsTable(byId('report-rows'), plants);
}
function initLogin() {
  byId('login-form').addEventListener('submit', (event) => { event.preventDefault(); window.location.href = 'index.html'; });
  document.querySelectorAll('[data-demo-message]').forEach((button) => button.addEventListener('click', () => showToast(button.dataset.demoMessage)));
}
function initSettings() {
  byId('reset-demo').addEventListener('click', () => {
    if (!window.confirm('Restaurar os dados demonstrativos?')) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(examples)); window.location.reload();
  });
}

const pages = { overview: initOverview, plants: initPlants, form: initForm, details: initDetails, alarms: initAlarms, reports: initReports, login: initLogin, settings: initSettings };
pages[page]?.();

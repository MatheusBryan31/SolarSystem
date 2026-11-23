const plants = plantStore.plants;
const page = document.body.dataset.page;
const byId = (id) => document.getElementById(id);
const make = (tag, text, className = '') => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  element.className = className;
  return element;
};
const statusOf = (plant) => {
  const statuses = (plant.inverters || []).map((inverter) => inverter.status);
  if (statuses.includes('Offline')) return 'Offline';
  if (statuses.includes('Atenção')) return 'Atenção';
  return statuses.length && statuses.every((status) => status === 'Online') ? 'Online' : 'Sem dados';
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
function badgeClass(status) {
  const tones = { Online: 'online', Offline: 'offline', Atenção: 'attention' };
  return 'badge ' + (tones[status] || 'unknown');
}
function addBadge(cell, status) {
  cell.append(make('span', status || 'Sem dados', badgeClass(status)));
}
function plantRow(plant, showSerial = false) {
  const row = make('tr');
  const nameCell = addCell(row, plant.name, 'plant-name');
  if (showSerial)
    nameCell.append(
      make(
        'small',
        (plant.inverters || []).map((item) => item.serial).join(', ') || 'Sem inversor',
        'muted row-note',
      ),
    );
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
  const statusCounts = { Online: 0, Atenção: 0, Offline: 0 };
  plants.forEach((plant) => statusCounts[statusOf(plant)]++);
  byId('metric-plants').textContent = plants.length;
  byId('metric-capacity').textContent =
    `${formatNumber(plants.reduce((total, plant) => total + Number(plant.capacity || 0), 0))} kWp`;
  byId('metric-alarms').textContent = plants.reduce(
    (total, plant) => total + (plant.alarms || []).filter((alarm) => alarm.status === 'Aberto').length,
    0,
  );
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
      return (
        `${plant.name} ${serials}`.toLocaleLowerCase('pt-BR').includes(query) &&
        (!selectedStatus || statusOf(plant) === selectedStatus)
      );
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

function duplicateSerial(serial, except) {
  const key = serial.trim().toLowerCase();
  return plants.some((plant) =>
    plant.inverters.some((item) => item !== except && item.serial.trim().toLowerCase() === key),
  );
}

function trimFields(form) {
  for (const field of form.querySelectorAll('input:not([type]), input[type="text"], textarea')) {
    field.value = field.value.trim();
  }
  return form.reportValidity();
}

function setFormValue(field, value) {
  if (
    field instanceof HTMLSelectElement &&
    value &&
    ![...field.options].some((option) => option.value === value)
  ) {
    field.add(new Option(value, value));
  }
  field.value = value;
}

function initForm() {
  const form = byId('plant-form');
  const id = new URLSearchParams(window.location.search).get('id');
  const original = id ? byPlantId(id) : null;
  if (!plantStore.readable) {
    form.querySelector('[type="submit"]').disabled = true;
    return;
  }
  if (id && !original) {
    byId('form-title').textContent = 'Usina não encontrada';
    form.hidden = true;
    return;
  }
  if (original) {
    byId('form-title').textContent = 'Editar usina';
    form.querySelector('[type="submit"]').textContent = 'Salvar alterações';
    for (const [name, value] of Object.entries(original)) {
      const input = form.elements.namedItem(name);
      if (!input || typeof value === 'object') continue;
      setFormValue(input, value);
    }
    const inverter = original.inverters?.[0] || {};
    if (!original.inverters.length)
      byId('inverter-note').textContent =
        'Esta usina está sem inversores. Deixe os três campos em branco ou preencha todos para adicionar um.';
    ['brand', 'model', 'serial'].forEach((name) => {
      const field = form.elements.namedItem(name);
      if (!original.inverters.length) {
        field.required = false;
        field.labels[0].querySelector('.required').hidden = true;
      }
      setFormValue(field, inverter[name] || '');
    });
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!trimFields(form)) return;
    const data = Object.fromEntries(new FormData(form).entries());
    const previous = original?.inverters[0];
    const hasDevice = Boolean(data.brand || data.model || data.serial);
    if (hasDevice && !(data.brand && data.model && data.serial)) {
      showToast('Preencha marca, modelo e número de série do inversor.');
      form.elements.namedItem(['brand', 'model', 'serial'].find((key) => !data[key])).focus();
      return;
    }
    if (hasDevice && duplicateSerial(data.serial, previous)) {
      showToast('Já existe um inversor com esse número de série.');
      byId('serial').focus();
      return;
    }
    const inverter = {
      ...previous,
      id: previous?.id || crypto.randomUUID(),
      brand: data.brand,
      model: data.model,
      serial: data.serial.trim(),
      status: previous?.status || 'Sem dados',
    };
    const plant = {
      ...original,
      ...data,
      capacity: Number(data.capacity),
      tilt: Number(data.tilt),
      nominal: Number(data.nominal),
      inverters: hasDevice ? [inverter, ...(original?.inverters.slice(1) || [])] : [],
      alarms: original?.alarms || [],
      id: original?.id || crypto.randomUUID(),
    };
    const next = original
      ? plants.map((item) => (item.id === original.id ? plant : item))
      : [plant, ...plants];
    if (!(await plantStore.save(next))) return;
    window.location.href = `detalhes.html?id=${encodeURIComponent(plant.id)}`;
  });
}

function initDetails() {
  const id = new URLSearchParams(window.location.search).get('id') || plants[0]?.id;
  const plant = byPlantId(id);
  if (!plant) {
    byId('plant-title').textContent = 'Usina não encontrada';
    document.querySelector('.internal-heading h1').textContent = 'Usina não encontrada';
    document.querySelector('.internal-heading p').textContent =
      'Consulte a lista para escolher uma usina cadastrada.';
    for (const section of document.querySelectorAll('.internal-plant-head, .internal-tabs, .detail-panel'))
      section.hidden = true;
    return;
  }
  byId('plant-title').textContent = plant.name;
  byId('plant-heading').textContent = plant.name;
  byId('plant-location').textContent = locationOf(plant);
  byId('plant-status').textContent = statusOf(plant);
  byId('plant-status').className = badgeClass(statusOf(plant));
  byId('edit-plant').href = `cadastro.html?id=${encodeURIComponent(plant.id)}`;
  byId('capacity-value').textContent = `${formatNumber(plant.capacity)} kWp`;
  byId('capacity-side').textContent = `${formatNumber(plant.capacity)} kWp`;
  byId('type-value').textContent = plant.type || 'Fotovoltaica';
  byId('date-value').textContent = plant.startDate
    ? new Date(`${plant.startDate}T12:00:00`).toLocaleDateString('pt-BR')
    : '—';
  byId('location-value').textContent = locationOf(plant);
  byId('device-count').textContent = plant.inverters.length;
  plant.inverters.forEach((inverter) => {
    const row = make('tr');
    addCell(row, inverter.brand);
    addCell(row, inverter.model);
    addCell(row, inverter.serial);
    addBadge(addCell(row), inverter.status);
    const action = addCell(row);
    const button = make('button', 'Remover', 'table-action');
    button.type = 'button';
    button.dataset.removeInverter = inverter.id;
    const edit = make('button', 'Editar', 'table-action');
    edit.type = 'button';
    edit.dataset.editInverter = inverter.id;
    action.append(edit, button);
    byId('device-rows').append(row);
  });
  plant.alarms.forEach((alarm) => {
    const row = make('tr');
    addCell(row, alarm.date);
    addCell(row, alarm.title);
    addCell(row, alarm.severity);
    addCell(row, alarm.status);
    byId('detail-alarm-rows').append(row);
  });
  for (const [id, columns, label] of [
    ['device-rows', 5, 'Nenhum inversor cadastrado.'],
    ['detail-alarm-rows', 4, 'Nenhum alarme registrado.'],
  ]) {
    if (!byId(id).rows.length) addCell(byId(id).insertRow(), label, 'empty-state').colSpan = columns;
  }

  const dialog = byId('inverter-dialog');
  const form = byId('inverter-form');
  let editing;
  function openDevice(device) {
    editing = device;
    byId('inverter-error').hidden = true;
    byId('inverter-title').textContent = device ? 'Editar inversor' : 'Adicionar inversor';
    for (const field of ['brand', 'model', 'serial']) form.elements[field].value = device?.[field] || '';
    form.elements.serial.setCustomValidity('');
    dialog.showModal();
  }
  async function saveDevices(inverters) {
    const updated = { ...plant, inverters };
    // Versões anteriores também gravavam os dados do primeiro inversor na usina.
    for (const field of ['brand', 'model', 'serial']) {
      if (Object.hasOwn(plant, field)) updated[field] = inverters[0]?.[field] || '';
    }
    const next = plants.map((item) => (item.id === plant.id ? updated : item));
    if (await plantStore.save(next)) {
      location.hash = 'dispositivos';
      location.reload();
    } else if (dialog.open) {
      const error = byId('inverter-error');
      error.hidden = false;
      error.textContent = byId('storage-warning').textContent;
    }
  }
  byId('add-inverter').addEventListener('click', () => openDevice());
  byId('cancel-inverter').addEventListener('click', () => dialog.close());
  form.elements.serial.addEventListener('input', () => form.elements.serial.setCustomValidity(''));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!trimFields(form)) return;
    const values = Object.fromEntries(new FormData(form));
    if (duplicateSerial(values.serial, editing)) {
      form.elements.serial.setCustomValidity('Esse número de série já está cadastrado.');
      form.elements.serial.reportValidity();
      return;
    }
    const device = { id: crypto.randomUUID(), status: 'Sem dados', ...editing, ...values };
    await saveDevices(
      editing
        ? plant.inverters.map((item) => (item === editing ? device : item))
        : [...plant.inverters, device],
    );
  });
  byId('device-rows').addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const device = plant.inverters.find(
      (item) => item.id === (button.dataset.editInverter || button.dataset.removeInverter),
    );
    if (!device) return;
    if (button.dataset.editInverter) openDevice(device);
    else if (window.confirm(`Remover o inversor ${device.serial} desta usina?`)) {
      await saveDevices(plant.inverters.filter((item) => item !== device));
    }
  });
}

function initAlarms() {
  const table = byId('alarm-rows');
  plants.forEach((plant) =>
    (plant.alarms || []).forEach((alarm) => {
      const row = make('tr');
      addCell(row, alarm.date);
      addCell(row, plant.name);
      addCell(row, alarm.title);
      addCell(row, alarm.severity);
      addCell(row, alarm.status);
      const actionCell = addCell(row);
      const button = make('button', alarm.status === 'Resolvido' ? 'Reabrir' : 'Concluir', 'table-action');
      button.type = 'button';
      button.dataset.plant = plant.id;
      button.dataset.alarm = alarm.id;
      actionCell.append(button);
      table.append(row);
    }),
  );
  table.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-alarm]');
    if (!button) return;
    const plant = byPlantId(button.dataset.plant);
    if (!plant) return;
    const alarms = plant.alarms.map((alarm) =>
      alarm.id === button.dataset.alarm
        ? { ...alarm, status: alarm.status === 'Resolvido' ? 'Aberto' : 'Resolvido' }
        : alarm,
    );
    const next = plants.map((item) => (item === plant ? { ...plant, alarms } : item));
    if (await plantStore.save(next)) window.location.reload();
  });
}

function initReports() {
  byId('report-plants').textContent = plants.length;
  byId('report-capacity').textContent =
    `${formatNumber(plants.reduce((total, plant) => total + Number(plant.capacity || 0), 0))} kWp`;
  byId('report-alarms').textContent = plants.reduce((total, plant) => total + (plant.alarms || []).length, 0);
  fillPlantsTable(byId('report-rows'), plants);
}
function initSettings() {
  const categories = [...document.querySelectorAll('.settings-menu-item')];
  function markCategory() {
    const selected = categories.find((link) => link.hash === location.hash) || categories[0];
    for (const link of categories) {
      link.classList.toggle('active', link === selected);
      if (link === selected) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }
  window.addEventListener('hashchange', markCategory);
  markCategory();
  byId('reset-demo').addEventListener('click', async () => {
    if (!plantStore.readable) return;
    const missing = plantStore.missingExamples();
    if (!missing.length) return showToast('Os exemplos já existem ou usam séries já cadastradas.');
    if (!window.confirm(`Adicionar ${missing.length} usina(s) de exemplo aos cadastros atuais?`)) return;
    if (await plantStore.save([...plants, ...missing])) window.location.reload();
  });
}

const pages = {
  overview: initOverview,
  plants: initPlants,
  form: initForm,
  details: initDetails,
  alarms: initAlarms,
  reports: initReports,
  settings: initSettings,
};
pages[page]?.();

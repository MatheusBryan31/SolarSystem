const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const storageKey = 'solaris.plants.v1';
const pages = ['login', 'index', 'usinas', 'cadastro', 'detalhes', 'alarmes', 'relatorios', 'configuracoes'];
const mime = {
  html: 'text/html',
  js: 'text/javascript',
  css: 'text/css',
  jpeg: 'image/jpeg',
  png: 'image/png',
};
let server, browser, origin;

before(async () => {
  server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/favicon.ico') return res.writeHead(204).end();
    if (!/^\/(paginas|scripts|estilos|imgs)\/[\w.-]+$/.test(pathname)) return res.writeHead(404).end();
    try {
      const data = await readFile(path.join(root, pathname));
      res.writeHead(200, { 'Content-Type': mime[path.extname(pathname).slice(1)] + '; charset=utf-8' });
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
});

async function session(t) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(4000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('response', (res) => {
    if (res.status() >= 400) errors.push(res.url());
  });
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, []);
  });
  const go = (name) => page.goto(origin + '/paginas/' + name);
  const stored = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  const seed = async (list) => {
    await page.evaluate(
      ([key, value]) => localStorage.setItem(key, JSON.stringify(value)),
      [storageKey, list],
    );
    await page.reload();
  };
  return { context, page, go, stored, seed };
}

test('Login demonstrativo, preferência de e-mail, recuperação e diálogo de cadastro', async (t) => {
  const { page, go } = await session(t);
  await go('login.html');
  await page.click('#open-registration');
  await page.fill('#registration-name', 'Usuário Teste');
  await page.fill('#registration-email', 'teste@example.com');
  await page.fill('#registration-password', 'senha-ficticia');
  await page.click('#registration-toggle-password');
  assert.equal(await page.getAttribute('#registration-password', 'type'), 'text');
  await page.click('#registration-form [type=submit]');
  assert.match(await page.textContent('#registration-message'), /Nenhuma conta foi criada/);
  await page.keyboard.press('Escape');
  assert.equal(
    await page.locator('#open-registration').evaluate((el) => el === document.activeElement),
    true,
  );
  await page.click('[data-demo-message]');
  assert.match(await page.textContent('#toast'), /recuperação/);
  await page.fill('#login-email', 'invalido');
  await page.click('#login-form [type=submit]');
  assert.equal(await page.locator('#login-form').evaluate((form) => form.checkValidity()), false);
  await page.fill('#login-email', 'teste@example.com');
  await page.fill('#login-password', '   ');
  await page.click('#login-form [type=submit]');
  assert.equal(
    await page.locator('#login-password').evaluate((input) => input.validity.patternMismatch),
    true,
  );
  await page.fill('#login-password', 'senha-ficticia');
  await page.click('#toggle-password');
  assert.equal(await page.getAttribute('#login-password', 'type'), 'text');
  await page.check('#remember-email');
  await page.click('#login-form [type=submit]');
  await page.waitForURL('**/index.html');
  assert.deepEqual(await page.evaluate(() => ({ ...localStorage })), {
    'solarsystem.rememberedEmail': 'teste@example.com',
  });
  await page.click('.dash-sign-out');
  assert.equal(await page.inputValue('#login-email'), 'teste@example.com');
  await page.uncheck('#remember-email');
  await page.fill('#login-password', 'outra-senha');
  await page.click('#login-form [type=submit]');
  await page.waitForURL('**/index.html');
  assert.deepEqual(await page.evaluate(() => ({ ...localStorage })), {});
});

test('Cadastrar e editar usina, validar séries, editar e remover equipamentos', async (t) => {
  const { page, go, stored } = await session(t);
  await go('cadastro.html');
  const fields = {
    name: 'Nova usina',
    capacity: '0.75',
    nominal: '0.5',
    tilt: '0',
    startDate: '2026-01-01',
    cep: '12345-000',
    street: 'Rua Solar',
    number: '1',
    city: 'São Paulo',
    client: 'Cliente',
    email: 'cliente@example.com',
    model: 'Modelo A',
    serial: 'EX-01',
  };
  for (const [key, value] of Object.entries(fields)) await page.fill('#' + key, value);
  for (const [key, value] of Object.entries({ state: 'SP', type: 'Solo', brand: 'Huawei' }))
    await page.selectOption('#' + key, value);
  await page.fill('#capacity', '-1');
  await page.click('#plant-form [type=submit]');
  assert.equal(await stored(), null);
  await page.fill('#capacity', '0.75');
  await page.fill('#serial', '   ');
  await page.click('#plant-form [type=submit]');
  assert.equal(await stored(), null);
  await page.fill('#serial', 'EX-01');
  await page.click('#plant-form [type=submit]');
  await page.waitForURL('**/detalhes.html?id=*');
  assert.equal(await page.textContent('#plant-status'), 'Sem dados');
  const id = (await stored())[0].id;
  await page.locator('#tab-painel').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getAttribute('#tab-dispositivos', 'aria-selected'), 'true');
  await page.click('#add-inverter');
  const form = page.locator('#inverter-form');
  await form.locator('[name=brand]').fill('Outra');
  await form.locator('[name=model]').fill('Modelo B');
  await form.locator('[name=serial]').fill(' ex-01 ');
  await form.locator('[type=submit]').click();
  assert.equal(await form.evaluate((el) => el.checkValidity()), false);
  await form.locator('[name=serial]').fill('EX-02');
  await form.locator('[type=submit]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-edit-inverter]').length === 2);
  await page.locator('[data-edit-inverter]').last().click();
  await form.locator('[name=model]').fill('Revisado');
  await form.locator('[type=submit]').click();
  await page.waitForFunction(() => document.querySelector('#device-rows').textContent.includes('Revisado'));
  await page.click('#edit-plant');
  await page.fill('#serial', 'ex-02');
  await page.click('#plant-form [type=submit]');
  assert.match(await page.textContent('#toast'), /número de série/);
  await page.fill('#serial', 'EX-01');
  await page.fill('#name', 'Usina revisada');
  await page.click('#plant-form [type=submit]');
  await page.waitForURL('**/detalhes.html?id=*');
  assert.equal((await stored())[0].inverters[1].model, 'Revisado');
  await page.click('#tab-dispositivos');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('[data-remove-inverter]').last().click();
  assert.equal((await stored())[0].inverters.length, 2);
  for (const count of [1, 0]) {
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('[data-remove-inverter]').last().click();
    await page.waitForFunction(
      (n) => document.querySelectorAll('[data-remove-inverter]').length === n,
      count,
    );
  }
  assert.equal(await page.textContent('#plant-status'), 'Sem dados');
  await go('cadastro.html?id=' + id);
  await page.fill('#name', 'Sem inversores');
  await page.click('#plant-form [type=submit]');
  await page.waitForURL('**/detalhes.html?id=*');
  assert.deepEqual((await stored())[0].inverters, []);
  await go('index.html');
  assert.equal(await page.textContent('#count-unknown'), '1');
  assert.equal(await page.textContent('#dash-map-unknown'), '1');
  assert.equal(await page.textContent('#metric-capacity'), '750,75 kWp');
  await go('usinas.html');
  await page.selectOption('#status-filter', 'Sem dados');
  assert.equal(await page.locator('#plant-rows tr').count(), 1);
  assert.match(await page.textContent('#plant-rows'), /Sem inversores/);
});

test('Relatórios com homônimos, exportação protegida, alarmes e indicadores', async (t) => {
  const { page, go, seed } = await session(t);
  await go('index.html');
  assert.equal(await page.textContent('#metric-alarms'), '2');
  await page.click('[data-period=dia]');
  assert.equal(await page.locator('.dash-chart-bar').count(), 12);
  await go('alarmes.html');
  await page.selectOption('#internal-severity-filter', 'Alta');
  assert.match(await page.locator('#alarm-rows tr:visible').innerText(), /Nenhum alarme/);
  await page.click('#internal-alarms-clear');
  await page.locator('[data-alarm]').first().click();
  await page.waitForFunction(() => document.querySelector('#internal-open-alarms').textContent === '1');
  await page.locator('[data-alarm]').first().click();
  await page.waitForFunction(() => document.querySelector('#internal-open-alarms').textContent === '2');
  const name = '=Teste;"A"';
  await seed([
    { id: '1', name, city: 'Rio', state: 'RJ', capacity: 2 },
    { id: '2', name, city: 'Santos', state: 'SP', capacity: 3 },
  ]);
  await go('relatorios.html');
  await page.selectOption('#internal-report-state', 'SP');
  assert.equal(await page.locator('#report-rows tr').count(), 1);
  assert.match(await page.getAttribute('#report-rows a', 'href'), /id=2$/);
  assert.match(await page.textContent('#internal-report-chart'), /3 kWp/);
  const downloading = page.waitForEvent('download');
  await page.click('#internal-export-csv');
  const content = await readFile(await (await downloading).path(), 'utf8');
  assert.ok(content.startsWith('\uFEFF'));
  assert.ok(content.includes('"\'=Teste;""A"""'));
  assert.match(content, /Santos/);
  assert.doesNotMatch(content, /Rio/);
  await page.click('[data-report-tab=producao]');
  assert.equal(await page.textContent('#internal-report-data-type'), 'Simulação');
  await page.fill('#internal-report-search', 'ausente');
  assert.match(await page.textContent('#report-rows'), /Nenhuma/);
});

test('Dados inválidos, falha de gravação, conflito entre abas e restauração aditiva', async (t) => {
  const { page, context, go, seed, stored } = await session(t);
  await go('configuracoes.html');
  await page.evaluate((key) => localStorage.setItem(key, '{'), storageKey);
  await page.reload();
  assert.match(await page.textContent('#storage-warning'), /preservar/);
  await page.click('#reset-demo');
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKey), '{');
  const custom = { id: 'especial', name: 'Usina preservada', notes: 'teste', inverters: [], alarms: [] };
  await seed([custom]);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.click('#reset-demo');
  assert.deepEqual(await stored(), [custom]);
  const other = await context.newPage();
  await other.goto(page.url());
  await other.evaluate((key) => localStorage.setItem(key, '[]'), storageKey);
  page.once('dialog', (dialog) => dialog.accept());
  await page.click('#reset-demo');
  await page.waitForSelector('#storage-warning');
  assert.match(await page.textContent('#storage-warning'), /outra aba/);
  assert.deepEqual(await stored(), []);
  await seed([custom]);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Quota', 'QuotaExceededError');
    };
  });
  page.once('dialog', (dialog) => dialog.accept());
  await page.click('#reset-demo');
  await page.waitForSelector('#storage-warning');
  assert.deepEqual(await stored(), [custom]);
  await page.reload();
  page.once('dialog', (dialog) => dialog.accept());
  await page.click('#reset-demo');
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).length === 4, storageKey);
  assert.deepEqual((await stored())[0], custom);
  await page.click('#reset-demo');
  assert.equal((await stored()).length, 4);
});

test('Leitura bloqueada, lista vazia e links para cadastros inexistentes', async (t) => {
  const { page, go, seed, stored } = await session(t);
  await go('index.html');
  await seed([]);
  assert.equal(await page.textContent('#metric-plants'), '0');
  assert.match(await page.textContent('#recent-plants'), /Nenhuma/);
  await go('detalhes.html?id=ausente');
  assert.equal(await page.isVisible('#edit-plant'), false);
  await go('cadastro.html?id=ausente');
  assert.equal(await page.isVisible('#plant-form'), false);
  assert.deepEqual(await stored(), []);
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('Bloqueado', 'SecurityError');
    };
  });
  await go('cadastro.html');
  assert.match(await page.textContent('#storage-warning'), /ler os cadastros/);
  assert.equal(await page.isDisabled('#plant-form [type=submit]'), true);
  await go('login.html');
  await page.fill('#login-email', 'local@example.com');
  await page.fill('#login-password', 'ficticia');
  await page.click('#login-form [type=submit]');
  await page.waitForURL('**/index.html');
  assert.match(await page.textContent('#storage-warning'), /ler os cadastros/);
});

test('Oito telas em sete larguras e reflow equivalente a 200% em 1366 × 768', async (t) => {
  const { page, go } = await session(t);
  for (const [width, height] of [
    [320, 640],
    [375, 667],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1366, 768],
    [1920, 1080],
    [683, 384],
  ]) {
    await page.setViewportSize({ width, height });
    for (const name of pages) {
      await go(name + '.html');
      const issues = await page.evaluate(() => {
        const issues = [];
        if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('rolagem horizontal');
        const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
        if (new Set(ids).size !== ids.length) issues.push('IDs repetidos');
        for (const el of document.querySelectorAll('input, select, textarea')) {
          if (!el.labels.length && !el.getAttribute('aria-label')) issues.push('campo sem nome ' + el.id);
        }
        const controls = [
          ...document.querySelectorAll(
            '.dash-topbar a, .dash-topbar input, .dash-topbar button, .login-submit',
          ),
        ];
        for (const el of controls) {
          const rect = el.getBoundingClientRect();
          if (rect.width && (rect.left < -1 || rect.right > innerWidth + 1))
            issues.push('fora da tela ' + el.id);
        }
        return issues;
      });
      assert.deepEqual(issues, [], name + ' ' + width + ': ' + issues.join(', '));
      if (name !== 'login') assert.equal(await page.isVisible('#dash-search'), true);
    }
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await go('index.html');
  await page.fill('#dash-search', 'SN-GR');
  await page.locator('#dash-search-results a').first().click();
  await page.waitForURL('**/detalhes.html?id=plant-2');
  await page.click('#dash-menu-button');
  assert.equal(await page.locator('.nav a.active').evaluate((el) => el === document.activeElement), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#dash-menu-button').evaluate((el) => el === document.activeElement), true);
  assert.equal(await page.getAttribute('#dash-menu-button', 'aria-expanded'), 'false');
  await page.click('#dash-menu-button');
  await page.locator('.nav a[href="usinas.html"]').click();
  await page.waitForURL('**/usinas.html');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.click('#open-user-profile');
  assert.equal(await page.isVisible('#user-profile-dialog'), true);
  await page.keyboard.press('Escape');
  assert.equal(
    await page.locator('#open-user-profile').evaluate((el) => el === document.activeElement),
    true,
  );
});

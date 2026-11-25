const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('../../web/tests/node_modules/playwright');

test('painel operacional: cadastros, inversores, alarmes, relatórios, permissões e reflow', async (t) => {
  const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
  const server = await createServer({
    root: path.resolve(__dirname, '..'),
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  t.after(() => server.close());
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  let role = 'ADMIN',
    failClients = true,
    inversores = [],
    ack = false;
  const writes = [],
    calls = [];
  const client = {
    id: 'c1',
    name: 'Cliente Teste',
    email: 'cliente@example.test',
    phone: null,
    document: null,
  };
  const plant = {
    id: 'p1',
    name: 'Usina Teste',
    city: 'Almenara',
    state: 'MG',
    status: 'UNKNOWN',
    capacityKwp: 10,
    currentPowerKw: null,
    todayEnergyKwh: null,
    totalEnergyKwh: null,
    lastDataAt: null,
    clientId: client.id,
    client,
    origin: 'MANUAL',
    revision: 1,
    integrationId: 'i1',
    externalId: 'e1',
    activeLink: { id: 'link1' },
    integration: { provider: 'DEMO', name: 'Conta Teste' },
    monitoring: 'WAITING',
    metadataSources: { name: 'MANUAL', city: 'MANUAL', state: 'MANUAL', capacityKwp: 'MANUAL' },
  };
  const integration = {
    id: 'i1',
    name: 'Conta Teste',
    provider: 'DEMO',
    revision: 0,
    enabled: true,
    archivedAt: null,
  };
  const envelope = (itens, total = itens.length) => ({ itens, total, pagina: 1, porPagina: 20 });
  await page.route('**/api/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      p = url.pathname,
      method = req.method();
    calls.push({ p, method, query: url.search });
    let data,
      status = 200;
    if (method !== 'GET') {
      assert.equal(req.headers()['x-csrf-protection'], '1');
      writes.push({ p, method, body: req.postData() ? req.postDataJSON() : undefined });
    }
    if (p === '/api/auth/me')
      data = {
        id: 'admin',
        nome: 'Pessoa Teste',
        email: 'admin@example.test',
        role,
        clientId: role === 'CLIENT' ? 'c1' : null,
      };
    else if (p === '/api/clients' && method === 'GET') {
      if (failClients) {
        status = 503;
        data = { message: 'Indisponível no teste' };
      } else
        data = envelope(
          url.searchParams.get('pagina') === '2'
            ? [{ ...client, id: 'c2', name: 'Segunda Página' }]
            : [client],
          21,
        );
    } else if (p === '/api/clients/c1') data = client;
    else if (p === '/api/clients') {
      data = { ...req.postDataJSON(), id: 'c2' };
      status = 201;
    } else if (p === '/api/users' && method === 'GET')
      data = envelope([
        { id: 'u1', name: 'Operador Teste', email: 'op@example.test', role: 'OPERATOR', active: true },
      ]);
    else if (p === '/api/users/u1')
      data = {
        id: 'u1',
        name: 'Operador Teste',
        email: 'op@example.test',
        role: 'OPERATOR',
        active: true,
        clientId: null,
      };
    else if (p === '/api/users') {
      data = { id: 'u2', ...req.postDataJSON() };
      status = 201;
    } else if (p === '/api/plants' && method === 'GET') data = envelope([plant]);
    else if (p === '/api/plants' && method === 'POST') {
      Object.assign(plant, req.postDataJSON());
      data = plant;
      status = 201;
    } else if (p === '/api/plants/p1') {
      if (method === 'PATCH') Object.assign(plant, req.postDataJSON());
      data = plant;
    } else if (p === '/api/plants/p1/inverters' && method === 'POST') {
      const inv = {
        ...req.postDataJSON(),
        id: 'inv1',
        revision: 0,
        origin: 'MANUAL',
        lastCommunicationAt: null,
      };
      inversores.push(inv);
      data = inv;
      status = 201;
    } else if (p === '/api/plants/p1/inverters') data = envelope(inversores);
    else if (p === '/api/plants/p1/inverters/inv1' && method === 'DELETE') {
      inversores = [];
      data = { id: 'inv1', archived: true };
    } else if (p === '/api/alerts/a1/ack') {
      ack = true;
      data = {};
    } else if (p === '/api/alerts')
      data = envelope([
        {
          id: 'a1',
          type: 'PLANT_OFFLINE',
          severity: 'WARNING',
          status: ack ? 'ACKNOWLEDGED' : 'OPEN',
          message: 'Falha de comunicação',
          openedAt: '2026-01-01T12:00:00Z',
          plant: { id: plant.id, name: plant.name },
        },
      ]);
    else if (p === '/api/providers')
      data = [
        {
          tipo: 'DEMO',
          nome: 'Plataforma DEMO',
          descricao: 'Simulação',
          campos: [{ chave: 'quantidade', rotulo: 'Quantidade', tipo: 'number', obrigatorio: false }],
        },
      ];
    else if (p === '/api/integrations' && method === 'GET') data = [integration];
    else if (p === '/api/integrations' && method === 'POST') {
      data = { id: 'i2', ...req.postDataJSON() };
      status = 201;
    } else if (p === '/api/plants/p1/measurements/aggregations')
      data = {
        buckets: [
          {
            bucket: '2026-01',
            peakPowerKw: 3,
            observedPeriodEnergyKwh: null,
            samples: 2,
            excludedPeriods: 0,
            simulated: true,
          },
        ],
      };
    else if (p === '/api/plants/p1/measurements')
      data = envelope(
        url.searchParams.get('includeSimulated') === 'true'
          ? [
              {
                id: 'm1',
                measuredAt: '2026-01-01T12:00:00Z',
                powerKw: 3,
                totalEnergyKwh: 50,
                periodEnergyKwh: null,
                quality: 'VALID',
                isSimulated: true,
              },
            ]
          : [],
      );
    else {
      data = { message: `Endpoint inesperado: ${method} ${p}` };
      status = 404;
    }
    await route.fulfill({ status, json: data });
  });
  const origin = server.resolvedUrls.local[0];
  await page.goto(origin + 'clientes');
  await page.getByRole('alert').filter({ hasText: 'Indisponível' }).waitFor();
  failClients = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await page.getByText('Cliente Teste', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Próxima' }).click();
  await page.getByText('Segunda Página', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Novo cliente' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Cliente Novo');
  await page.getByLabel('E-mail', { exact: true }).fill('novo@example.test');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByText('Cadastro salvo.', { exact: true }).waitFor();
  assert.equal(writes.find((w) => w.p === '/api/clients').body.name, 'Cliente Novo');
  await page.goto(origin + 'usuarios');
  await page.getByRole('button', { name: 'Novo usuário' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Cliente Usuário');
  await page.getByLabel('E-mail', { exact: true }).fill('user@example.test');
  await page.getByLabel('Perfil do usuário', { exact: true }).selectOption('CLIENT');
  await page.getByLabel('Cliente responsável').selectOption('c1');
  await page.getByLabel('Senha', { exact: true }).fill('SenhaSomenteTeste123');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByText('Cadastro salvo.', { exact: true }).waitFor();
  assert.equal(writes.find((w) => w.p === '/api/users').body.clientId, 'c1');
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Operador Renomeado');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByText('Cadastro salvo.', { exact: true }).waitFor();
  assert.deepEqual(writes.find((w) => w.p === '/api/users/u1' && w.method === 'PATCH').body, {
    name: 'Operador Renomeado',
  });
  await page.goto(origin + 'usinas/cadastro');
  await page.getByLabel('Nome', { exact: true }).fill('Usina Cadastrada');
  await page.getByLabel('Potência nominal (kW)', { exact: true }).fill('8');
  await page.getByLabel('UF', { exact: false }).selectOption('AC');
  await page.getByLabel('Observações técnicas').fill('Inspeção concluída');
  await page.getByRole('button', { name: 'Salvar usina' }).click();
  await page.waitForURL('**/usinas/p1');
  await page.getByRole('heading', { name: 'Usina Cadastrada', exact: true }).waitFor();
  assert.equal(writes.find((w) => w.p === '/api/plants').body.nominalPowerKw, 8);
  await page.goto(origin + 'inversores?usina=p1');
  await page.getByRole('button', { name: 'Novo inversor' }).click();
  await page.getByLabel('Fabricante', { exact: true }).fill('Fabricante');
  await page.getByLabel('Modelo', { exact: true }).fill('Modelo');
  await page.getByLabel('Número de série', { exact: true }).fill('SN-001');
  await page.getByRole('button', { name: 'Salvar inversor' }).click();
  await page.getByText('Série: SN-001', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Arquivar', exact: true }).click();
  await page.getByLabel('Confirme a série').fill('SN-001');
  await page.getByLabel('Motivo').fill('Substituição');
  await page.getByRole('button', { name: 'Confirmar arquivamento' }).click();
  await page.getByText('Nenhum inversor cadastrado.').waitFor();
  assert.equal(writes.find((w) => w.method === 'DELETE').body.revision, 0);
  await page.goto(origin + 'alarmes');
  await page.getByRole('button', { name: 'Reconhecer', exact: true }).click();
  await page.getByText('ACKNOWLEDGED', { exact: false }).waitFor();
  await page.goto(origin + 'relatorios?usina=p1');
  await page.getByRole('button', { name: 'Consultar relatório' }).click();
  await page.getByText('Sem medições no intervalo e filtros informados.').waitFor();
  await page.getByLabel('Incluir dados simulados (DEMO)').check();
  await page.getByRole('button', { name: 'Consultar relatório' }).click();
  await page.getByRole('cell', { name: 'VALID · SIMULADO', exact: true }).waitFor();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar página em CSV' }).click();
  assert.equal((await download).suggestedFilename(), 'solarsystem-medicoes.csv');
  await page.getByLabel('Apresentação').selectOption('month');
  await page.getByRole('button', { name: 'Consultar relatório' }).click();
  await page.getByRole('cell', { name: '2026-01', exact: true }).waitFor();
  assert.ok(calls.some((c) => c.p.endsWith('/aggregations') && c.query.includes('sourceLinkId=link1')));
  await page.goto(origin + 'configuracoes');
  await page.getByLabel('Nome da conta').fill('Conta Nova');
  await page.getByLabel('Plataforma', { exact: false }).selectOption('DEMO');
  await page.getByLabel('Quantidade', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Cadastrar integração' }).click();
  await page.getByText('Integração cadastrada.', { exact: false }).waitFor();
  assert.equal(writes.find((w) => w.p === '/api/integrations').body.credentials.quantidade, '2');
  for (const width of [1366, 683, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      '',
      'usinas',
      'usinas/cadastro',
      'usinas/p1',
      'inversores?usina=p1',
      'clientes',
      'usuarios',
      'alarmes',
      'relatorios',
      'configuracoes',
    ]) {
      await page.goto(origin + route);
      await page.locator('main').waitFor();
      await page.waitForTimeout(70);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `overflow ${route} @ ${width}`,
      );
    }
  }
  if (process.env.PAINEL_SCREENSHOT_DIR) {
    await page.goto(origin + 'usinas/cadastro');
    await page.getByRole('heading', { name: 'Cadastro de usina', exact: true }).waitFor();
    await page.screenshot({
      path: path.join(process.env.PAINEL_SCREENSHOT_DIR, 'cadastro-mobile.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(origin);
    await page.locator('.visao-geral').waitFor();
    await page.screenshot({
      path: path.join(process.env.PAINEL_SCREENSHOT_DIR, 'visao-desktop.png'),
      fullPage: true,
    });
  }
  role = 'CLIENT';
  const marker = calls.length;
  await page.goto(origin + 'usuarios');
  await page.getByRole('alert').filter({ hasText: 'Acesso restrito' }).waitFor();
  assert.equal(
    calls.slice(marker).some((c) => c.p === '/api/users'),
    false,
  );
  await page.goto(origin + 'usinas/cadastro');
  await page.getByRole('alert').filter({ hasText: 'Cadastro permitido' }).waitFor();
  await page.goto(origin + 'inversores?usina=p1');
  assert.equal(await page.getByRole('button', { name: 'Novo inversor' }).count(), 0);
  role = 'OPERATOR';
  await page.goto(origin + 'usuarios');
  await page.getByRole('alert').filter({ hasText: 'Acesso restrito' }).waitFor();
  assert.deepEqual(errors, []);
});

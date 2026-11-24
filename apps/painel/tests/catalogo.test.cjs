const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('../../web/tests/node_modules/playwright');

test('React: cria manual, revisa descoberta, vincula sem duplicar e reflow móvel', async (t) => {
  const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
  const server = await createServer({
    root: path.resolve(__dirname, '..'),
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await server.listen();
  t.after(() => server.close());
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  const plants = [];
  const integration = {
    id: 'integration',
    name: 'Conta DEMO teste',
    enabled: true,
    archivedAt: null,
    revision: 0,
  };
  let discovered = false;
  const discovery = {
    id: 'discovery',
    integrationId: integration.id,
    externalId: '001',
    revision: 0,
    observedAt: new Date().toISOString(),
    snapshot: { name: 'Nome na plataforma', city: null, state: null, capacityKwp: 40 },
  };
  const envelope = (itens) => ({ itens, total: itens.length, pagina: 1, porPagina: 100 });
  // Intercepta TODAS as chamadas /api. O teste nunca usa um backend ou sessão real.
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const method = route.request().method();
    let data;
    let status = 200;
    if (pathname === '/api/auth/me')
      data = { id: 'admin', nome: 'Admin teste', email: 'admin@example.test', role: 'ADMIN' };
    else if (pathname === '/api/alerts') data = envelope([]);
    else if (pathname === '/api/clients') data = envelope([]);
    else if (pathname === '/api/integrations') data = [integration];
    else if (pathname.endsWith('/sync')) {
      discovered = true;
      data = { descobertasPendentes: 1 };
    } else if (pathname.endsWith('/discoveries')) data = envelope(discovered ? [discovery] : []);
    else if (pathname === '/api/plants' && method === 'GET') data = envelope(plants);
    else if (pathname === '/api/plants' && method === 'POST') {
      const body = route.request().postDataJSON();
      assert.equal(body.name, 'Minha usina');
      assert.equal(body.capacityKwp, 25);
      data = {
        ...body,
        id: 'plant',
        origin: 'MANUAL',
        revision: 0,
        integrationId: null,
        externalId: null,
        clientId: null,
        client: null,
        monitoring: 'UNLINKED',
        metadataSources: { name: 'MANUAL', capacityKwp: 'MANUAL', city: 'UNSET', state: 'UNSET' },
      };
      plants.push(data);
      status = 201;
    } else if (pathname === '/api/plants/plant/external-link') {
      const body = route.request().postDataJSON();
      assert.equal(body.externalId, '001');
      assert.equal(body.revision, 0);
      assert.equal(body.discoveryRevision, 0);
      Object.assign(plants[0], {
        integrationId: integration.id,
        externalId: '001',
        revision: 1,
        monitoring: 'WAITING',
      });
      discovered = false;
      data = plants[0];
      status = 201;
    } else throw new Error(`Chamada inesperada: ${method} ${pathname}`);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const port = server.httpServer.address().port;
  await page.goto(`http://127.0.0.1:${port}/usinas`);
  await page.getByRole('button', { name: 'Cadastrar usina' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Minha usina');
  await page.getByLabel('Capacidade (kWp)', { exact: true }).fill('25');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('heading', { name: 'Cadastros (1)' }).waitFor();
  await page.getByLabel('Integração', { exact: true }).selectOption('integration');
  await page.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  await page.getByLabel('Cadastro existente', { exact: true }).selectOption('plant');
  await page.getByRole('button', { name: 'Vincular existente', exact: true }).click();
  await page.getByText('Vínculo criado sem duplicar o cadastro.').waitFor();
  assert.equal(plants.length, 1);
  assert.equal(plants[0].name, 'Minha usina');
  assert.equal(plants[0].capacityKwp, 25);
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  for (const width of [1366, 683, 390, 320]) {
    await page.setViewportSize({ width, height: 768 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `overflow em ${width}`,
    );
  }
  assert.deepEqual(errors, []);
});

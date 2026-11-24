const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('../../web/tests/node_modules/playwright');

test('painel recupera sessão, reautentica na rota anterior e confirma logout', async (t) => {
  const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
  const server = await createServer({
    root: path.resolve(__dirname, '..'),
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  t.after(() => server.close());
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(6000);
  const usuario = { id: 'cliente', nome: 'Cliente Teste', email: 'cliente@example.test', role: 'CLIENT' };
  const paginaVazia = { itens: [], total: 0, pagina: 1, porPagina: 100 };
  let autenticado = false;
  let indisponivel = true;
  let limitarLogin = true;
  let falharLogout = true;
  const chegadaAtrasada = Promise.withResolvers();
  const liberarAtrasada = Promise.withResolvers();
  const chegadaLogout = Promise.withResolvers();
  const liberarLogout = Promise.withResolvers();

  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const responder = (status, json) => route.fulfill({ status, json });
    if (pathname === '/api/auth/me') {
      if (indisponivel) return responder(503, { message: 'Indisponível' });
      return autenticado ? responder(200, usuario) : responder(401, { message: 'Faça login' });
    }
    if (pathname === '/api/auth/login') {
      if (limitarLogin) {
        return route.fulfill({ status: 429, headers: { 'Retry-After': '3' }, json: { statusCode: 429 } });
      }
      const { email, senha } = route.request().postDataJSON();
      if (email !== usuario.email || senha !== 'correta') {
        return responder(401, { message: 'E-mail ou senha incorretos' });
      }
      autenticado = true;
      return responder(200, { usuario });
    }
    if (pathname === '/api/auth/logout') {
      if (falharLogout) return route.abort('failed');
      chegadaLogout.resolve();
      await liberarLogout.promise;
      autenticado = false;
      return route.fulfill({ status: 204 });
    }
    if (pathname === '/api/resposta-antiga') {
      chegadaAtrasada.resolve();
      await liberarAtrasada.promise;
      return responder(401, { message: 'Sessão antiga' });
    }
    if (pathname === '/api/restrito') return responder(403, { message: 'Sem permissão' });
    if (!autenticado) return responder(401, { message: 'Sessão expirada' });
    return responder(200, paginaVazia);
  });

  const entrar = async (senha) => {
    await page.getByRole('textbox', { name: 'E-mail' }).fill(usuario.email);
    await page.locator('input[autocomplete="current-password"]').fill(senha);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  };
  const protegido = '/usinas?origem=teste#cadastro';
  const origem = server.resolvedUrls.local[0];
  await page.goto(new URL(protegido, origem).href);
  await page.getByRole('alert').filter({ hasText: 'Não foi possível verificar sua sessão.' }).waitFor();
  indisponivel = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await page.waitForURL('**/login');
  await entrar('correta');
  await page.getByRole('alert').filter({ hasText: 'Tente novamente em 3 s.' }).waitFor();
  const botaoEntrar = page.getByRole('button', { name: 'Entrar', exact: true });
  assert.equal(await botaoEntrar.isDisabled(), true);
  limitarLogin = false;
  await page.locator('button[type="submit"]:enabled').waitFor();
  await entrar('incorreta');
  await page.getByRole('alert').filter({ hasText: 'E-mail ou senha incorretos' }).waitFor();
  await entrar('correta');
  await page.waitForURL(new URL(protegido, origem).href);
  const sair = page.getByRole('button', { name: 'Sair', exact: true });
  await sair.waitFor();
  await page.reload();
  await sair.waitFor();

  assert.equal(
    await page.evaluate(async () => {
      const { api } = await import('/src/api.ts');
      return api('/restrito').catch((erro) => erro.status);
    }),
    403,
  );
  await sair.waitFor();
  await page.evaluate(async () => {
    const { api } = await import('/src/api.ts');
    window.statusAntigo = api('/resposta-antiga').catch((erro) => erro.status);
  });
  await chegadaAtrasada.promise;
  autenticado = false;
  await page.getByRole('link', { name: 'Visão geral' }).click();
  await page.waitForURL('**/login');
  await entrar('correta');
  await sair.waitFor();
  liberarAtrasada.resolve();
  assert.equal(await page.evaluate(() => window.statusAntigo), 401);
  await sair.waitFor();

  await sair.click();
  await page.getByRole('alert').filter({ hasText: 'Não foi possível encerrar a sessão.' }).waitFor();
  await sair.waitFor();
  falharLogout = false;
  await sair.click();
  await chegadaLogout.promise;
  autenticado = false;
  assert.equal(
    await page.evaluate(async () => {
      const { api } = await import('/src/api.ts');
      return api('/auth/me').catch((erro) => erro.status);
    }),
    401,
  );
  await page.getByRole('button', { name: 'Saindo...' }).waitFor();
  liberarLogout.resolve();
  await page.waitForURL('**/login');
  await page.reload();
  await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
});

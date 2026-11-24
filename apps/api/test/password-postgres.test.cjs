const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { createServer } = require('node:net');
const { test } = require('node:test');
const { PrismaClient } = require('@prisma/client');
const { hash, compare } = require('bcryptjs');
const { PasswordService } = require('../src/auth/password.service.ts');
const { PasswordMailer } = require('../src/auth/password-mailer.ts');

test('PostgreSQL consome recuperação uma vez, expira links e invalida a versão da sessão', async () => {
  const alvo = new URL(process.env.SOLARSYSTEM_PASSWORD_TEST_DATABASE_URL);
  assert.equal(alvo.hostname, '127.0.0.1');
  assert.equal(alvo.pathname, '/solarsystem_password_validation');
  const prisma = new PrismaClient({ datasourceUrl: alvo.href });
  const enviados = [];
  const config = { getOrThrow: () => 'https://painel.example.test' };
  const mailer = { habilitado: true, enviar: async (email, link) => enviados.push({ email, link }) };
  const service = new PasswordService(prisma, mailer, config);
  const senhaOriginal = 'SenhaOriginal123';
  const senhaNova = 'SenhaNova456';
  const email = `${randomUUID()}@example.test`;
  const usuario = () => prisma.user.findUniqueOrThrow({ where: { email } });
  const tokenEnviado = () => new URLSearchParams(new URL(enviados.at(-1).link).hash.slice(1)).get('token');

  try {
    await prisma.user.create({ data: { email, name: 'Teste', passwordHash: await hash(senhaOriginal, 4) } });
    await service.emitir('ausente@example.test');
    await prisma.user.update({ where: { email }, data: { active: false } });
    await service.emitir(email);
    assert.equal(enviados.length, 0);
    await prisma.user.update({ where: { email }, data: { active: true } });
    await Promise.all([service.emitir(email), service.emitir(email)]);
    assert.equal(enviados.length, 1);
    const token = tokenEnviado();
    const emitido = await usuario();
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(new URL(enviados[0].link).search, '');
    assert.equal(emitido.passwordResetDigest, createHash('sha256').update(token).digest('hex'));
    assert.ok(emitido.passwordResetExpiresAt.getTime() - Date.now() <= 15 * 60 * 1000);
    assert.ok(emitido.passwordResetExpiresAt > new Date());

    const resultados = await Promise.allSettled([
      service.redefinir({ token, novaSenha: senhaNova }),
      service.redefinir({ token, novaSenha: senhaNova }),
    ]);
    assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
    await assert.rejects(service.redefinir({ token, novaSenha: senhaNova }), /Link inválido/);
    const redefinido = await usuario();
    assert.equal(redefinido.sessionVersion, 1);
    assert.equal(redefinido.passwordResetDigest, null);
    assert.equal(await compare(senhaOriginal, redefinido.passwordHash), false);
    assert.equal(await compare(senhaNova, redefinido.passwordHash), true);

    await service.emitir(email);
    await prisma.user.update({ where: { email }, data: { passwordResetExpiresAt: new Date(0) } });
    await assert.rejects(service.redefinir({ token: tokenEnviado(), novaSenha: senhaOriginal }), /expirado/);
    await service.emitir(email);
    const pendente = tokenEnviado();
    await assert.rejects(
      service.alterar(redefinido.id, { senhaAtual: senhaOriginal, novaSenha: senhaOriginal }),
      /Senha atual incorreta/,
    );
    await service.alterar(redefinido.id, { senhaAtual: senhaNova, novaSenha: senhaOriginal });
    assert.equal((await usuario()).sessionVersion, 2);
    await assert.rejects(service.redefinir({ token: pendente, novaSenha: senhaNova }), /Link inválido/);
  } finally {
    await prisma.$disconnect();
  }
});

test('SMTP local recebe o link e o modo produção exige TLS', async (t) => {
  const mensagens = [];
  const conexoes = new Set();
  const servidor = createServer((socket) => {
    conexoes.add(socket);
    socket.on('close', () => conexoes.delete(socket));
    socket.setEncoding('utf8');
    socket.write('220 localhost SMTP de teste\r\n');
    let pendente = '';
    let mensagem = null;
    socket.on('data', (dados) => {
      pendente += dados;
      let quebra;
      while ((quebra = pendente.indexOf('\r\n')) !== -1) {
        const linha = pendente.slice(0, quebra);
        pendente = pendente.slice(quebra + 2);
        if (mensagem !== null) {
          if (linha === '.') {
            mensagens.push(mensagem);
            mensagem = null;
            socket.write('250 Recebido\r\n');
          } else {
            mensagem += linha + '\n';
          }
        } else if (linha === 'DATA') {
          mensagem = '';
          socket.write('354 Envie a mensagem\r\n');
        } else if (linha === 'QUIT') {
          socket.end('221 Encerrado\r\n');
        } else if (linha === 'STARTTLS') {
          socket.write('454 TLS indisponível\r\n');
        } else {
          socket.write('250 OK\r\n');
        }
      }
    });
  });
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    for (const socket of conexoes) socket.destroy();
    return new Promise((resolve) => servidor.close(resolve));
  });
  const mailer = (ambiente) =>
    new PasswordMailer({
      get: (chave) =>
        ({
          SMTP_URL: `smtp://127.0.0.1:${servidor.address().port}`,
          PASSWORD_RESET_FROM: 'solar@example.test',
          NODE_ENV: ambiente,
        })[chave],
    });
  const link = 'https://painel.example.test/redefinir-senha#token=amostra';
  await mailer('development').enviar('cliente@example.test', link);
  assert.equal(mensagens.length, 1);
  assert.match(mensagens[0], /To: cliente@example.test/);
  assert.ok(mensagens[0].includes(link.replace('=', '=3D')) || mensagens[0].includes(link));
  await assert.rejects(mailer('production').enviar('cliente@example.test', link));
  assert.equal(mensagens.length, 1);
});

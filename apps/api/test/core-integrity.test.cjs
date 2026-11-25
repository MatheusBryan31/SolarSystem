// Após build da API: serviços compilados reais, SQL PostgreSQL WASM em memória.
// A ponte abaixo não substitui a validação do driver Prisma em servidor isolado.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const { ClientsService } = require('../dist/src/clients/clients.service');
const { UsersService } = require('../dist/src/users/users.service');
const { contextoDaRequisicao } = require('../dist/src/common/request-context');

test('serviços do núcleo preservam vínculos, revogam sessões e auditam atomicamente', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const root = path.join(__dirname, '../prisma/migrations');
  for (const dir of fs
    .readdirSync(root)
    .filter((name) => /^\d/.test(name))
    .sort()) {
    await db.exec(fs.readFileSync(path.join(root, dir, 'migration.sql'), 'utf8'));
  }
  const scalar = async (sql, args) => Number((await db.query(sql, args)).rows[0].n);
  const tx = {
    $queryRaw: async (strings, ...values) =>
      (
        await db.query(
          strings.reduce((sql, part, i) => sql + (i ? `$${i}` : '') + part, ''),
          values,
        )
      ).rows,
    client: {
      delete: async ({ where }) =>
        (await db.query('DELETE FROM clients WHERE id=$1 RETURNING id', [where.id])).rows[0],
    },
    plant: {
      count: ({ where }) => scalar('SELECT COUNT(*) AS n FROM plants WHERE client_id=$1', [where.clientId]),
    },
    user: {
      count: ({ where }) =>
        where.clientId
          ? scalar('SELECT COUNT(*) AS n FROM users WHERE client_id=$1', [where.clientId])
          : scalar("SELECT COUNT(*) AS n FROM users WHERE role='ADMIN' AND active=true", []),
      findUnique: async ({ where }) =>
        (
          await db.query(
            'SELECT id, name, email, role, active, client_id AS "clientId" FROM users WHERE id=$1',
            [where.id],
          )
        ).rows[0],
      update: async ({ where, data }) => {
        const args = [where.id],
          sets = [];
        for (const [key, column] of Object.entries({
          role: 'role',
          active: 'active',
          email: 'email',
          clientId: 'client_id',
          passwordResetDigest: 'password_reset_digest',
          passwordResetExpiresAt: 'password_reset_expires_at',
        })) {
          if (Object.hasOwn(data, key)) {
            args.push(data[key]);
            sets.push(`${column}=$${args.length}`);
          }
        }
        if (data.sessionVersion) sets.push('session_version=session_version+1');
        return (await db.query(`UPDATE users SET ${sets.join(',')} WHERE id=$1 RETURNING id`, args)).rows[0];
      },
    },
  };
  const prisma = {
    ...tx,
    $transaction: async (work) => {
      await db.exec('BEGIN');
      try {
        const result = await work(tx);
        await db.exec('COMMIT');
        return result;
      } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
      }
    },
  };
  await db.exec(`INSERT INTO clients (id, name, updated_at) VALUES ('c', 'Cliente preservado', NOW()), ('empty', 'Sem vínculos', NOW());
    INSERT INTO users (id, name, email, password_hash, role, updated_at) VALUES
      ('admin', 'Administrador', 'admin@example.test', 'fixture', 'ADMIN', NOW()),
      ('op', 'Operador', 'op@example.test', 'fixture', 'OPERATOR', NOW());
    INSERT INTO plants (id, name, origin, client_id, updated_at) VALUES ('p', 'Usina', 'MANUAL', 'c', NOW());`);
  const clientService = new ClientsService(prisma);
  const userService = new UsersService(prisma);
  const admin = { id: 'admin', role: 'ADMIN' };
  await assert.rejects(clientService.remover('c'), (error) => error.getStatus() === 409);
  assert.equal((await db.query("SELECT client_id FROM plants WHERE id='p'")).rows[0].client_id, 'c');
  await contextoDaRequisicao.run({ actorId: 'admin', requestId: 'isolated-core-test' }, () =>
    clientService.remover('empty'),
  );
  assert.equal(
    await scalar(
      "SELECT COUNT(*) AS n FROM security_audit_events WHERE entity_type='clients' AND entity_id='empty' AND action='deleted' AND actor_id='admin'",
      [],
    ),
    1,
  );
  await userService.atualizar('op', { active: false }, admin);
  await userService.atualizar('op', { active: true }, admin);
  assert.equal(
    (await db.query("SELECT session_version FROM users WHERE id='op'")).rows[0].session_version,
    2,
  );
  await assert.rejects(
    userService.atualizar('admin', { active: false }, { id: 'request-already-in-flight', role: 'ADMIN' }),
    (error) => error.getStatus() === 409,
  );
  assert.equal((await db.query("SELECT active FROM users WHERE id='admin'")).rows[0].active, true);
  assert.equal(await scalar("SELECT COUNT(*) AS n FROM plants WHERE id='p' AND client_id='c'", []), 1);
});

test('start:prod aponta para o entrypoint efetivamente compilado', () => {
  const manifest = require('../package.json');
  const entry = manifest.scripts['start:prod'].split(' ')[1];
  assert.equal(entry, 'dist/src/main.js');
  assert.ok(fs.existsSync(path.join(__dirname, '..', entry)));
});

/* PostgreSQL WASM inteiramente em memória. Não lê .env, URLs ou instâncias locais.
   Dependência de validação opcional, instalada fora do monorepo; veja docs/IMPLEMENTACAO_USINAS.md. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');

test('migration preserva cadastro/histórico e impõe identidade e fonte ativa únicas', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const root = path.join(__dirname, '../prisma/migrations');
  const target = '20261124010000_plant_catalog';
  for (const dir of fs
    .readdirSync(root)
    .filter((dir) => dir < target && /^\d/.test(dir))
    .sort()) {
    await db.exec(fs.readFileSync(path.join(root, dir, 'migration.sql'), 'utf8'));
  }
  await db.exec(`
    INSERT INTO clients (id, name, updated_at) VALUES ('client', 'Cliente existente', NOW());
    INSERT INTO integrations (id, provider, name, updated_at) VALUES ('integration', 'DEMO', 'Conta existente', NOW());
    INSERT INTO plants (id, integration_id, external_id, name, client_id, capacity_kwp, city, state,
      status, current_power_kw, last_data_at, updated_at)
    VALUES ('plant', 'integration', '001', 'Nome já cadastrado', 'client', 25, NULL, 'MG',
      'ONLINE', 10, '2026-11-23T12:00:00Z', NOW());
    INSERT INTO alerts (id, type, severity, message, plant_id, integration_id, updated_at)
    VALUES ('alert', 'PLANT_OFFLINE', 'CRITICAL', 'Histórico preservado', 'plant', 'integration', NOW());
  `);
  const before = (await db.query('SELECT * FROM plants WHERE id = $1', ['plant'])).rows[0];
  await db.exec(fs.readFileSync(path.join(root, target, 'migration.sql'), 'utf8'));
  const after = (await db.query('SELECT * FROM plants WHERE id = $1', ['plant'])).rows[0];
  for (const [key, value] of Object.entries(before)) assert.deepEqual(after[key], value, key);
  assert.equal(after.origin, 'IMPORTED');
  assert.equal(after.manual_overrides.name, before.name);
  const link = (await db.query('SELECT * FROM plant_external_links')).rows[0];
  assert.equal(link.plant_id, 'plant');
  assert.equal(link.external_id, '001');
  assert.equal(link.last_sample.lastDataAt, '2026-11-23T12:00:00.000Z');
  assert.equal((await db.query('SELECT COUNT(*)::int AS total FROM alerts')).rows[0].total, 1);
  await db.exec(`INSERT INTO plants (id, name, origin, updated_at) VALUES
    ('manual-a', 'Usina homônima', 'MANUAL', NOW()), ('manual-b', 'Usina homônima', 'MANUAL', NOW());`);
  await assert.rejects(
    db.exec(`INSERT INTO plant_external_links
    (id, plant_id, integration_id, external_id, observed_at, remote_metadata)
    VALUES ('duplicate', 'manual-a', 'integration', '001', NOW(), '{}');`),
    /unique/i,
  );
  await assert.rejects(
    db.exec(`INSERT INTO plant_external_links
    (id, plant_id, integration_id, external_id, observed_at, remote_metadata)
    VALUES ('second-active', 'plant', 'integration', 'other', NOW(), '{}');`),
    /unique/i,
  );
  await db.exec(`UPDATE plant_external_links SET state='DETACHED', detached_at=NOW() WHERE plant_id='plant';
    UPDATE plants SET integration_id=NULL, external_id=NULL WHERE id='plant';
    INSERT INTO plant_external_links (id, plant_id, integration_id, external_id, observed_at, remote_metadata)
    VALUES ('next-active', 'plant', 'integration', 'next', NOW(), '{}');`);
  await assert.rejects(
    db.exec(`INSERT INTO plant_external_links
    (id, plant_id, integration_id, external_id, observed_at, remote_metadata)
    VALUES ('reimport', 'manual-a', 'integration', '001', NOW(), '{}');`),
    /unique/i,
  );
  await db.exec(
    `UPDATE plant_external_links SET state='DETACHED', detached_at=NOW() WHERE id='next-active';`,
  );
  assert.equal(
    (await db.query("SELECT COUNT(*)::int AS total FROM plant_external_links WHERE state='DETACHED'")).rows[0]
      .total,
    2,
  );
  await assert.rejects(
    db.exec("UPDATE plants SET integration_id='integration' WHERE id='manual-a'"),
    /check constraint/i,
  );
  await assert.rejects(db.exec("DELETE FROM integrations WHERE id='integration'"), /foreign key/i);
  await assert.rejects(db.exec("DELETE FROM plants WHERE id='plant'"), /foreign key/i);
  assert.equal((await db.query('SELECT COUNT(*)::int AS total FROM alerts')).rows[0].total, 1);
  // Evolução incremental sobre dados já migrados, inclusive históricos DETACHED.
  const preserved = (await db.query('SELECT * FROM plants ORDER BY id')).rows;
  const integrity = fs.readFileSync(
    path.join(root, '20261124020000_plant_catalog_integrity', 'migration.sql'),
    'utf8',
  );
  await db.exec(integrity);
  assert.deepEqual((await db.query('SELECT * FROM plants ORDER BY id')).rows, preserved);
  async function rejected(sql, message) {
    await assert.rejects(async () => {
      try {
        await db.exec(`BEGIN; ${sql}; COMMIT;`);
      } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
      }
    }, message);
  }
  await rejected("UPDATE plants SET origin='IMPORTED' WHERE id='manual-a'", /imutáveis/);
  await rejected("UPDATE plants SET id='replacement' WHERE id='manual-a'", /imutáveis/);
  await rejected("UPDATE plant_external_links SET plant_id='manual-a' WHERE id='next-active'", /reservada/);
  await rejected(
    "UPDATE plants SET integration_id='integration', external_id='orphan' WHERE id='manual-a'",
    /mesma identidade/,
  );
  await rejected(
    "UPDATE plant_external_links SET state='ACTIVE', detached_at=NULL WHERE id='next-active'",
    /mesma identidade/,
  );
  // A ordem das escritas dentro da transação não altera a consistência final.
  await db.exec(`BEGIN;
    UPDATE plants SET integration_id='integration', external_id='next' WHERE id='plant';
    UPDATE plant_external_links SET state='ACTIVE', detached_at=NULL WHERE id='next-active';
    COMMIT;`);
  await rejected("DELETE FROM plant_external_links WHERE id='next-active'", /mesma identidade/);
  await db.exec(`BEGIN;
    UPDATE plant_external_links SET state='DETACHED', detached_at=NOW() WHERE id='next-active';
    UPDATE plants SET integration_id=NULL, external_id=NULL WHERE id='plant';
    COMMIT;`);
  assert.equal((await db.query('SELECT COUNT(*)::int AS total FROM alerts')).rows[0].total, 1);
});

test('migration de integridade recusa divergências existentes sem reparar nem apagar dados', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const root = path.join(__dirname, '../prisma/migrations');
  const target = '20261124020000_plant_catalog_integrity';
  for (const dir of fs
    .readdirSync(root)
    .filter((dir) => /^\d/.test(dir) && dir < target)
    .sort()) {
    await db.exec(fs.readFileSync(path.join(root, dir, 'migration.sql'), 'utf8'));
  }
  await db.exec(`INSERT INTO integrations (id, provider, name, updated_at) VALUES ('i', 'DEMO', 'Teste', NOW());
    INSERT INTO plants (id, integration_id, external_id, name, origin, updated_at)
    VALUES ('p', 'i', 'remote', 'Cadastro preservado', 'IMPORTED', NOW());`);
  await assert.rejects(
    db.exec(fs.readFileSync(path.join(root, target, 'migration.sql'), 'utf8')),
    /Catálogo divergente/,
  );
  await db.exec('ROLLBACK');
  assert.equal((await db.query("SELECT name FROM plants WHERE id='p'")).rows[0].name, 'Cadastro preservado');
  assert.equal(
    (
      await db.query(
        "SELECT COUNT(*)::int AS total FROM pg_trigger WHERE tgname='plant_identity_immutable_guard'",
      )
    ).rows[0].total,
    0,
  );
});

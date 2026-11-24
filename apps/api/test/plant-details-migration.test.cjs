// PostgreSQL descartável em memória, sem .env, servidor ou credenciais reais.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');

test('detalhes de usina: expansão preserva registros e impõe limites sem restringir legado', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const root = path.join(__dirname, '../prisma/migrations');
  const target = '20261124040000_plant_details';
  for (const dir of fs
    .readdirSync(root)
    .filter((dir) => /^\d/.test(dir) && dir < target)
    .sort()) {
    await db.exec(fs.readFileSync(path.join(root, dir, 'migration.sql'), 'utf8'));
  }
  await db.exec(`INSERT INTO clients (id, name, updated_at) VALUES ('c', 'Cliente', NOW());
    INSERT INTO plants (id, name, origin, client_id, state, capacity_kwp, manual_overrides, updated_at)
    VALUES ('p', 'A', 'MANUAL', 'c', 'Estado antigo livre', -1, '{"name":"A"}', NOW());
    INSERT INTO alerts (id, type, severity, message, plant_id, updated_at)
    VALUES ('a', 'PLANT_OFFLINE', 'WARNING', 'Histórico preservado', 'p', NOW());`);
  const before = (await db.query("SELECT * FROM plants WHERE id='p'")).rows[0];
  await db.exec(fs.readFileSync(path.join(root, target, 'migration.sql'), 'utf8'));
  const after = (await db.query("SELECT * FROM plants WHERE id='p'")).rows[0];
  for (const [key, value] of Object.entries(before)) assert.deepEqual(after[key], value, key);
  assert.equal(after.nominal_power_kw, null);
  assert.equal(after.operation_start_date, null);
  await db.exec(`UPDATE plants SET installation_type='HYBRID', nominal_power_kw=25,
    module_tilt_degrees=90, postal_code='01234567', address_number='s/n',
    operation_start_date='2024-02-29', latitude=-90, longitude=180, technical_notes='Revisão' WHERE id='p';`);
  for (const assignment of [
    'nominal_power_kw=-1',
    "nominal_power_kw='NaN'",
    "nominal_power_kw='Infinity'",
    'module_tilt_degrees=91',
    "postal_code='01234-567'",
    'latitude=NULL',
    'longitude=181',
    "street=' '",
  ]) {
    await assert.rejects(db.exec(`UPDATE plants SET ${assignment} WHERE id='p'`), /check constraint/i);
  }
  const updated = (await db.query("SELECT * FROM plants WHERE id='p'")).rows[0];
  assert.equal(updated.nominal_power_kw, 25);
  assert.equal(updated.state, before.state);
  assert.equal(updated.client_id, 'c');
  assert.deepEqual(updated.manual_overrides, before.manual_overrides);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM alerts')).rows[0].n, 1);
});

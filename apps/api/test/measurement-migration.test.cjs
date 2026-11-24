// Integração SQL em PostgreSQL WASM descartável, sem .env nem servidor real.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');

test('histórico: expansão, UTC, deduplicação, qualidade, escopo e consultas', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const root = path.join(__dirname, '../prisma/migrations');
  const target = '20261124050000_measurements';
  for (const dir of fs
    .readdirSync(root)
    .filter((dir) => /^\d/.test(dir) && dir < target)
    .sort()) {
    await db.exec(fs.readFileSync(path.join(root, dir, 'migration.sql'), 'utf8'));
  }
  await db.exec(`BEGIN;
    INSERT INTO integrations (id, name, provider, updated_at) VALUES ('i', 'Demo', 'DEMO', NOW());
    INSERT INTO plants (id, name, origin, integration_id, external_id, updated_at, total_energy_kwh)
      VALUES ('p', 'Preservada', 'IMPORTED', 'i', 'remote', NOW(), 100);
    INSERT INTO plants (id, name, origin, updated_at) VALUES ('other', 'Outra', 'MANUAL', NOW());
    INSERT INTO plant_external_links (id, plant_id, integration_id, external_id, observed_at, remote_metadata)
      VALUES ('link', 'p', 'i', 'remote', NOW(), '{}');
    INSERT INTO inverters (id, plant_id, manufacturer, manufacturer_key, model, serial_number, serial_key, updated_at)
      VALUES ('inv', 'p', 'Maker', 'MAKER', 'Model', '001', '001', NOW()), ('foreign', 'other', 'Maker', 'MAKER', 'Model', '002', '002', NOW());
    COMMIT;`);
  const before = (await db.query('SELECT * FROM plants ORDER BY id')).rows;
  await db.exec(fs.readFileSync(path.join(root, target, 'migration.sql'), 'utf8'));
  assert.deepEqual((await db.query('SELECT * FROM plants ORDER BY id')).rows, before);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM measurements')).rows[0].n, 0);
  const insert = (id, time, inverter = null, power = 10) =>
    db.query(
      `INSERT INTO measurements
    (id, plant_id, inverter_id, source_link_id, source_provider, is_simulated, measured_at, power_kw, total_energy_kwh, quality)
    VALUES ($1, 'p', $2, 'link', 'DEMO', true, $3, $4, 100, 'VALID')`,
      [id, inverter, time, power],
    );
  await insert('a', '2026-01-01T12:00:00Z');
  await assert.rejects(insert('dup', '2026-01-01T09:00:00-03:00'), /unique/i);
  await insert('b', '2026-01-01T12:00:00Z', 'inv');
  await assert.rejects(insert('dup-inv', '2026-01-01T12:00:00Z', 'inv'), /unique/i);
  await assert.rejects(insert('wrong', '2026-01-01T13:00:00Z', 'foreign'), /foreign key/i);
  await assert.rejects(insert('negative', '2026-01-01T13:00:00Z', null, -1), /check constraint/i);
  await assert.rejects(db.exec("UPDATE measurements SET power_kw=20 WHERE id='a'"), /imutáveis/);
  await db.exec(`INSERT INTO measurements (id, plant_id, source_link_id, source_provider, is_simulated, measured_at, quality, quality_reason)
    VALUES ('partial', 'p', 'link', 'DEMO', true, '2026-01-01T13:00:00Z', 'PARTIAL', 'MISSING_VALUES');`);
  await assert.rejects(
    db.exec(`INSERT INTO measurements (id, plant_id, source_link_id, source_provider, is_simulated, measured_at, quality)
    VALUES ('invalid', 'p', 'link', 'DEMO', true, '2026-01-01T14:00:00Z', 'INVALID');`),
    /check constraint/i,
  );
  await db.exec(`INSERT INTO measurements (id, plant_id, source_link_id, source_provider, is_simulated, measured_at, period_start_at, period_energy_kwh, quality)
    VALUES ('period', 'p', 'link', 'DEMO', true, '2026-01-02T00:00:00Z', '2026-01-01T23:00:00Z', 2, 'VALID');`);
  const points = (
    await db.query(`SELECT id FROM measurements WHERE plant_id='p' AND inverter_id IS NULL
    AND measured_at >= '2026-01-01T00:00:00Z' AND measured_at < '2026-01-02T00:00:00Z' ORDER BY measured_at, id`)
  ).rows;
  assert.deepEqual(
    points.map((point) => point.id),
    ['a', 'partial'],
  );
  assert.deepEqual((await db.query('SELECT * FROM plants ORDER BY id')).rows, before);
  assert.equal(
    (await db.query("SELECT power_kw FROM measurements WHERE id='partial'")).rows[0].power_kw,
    null,
  );
  // Falha de integridade reverte toda a transação, preservando projeção atual.
  await assert.rejects(
    db.exec(`BEGIN; UPDATE plants SET current_power_kw=999 WHERE id='p';
    INSERT INTO measurements (id, plant_id, source_link_id, source_provider, is_simulated, measured_at, power_kw, quality)
    VALUES ('rollback', 'other', 'link', 'DEMO', true, NOW(), 1, 'VALID'); COMMIT;`),
    /foreign key/i,
  );
  await db.exec('ROLLBACK');
  assert.deepEqual((await db.query('SELECT * FROM plants ORDER BY id')).rows, before);
});

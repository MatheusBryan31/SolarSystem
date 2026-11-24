// SQL inteiramente em memória; mesma ferramenta opcional do teste de usinas.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');

test('inversores: migration aditiva, identidade física/externa, reserva e FKs', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const root = path.join(__dirname, '../prisma/migrations');
  const target = '20261124030000_inverters';
  for (const dir of fs
    .readdirSync(root)
    .filter((dir) => /^\d/.test(dir) && dir < target)
    .sort()) {
    await db.exec(fs.readFileSync(path.join(root, dir, 'migration.sql'), 'utf8'));
  }
  await db.exec(`INSERT INTO plants (id, name, origin, updated_at) VALUES
    ('p', 'Usina preservada', 'MANUAL', NOW()), ('other', 'Outra usina', 'MANUAL', NOW());
    INSERT INTO integrations (id, name, provider, updated_at) VALUES ('i', 'Conta 1', 'DEMO', NOW()), ('j', 'Conta 2', 'DEMO', NOW());`);
  const before = (await db.query('SELECT * FROM plants ORDER BY id')).rows;
  await db.exec(fs.readFileSync(path.join(root, target, 'migration.sql'), 'utf8'));
  assert.deepEqual((await db.query('SELECT * FROM plants ORDER BY id')).rows, before);
  const insert = (id, manufacturer, serial, extra = '') =>
    db.exec(`INSERT INTO inverters
    (id, plant_id, manufacturer, manufacturer_key, model, serial_number, serial_key, updated_at ${extra ? ', origin, integration_id, external_id' : ''})
    VALUES ('${id}', 'p', '${manufacturer}', '${manufacturer.toUpperCase()}', 'Modelo', '${serial}', '${serial.toUpperCase()}', NOW() ${extra});`);
  await insert('a', 'Fabricante', '001');
  await assert.rejects(insert('b', 'fabricante', '001'), /unique/i);
  await insert('c', 'Outro fabricante', '001');
  await insert('d', 'Fabricante', '002', ", 'IMPORTED', 'i', 'remote'");
  await assert.rejects(insert('e', 'Fabricante', '003', ", 'IMPORTED', 'i', 'remote'"), /unique/i);
  // Identidade remota é local à integração; série física não é.
  await insert('f', 'Fabricante', '003', ", 'IMPORTED', 'j', 'remote'");
  await assert.rejects(insert('g', 'Fabricante', '002', ", 'IMPORTED', 'j', 'another'"), /unique/i);
  await assert.rejects(insert('h', 'Fabricante', '004', ", 'IMPORTED', NULL, NULL"), /check constraint/i);
  await assert.rejects(db.exec("UPDATE inverters SET plant_id='missing' WHERE id='a'"), /foreign key/i);
  await assert.rejects(db.exec("DELETE FROM plants WHERE id='p'"), /foreign key/i);
  await assert.rejects(db.exec("DELETE FROM integrations WHERE id='i'"), /foreign key/i);
  await assert.rejects(db.exec("UPDATE inverters SET archived_at=NOW() WHERE id='a'"), /check constraint/i);
  await db.exec(
    "UPDATE inverters SET archived_at=NOW(), archive_reason='Substituição', archived_by_id='admin', revision=revision+1 WHERE id='a'",
  );
  assert.equal(
    (await db.query("SELECT COUNT(*)::int AS total FROM inverters WHERE id='a'")).rows[0].total,
    1,
  );
  await assert.rejects(insert('replacement', 'FABRICANTE', '001'), /unique/i);
  assert.deepEqual((await db.query('SELECT * FROM plants ORDER BY id')).rows, before);
});

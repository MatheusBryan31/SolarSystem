const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const root = path.join(__dirname, '../prisma/migrations');
const target = '20261125010000_alerts_reporting';
async function history(db, until = target) {
  for (const dir of fs
    .readdirSync(root)
    .filter((dir) => /^\d/.test(dir) && dir < until)
    .sort())
    await db.exec(fs.readFileSync(path.join(root, dir, 'migration.sql'), 'utf8'));
}
const migration = () => fs.readFileSync(path.join(root, target, 'migration.sql'), 'utf8');
const total = async (db, table) => Number((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n);

test('migration preserva alertas, registra transições e deduplica fila sem enviar nada', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await history(db);
  await db.exec(`INSERT INTO plants(id,name,origin,updated_at) VALUES ('p','Fixture','MANUAL',NOW());
    INSERT INTO alerts(id,plant_id,type,severity,message,updated_at) VALUES ('old','p','PLANT_FAULT','CRITICAL','Histórico',NOW());`);
  const old = (await db.query("SELECT * FROM alerts WHERE id='old'")).rows[0];
  const oldUtc = (await db.query("SELECT opened_at AT TIME ZONE 'UTC' AS at FROM alerts WHERE id='old'"))
    .rows[0].at;
  await db.exec("SET TIME ZONE 'America/Sao_Paulo'");
  await db.exec(migration());
  assert.equal(
    new Date(
      (await db.query("SELECT created_at FROM alert_events WHERE alert_id='old'")).rows[0].created_at,
    ).toISOString(),
    new Date(oldUtc).toISOString(),
  );
  const after = (await db.query("SELECT * FROM alerts WHERE id='old'")).rows[0];
  for (const [key, value] of Object.entries(old)) assert.deepEqual(after[key], value, key);
  assert.equal(await total(db, 'alert_events'), 1);
  assert.equal(await total(db, 'alert_emails'), 0);
  await db.exec(`INSERT INTO alert_notification_settings(id,enabled,recipients,statuses)
    VALUES ('default',true,ARRAY['ops@example.test'],ARRAY['OPEN','ACKNOWLEDGED','RESOLVED']::"AlertStatus"[]);
    INSERT INTO alerts(id,plant_id,type,severity,message,updated_at) VALUES ('new','p','PLANT_OFFLINE','CRITICAL','Fixture',NOW());`);
  assert.equal(await total(db, 'alert_emails'), 1);
  await assert.rejects(
    db.exec(
      `INSERT INTO alerts(id,plant_id,type,severity,message,updated_at) VALUES ('duplicate','p','PLANT_OFFLINE','CRITICAL','Fixture',NOW());`,
    ),
    /unique/i,
  );
  await db.exec(`UPDATE alerts SET status='ACKNOWLEDGED',acknowledged_at=NOW() WHERE id='new';
    UPDATE alerts SET status='ACKNOWLEDGED' WHERE id='new';
    UPDATE alerts SET status='RESOLVED',resolved_at=NOW(),resolution_reason='Condição encerrada' WHERE id='new';`);
  assert.equal(await total(db, 'alert_emails'), 3);
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM alert_events WHERE alert_id='new'")).rows[0].n,
    3,
  );
  await assert.rejects(db.exec("UPDATE alerts SET status='OPEN' WHERE id='new'"), /Transição/);
  await assert.rejects(db.exec("DELETE FROM alert_events WHERE alert_id='new'"), /imutável/);
  await db.exec(`INSERT INTO alerts(id,plant_id,type,severity,message,updated_at) VALUES ('recurrence','p','PLANT_OFFLINE','CRITICAL','Novo episódio',NOW());
    INSERT INTO alerts(id,plant_id,type,severity,message,is_simulated,updated_at) VALUES ('demo','p','GENERATION_ABNORMAL','WARNING','SIMULADO',true,NOW());`);
  assert.equal(await total(db, 'alert_emails'), 4);
  assert.equal((await db.query("SELECT count(*)::int n FROM alert_emails WHERE status='SENT'")).rows[0].n, 0);
  await assert.rejects(
    db.exec(
      "INSERT INTO alert_emails(id,event_id,recipient) SELECT 'duplicate-job',event_id,recipient FROM alert_emails LIMIT 1",
    ),
    /unique/i,
  );
});

test('duplicatas antigas bloqueiam migration sem resolver nem apagar registros', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await history(db);
  await db.exec(`INSERT INTO plants(id,name,origin,updated_at) VALUES ('p','Fixture','MANUAL',NOW());
    INSERT INTO alerts(id,plant_id,type,severity,message,updated_at) VALUES ('a','p','PLANT_FAULT','CRITICAL','a',NOW()),('b','p','PLANT_FAULT','CRITICAL','b',NOW());`);
  await assert.rejects(db.exec(migration()), /duplicados/);
  await db.exec('ROLLBACK');
  assert.equal(await total(db, 'alerts'), 2);
});

test('alerta legado DEMO permanece simulado após desvinculação e nunca entra na fila', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await history(db);
  await db.exec(`BEGIN;
    INSERT INTO integrations(id,name,provider,credentials,updated_at) VALUES ('i','Fixture','DEMO','"ss:v1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA.AA"',NOW());
    INSERT INTO plants(id,name,origin,integration_id,external_id,updated_at) VALUES ('p','Fixture','IMPORTED','i','remote',NOW());
    INSERT INTO plant_external_links(id,plant_id,integration_id,external_id,observed_at,remote_metadata) VALUES ('l','p','i','remote',NOW(),'{}');
    INSERT INTO alerts(id,plant_id,type,severity,message,updated_at) VALUES ('legacy-demo','p','PLANT_FAULT','CRITICAL','Fixture',NOW());
    UPDATE plant_external_links SET state='DETACHED',detached_at=NOW() WHERE id='l';
    UPDATE plants SET integration_id=NULL,external_id=NULL WHERE id='p';
    COMMIT;`);
  await db.exec(migration());
  assert.equal(
    (await db.query("SELECT is_simulated FROM alert_events WHERE alert_id='legacy-demo'")).rows[0]
      .is_simulated,
    true,
  );
  assert.equal(
    (await db.query("SELECT is_simulated FROM alerts WHERE id='legacy-demo'")).rows[0].is_simulated,
    true,
  );
  await db.exec(`INSERT INTO alert_notification_settings(enabled,recipients) VALUES (true,ARRAY['fixture@example.test']);
    UPDATE alerts SET status='RESOLVED',resolved_at=NOW(),resolution_reason='Fixture' WHERE id='legacy-demo';`);
  assert.equal(await total(db, 'alert_emails'), 0);
  assert.equal(
    (await db.query("SELECT count(*)::int n FROM alert_events WHERE alert_id='legacy-demo' AND is_simulated"))
      .rows[0].n,
    2,
  );
});

test('SQL de relatórios coincide com regras de energia, respeita cliente e suporta um ano de coleta', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await history(db, '99999999999999');
  const { reportAggregationSql } = require('../dist/src/measurements/report-aggregation.sql.js');
  const { aggregateReadings } = require('../dist/src/measurements/measurement-aggregation.js');
  await db.exec(`BEGIN;
    INSERT INTO clients(id,name,updated_at) VALUES ('c','Fixture',NOW());
    INSERT INTO integrations(id,name,provider,credentials,updated_at) VALUES ('i','DEMO','DEMO','"ss:v1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA.AA"',NOW());
    INSERT INTO plants(id,name,origin,client_id,integration_id,external_id,updated_at) VALUES ('p','Fixture','IMPORTED','c','i','remote',NOW());
    INSERT INTO plant_external_links(id,plant_id,integration_id,external_id,observed_at,remote_metadata) VALUES ('l','p','i','remote',NOW(),'{}');
    COMMIT;`);
  const fixtures = [
    ['a', '2026-01-01T00:05:00Z', '2026-01-01T00:00:00Z', 1, 10, 'VALID'],
    ['b', '2026-01-01T00:10:00Z', '2026-01-01T00:05:00Z', 2, 9, 'VALID'],
    ['c', '2026-01-01T00:20:00Z', '2026-01-01T00:08:00Z', 3, 8, 'VALID'],
    ['d', '2026-01-02T02:00:00Z', '2026-01-01T23:00:00Z', 4, 7, 'VALID'],
    ['e', '2026-01-01T12:00:00Z', null, null, 1000, 'INVALID'],
    ['f', '2026-01-03T00:00:00Z', '2026-01-02T23:00:00Z', 5, 6, 'VALID'],
  ];
  for (const [id, end, start, energy, power, quality] of fixtures)
    await db.query(
      `INSERT INTO measurements(id,plant_id,source_link_id,source_provider,is_simulated,measured_at,period_start_at,period_energy_kwh,power_kw,quality,quality_reason) VALUES ($1,'p','l','DEMO',true,$2,$3,$4,$5,$6,'TEST_FIXTURE')`,
      [id, end, start, energy, power, quality],
    );
  const rows = (
    await db.query(
      'SELECT id,measured_at AS "measuredAt",period_start_at AS "periodStartAt",period_energy_kwh AS "periodEnergyKwh",power_kw AS "powerKw",quality,is_simulated AS "isSimulated" FROM measurements',
    )
  ).rows;
  const query = {
    from: '2026-01-01T00:00:00Z',
    to: '2026-01-03T00:00:00Z',
    sourceLinkId: 'l',
    includeSimulated: true,
    period: 'day',
    timeZone: 'UTC',
  };
  async function aggregate(input, user = { role: 'CLIENT', clientId: 'c' }) {
    const sql = reportAggregationSql('p', input, user);
    return (
      await db.query(
        sql.text,
        sql.values.map((v) => (v instanceof Date ? v.toISOString() : v)),
      )
    ).rows;
  }
  for (const period of ['day', 'month', 'year'])
    for (const timeZone of ['UTC', 'America/Sao_Paulo']) {
      const q = { ...query, period, timeZone };
      assert.deepEqual(await aggregate(q), aggregateReadings(rows, q));
    }
  assert.deepEqual(await aggregate(query, { role: 'CLIENT', clientId: 'other' }), []);
  assert.deepEqual(await aggregate({ ...query, includeSimulated: false }), []);
  await db.exec(`INSERT INTO measurements(id,plant_id,source_link_id,source_provider,is_simulated,measured_at,power_kw,quality)
    SELECT gen_random_uuid()::text,'p','l','DEMO',true,time,10,'VALID' FROM generate_series('2025-01-01T00:00:00Z'::timestamptz,'2025-12-31T23:55:00Z'::timestamptz,'5 minutes') time;`);
  const annual = await aggregate({
    ...query,
    from: '2025-01-01T00:00:00Z',
    to: '2026-01-01T00:00:00Z',
    period: 'year',
  });
  assert.equal(annual.length, 1);
  assert.equal(annual[0].samples, 105120);
  assert.equal(annual[0].observedPeriodEnergyKwh, null);
  assert.equal(annual[0].peakPowerKw, 10);
  const { reportPdf } = require('../dist/src/reports/report-renderer.js');
  const pdf = await reportPdf({
    ...query,
    from: '2025-01-01T00:00:00Z',
    to: '2026-01-01T00:00:00Z',
    period: 'year',
    plantId: 'p',
    generatedAt: new Date().toISOString(),
    inverterId: null,
    includesSimulated: true,
    buckets: annual,
  });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  if (process.env.SOLARSYSTEM_REPORT_ARTIFACT_DIR) {
    fs.mkdirSync(process.env.SOLARSYSTEM_REPORT_ARTIFACT_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.SOLARSYSTEM_REPORT_ARTIFACT_DIR, 'relatorio-fixture.pdf'), pdf);
    const multipage = await reportPdf({
      ...query,
      plantId: 'FIXTURE-VISUAL-SEM-DADOS-REAIS',
      generatedAt: new Date().toISOString(),
      inverterId: null,
      includesSimulated: true,
      buckets: Array.from({ length: 24 }, (_, index) => ({ ...annual[0], bucket: `FIXTURE ${index + 1}` })),
    });
    assert.ok((multipage.toString('latin1').match(/\/Type \/Page\b/g) || []).length > 1);
    fs.writeFileSync(
      path.join(process.env.SOLARSYSTEM_REPORT_ARTIFACT_DIR, 'relatorio-multipagina-fixture.pdf'),
      multipage,
    );
  }
});

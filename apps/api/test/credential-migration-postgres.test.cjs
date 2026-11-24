const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { PrismaClient } = require('@prisma/client');
const { CredentialEncryption } = require('../src/integrations/credential-encryption.ts');
const { migrarCredenciais } = require('../prisma/encrypt-integration-credentials.ts');

test('converte sem perder credenciais, identidades, histórico ou timestamps', async () => {
  const alvo = new URL(process.env.SOLARSYSTEM_CREDENTIAL_TEST_DATABASE_URL);
  assert.equal(alvo.hostname, '127.0.0.1');
  assert.equal(alvo.pathname, '/solarsystem_credentials_validation');
  const prisma = new PrismaClient({ datasourceUrl: alvo.href });
  const cipher = new CredentialEncryption(Buffer.alloc(32, 19).toString('base64'));
  const credentials = { semente: 'amostra-reservada', quantidade: '1', observacao: 'unicode ☀' };
  const externalId = `DEMO-${credentials.semente}-001`;
  try {
    const conta = await prisma.integration.create({
      data: { provider: 'DEMO', name: 'Conta legada', credentials, lastError: credentials.semente },
    });
    const { plant, link, discovery, alert, reading, audit } = await prisma.$transaction(async (tx) => {
      const plant = await tx.plant.create({
        data: { name: 'Usina legada', integrationId: conta.id, externalId },
      });
      const link = await tx.plantExternalLink.create({
        data: {
          plantId: plant.id,
          integrationId: conta.id,
          externalId,
          remoteMetadata: {},
          observedAt: new Date(),
        },
      });
      const discovery = await tx.plantDiscovery.create({
        data: {
          integrationId: conta.id,
          externalId,
          snapshot: { externalId, name: 'Usina legada' },
          observedAt: new Date(),
        },
      });
      const alert = await tx.alert.create({
        data: {
          integrationId: conta.id,
          type: 'SYNC_FAILED',
          severity: 'WARNING',
          message: credentials.semente,
        },
      });
      const reading = await tx.measurement.create({
        data: {
          plantId: plant.id,
          sourceLinkId: link.id,
          sourceProvider: 'DEMO',
          isSimulated: true,
          measuredAt: new Date(),
          quality: 'VALID',
          powerKw: 1,
        },
      });
      const audit = await tx.plantAuditEvent.create({
        data: { plantId: plant.id, operation: 'LINK', details: { integrationId: conta.id, externalId } },
      });
      return { plant, link, discovery, alert, reading, audit };
    });
    const conflitante = await prisma.plantDiscovery.create({
      data: { integrationId: conta.id, externalId: 'DEMO2-001', snapshot: {}, observedAt: new Date() },
    });
    const lerConta = () => prisma.integration.findUniqueOrThrow({ where: { id: conta.id } });
    await assert.rejects(migrarCredenciais(prisma, cipher, true), /transação foi revertida/);
    assert.deepEqual((await lerConta()).credentials, credentials);
    assert.equal(
      (await prisma.plantExternalLink.findUniqueOrThrow({ where: { id: link.id } })).externalId,
      externalId,
    );
    await prisma.plantDiscovery.update({ where: { id: conflitante.id }, data: { externalId: randomUUID() } });

    assert.equal(await migrarCredenciais(prisma, cipher, false), 1);
    assert.deepEqual((await lerConta()).credentials, credentials);
    assert.equal(await migrarCredenciais(prisma, cipher, true), 1);
    const salva = await lerConta();
    assert.match(salva.credentials, /^ss:v1\./);
    assert.equal(salva.credentials.includes(credentials.semente), false);
    assert.deepEqual(cipher.decifrar(salva.credentials, conta.id, conta.provider), credentials);
    assert.equal(salva.updatedAt.getTime(), conta.updatedAt.getTime());
    assert.deepEqual(cipher.decifrar(salva.lastError, conta.id, 'integration-error'), {
      mensagem: credentials.semente,
    });
    assert.equal((await prisma.plant.findUniqueOrThrow({ where: { id: plant.id } })).externalId, 'DEMO2-001');
    assert.equal(
      (await prisma.plantExternalLink.findUniqueOrThrow({ where: { id: link.id } })).externalId,
      'DEMO2-001',
    );
    assert.equal(
      (await prisma.plantDiscovery.findUniqueOrThrow({ where: { id: discovery.id } })).snapshot.externalId,
      'DEMO2-001',
    );
    assert.equal(
      (await prisma.plantAuditEvent.findUniqueOrThrow({ where: { id: audit.id } })).details.externalId,
      'DEMO2-001',
    );
    assert.deepEqual(await prisma.measurement.findUniqueOrThrow({ where: { id: reading.id } }), reading);
    assert.deepEqual(
      cipher.decifrar(
        (await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })).message,
        alert.id,
        'sync-alert',
      ),
      { mensagem: credentials.semente },
    );
    assert.equal(await migrarCredenciais(prisma, cipher, true), 0);
    assert.equal((await lerConta()).credentials, salva.credentials);
    await assert.rejects(
      migrarCredenciais(prisma, new CredentialEncryption(Buffer.alloc(32, 31).toString('base64')), true),
      /transação foi revertida/,
    );
    await assert.rejects(
      prisma.plantExternalLink.update({
        where: { id: link.id },
        data: { externalId: 'rejeitar' },
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
});

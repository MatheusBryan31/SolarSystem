import { Prisma, PrismaClient } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { CredentialEncryption } from '../src/integrations/credential-encryption';

const legadas = z.record(z.string(), z.string());
const falhaColeta = 'Falha na coleta da plataforma';
const ensaio = Symbol('ensaio');

async function rekeyDemo(tx: Prisma.TransactionClient) {
  // Mantém os UUIDs, os vínculos e o histórico. Somente o rótulo legado continha a semente.
  await tx.$executeRaw`ALTER TABLE "plant_external_links" DISABLE TRIGGER "plant_link_identity_immutable_guard"`;
  await tx.$executeRaw`
    UPDATE "plants" p SET "external_id" = 'DEMO2-' || right(p."external_id", 3)
    FROM "integrations" i
    WHERE p."integration_id" = i."id" AND i."provider" = 'DEMO' AND p."external_id" ~ '^DEMO-.*-[0-9]{3}$'`;
  await tx.$executeRaw`
    UPDATE "plant_external_links" l SET "external_id" = 'DEMO2-' || right(l."external_id", 3)
    FROM "integrations" i
    WHERE l."integration_id" = i."id" AND i."provider" = 'DEMO' AND l."external_id" ~ '^DEMO-.*-[0-9]{3}$'`;
  await tx.$executeRaw`
    UPDATE "plant_discoveries" d SET
      "external_id" = 'DEMO2-' || right(d."external_id", 3),
      "snapshot" = jsonb_set(d."snapshot", '{externalId}', to_jsonb('DEMO2-' || right(d."external_id", 3)), false)
    FROM "integrations" i
    WHERE d."integration_id" = i."id" AND i."provider" = 'DEMO' AND d."external_id" ~ '^DEMO-.*-[0-9]{3}$'`;
  await tx.$executeRaw`
    UPDATE "inverters" v SET "external_id" = 'DEMO2-' || right(v."external_id", 3)
    FROM "integrations" i
    WHERE v."integration_id" = i."id" AND i."provider" = 'DEMO' AND v."external_id" ~ '^DEMO-.*-[0-9]{3}$'`;
  await tx.$executeRaw`
    UPDATE "plant_audit_events" a SET "details" = jsonb_set(
      a."details", '{externalId}', to_jsonb('DEMO2-' || right(a."details"->>'externalId', 3)), false)
    FROM "integrations" i
    WHERE a."details"->>'integrationId' = i."id" AND i."provider" = 'DEMO'
      AND a."details"->>'externalId' ~ '^DEMO-.*-[0-9]{3}$'`;
  // Executa as verificações diferidas antes de reabilitar o trigger de imutabilidade.
  await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
  await tx.$executeRaw`ALTER TABLE "plant_external_links" ENABLE TRIGGER "plant_link_identity_immutable_guard"`;
}

export async function migrarCredenciais(
  prisma: PrismaClient,
  criptografia: CredentialEncryption,
  aplicar: boolean,
) {
  let convertidas = 0;
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
        await tx.$executeRaw`LOCK TABLE "integrations", "plants", "plant_external_links", "plant_discoveries",
        "inverters", "plant_audit_events", "alerts" IN ACCESS EXCLUSIVE MODE`;
        const contas = await tx.integration.findMany({
          select: { id: true, provider: true, credentials: true, lastError: true },
        });
        for (const conta of contas) {
          if (typeof conta.credentials === 'string') {
            criptografia.decifrar(conta.credentials, conta.id, conta.provider);
          } else {
            const original = legadas.parse(conta.credentials);
            if (!isDeepStrictEqual(original, conta.credentials))
              throw new Error('Formato legado incompatível');
            const cifrado = criptografia.cifrar(original, conta.id, conta.provider);
            await tx.$executeRaw`UPDATE "integrations" SET "credentials" = ${JSON.stringify(cifrado)}::jsonb
            WHERE "id" = ${conta.id}`;
            const salvo = await tx.integration.findUniqueOrThrow({
              where: { id: conta.id },
              select: { credentials: true },
            });
            if (
              !isDeepStrictEqual(criptografia.decifrar(salvo.credentials, conta.id, conta.provider), original)
            )
              throw new Error('Verificação da conversão falhou');
            convertidas++;
          }
          if (conta.lastError && conta.lastError !== falhaColeta) {
            if (conta.lastError.startsWith('ss:v1.')) {
              criptografia.decifrar(conta.lastError, conta.id, 'integration-error');
            } else {
              const erro = criptografia.cifrar({ mensagem: conta.lastError }, conta.id, 'integration-error');
              await tx.$executeRaw`UPDATE "integrations" SET "last_error" = ${erro} WHERE "id" = ${conta.id}`;
            }
          }
        }
        const alertas = await tx.alert.findMany({
          where: { type: 'SYNC_FAILED', message: { not: falhaColeta } },
          select: { id: true, message: true },
        });
        for (const alerta of alertas) {
          if (alerta.message.startsWith('ss:v1.')) {
            criptografia.decifrar(alerta.message, alerta.id, 'sync-alert');
          } else {
            const mensagem = criptografia.cifrar({ mensagem: alerta.message }, alerta.id, 'sync-alert');
            await tx.$executeRaw`UPDATE "alerts" SET "message" = ${mensagem} WHERE "id" = ${alerta.id}`;
          }
        }
        await rekeyDemo(tx);
        if (!aplicar) throw ensaio;
      },
      { timeout: 120_000 },
    );
  } catch (erro) {
    if (erro !== ensaio) throw new Error('Falha na conversão. A transação foi revertida.');
  }
  return convertidas;
}

async function main() {
  const modo = process.argv[2];
  if ((modo !== '--check' && modo !== '--apply') || process.argv.length !== 3 || !process.env.DATABASE_URL) {
    console.error('Informe DATABASE_URL e exatamente um modo: --check ou --apply.');
    process.exitCode = 1;
    return;
  }
  const criptografia = new CredentialEncryption(process.env.INTEGRATION_CREDENTIALS_KEY);
  const prisma = new PrismaClient({ log: [] });
  try {
    const convertidas = await migrarCredenciais(prisma, criptografia, modo === '--apply');
    console.log(
      `${modo === '--apply' ? 'Conversão aplicada' : 'Ensaio revertido'}: ${convertidas} integração(ões).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch(() => {
    console.error('Conversão não concluída. Confira a configuração e execute o ensaio em uma cópia isolada.');
    process.exitCode = 1;
  });
}

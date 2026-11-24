BEGIN;

-- Execute o utilitário de conversão antes desta migration em bancos com registros.
ALTER TABLE "integrations"
  ALTER COLUMN "credentials" DROP DEFAULT,
  ADD CONSTRAINT "integrations_credentials_encrypted_check" CHECK (
    jsonb_typeof("credentials") = 'string'
    AND ("credentials" #>> '{}') ~ '^ss:v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$'
  );

COMMIT;

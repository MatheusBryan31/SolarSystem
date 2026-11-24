-- Expansão aditiva: nenhuma usina, vínculo ou alerta existente é reescrito.
BEGIN;
CREATE TYPE "InverterOrigin" AS ENUM ('MANUAL', 'IMPORTED');
CREATE TYPE "InverterStatus" AS ENUM ('UNKNOWN', 'ONLINE', 'OFFLINE', 'FAULT', 'MAINTENANCE');
CREATE TABLE "inverters" (
  "id" TEXT NOT NULL,
  "plant_id" TEXT NOT NULL,
  "manufacturer" TEXT NOT NULL,
  "manufacturer_key" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "serial_number" TEXT NOT NULL,
  "serial_key" TEXT NOT NULL,
  "status" "InverterStatus" NOT NULL DEFAULT 'UNKNOWN',
  "origin" "InverterOrigin" NOT NULL DEFAULT 'MANUAL',
  "integration_id" TEXT,
  "external_id" TEXT,
  "last_communication_at" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 0,
  "archived_at" TIMESTAMP(3),
  "archive_reason" TEXT,
  "archived_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inverters_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inverters_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inverters_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inverters_origin_identity_check" CHECK (
    ("origin" = 'MANUAL' AND "integration_id" IS NULL AND "external_id" IS NULL)
    OR ("origin" = 'IMPORTED' AND "integration_id" IS NOT NULL AND "external_id" IS NOT NULL AND length("external_id") BETWEEN 1 AND 300)
  ),
  CONSTRAINT "inverters_revision_check" CHECK ("revision" >= 0),
  CONSTRAINT "inverters_archive_check" CHECK (
    ("archived_at" IS NULL AND "archive_reason" IS NULL AND "archived_by_id" IS NULL)
    OR ("archived_at" IS NOT NULL AND length(btrim("archive_reason")) BETWEEN 3 AND 500 AND "archive_reason" IS NOT NULL AND "archived_by_id" IS NOT NULL)
  ),
  CONSTRAINT "inverters_identity_keys_check" CHECK (
    "manufacturer" ~ '^[ -~]+$' AND length("manufacturer") BETWEEN 1 AND 160
    AND "serial_number" ~ '^[ -~]+$' AND length("serial_number") BETWEEN 1 AND 160
    AND length(btrim("manufacturer")) > 0 AND length(btrim("serial_number")) > 0
    AND "manufacturer_key" = translate(btrim("manufacturer"), 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    AND "serial_key" = translate(btrim("serial_number"), 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    AND length(btrim("model")) BETWEEN 1 AND 160
  )
);
-- Reservas sobrevivem ao arquivamento e abrangem contas externas diferentes.
CREATE UNIQUE INDEX "inverters_manufacturer_key_serial_key_key" ON "inverters"("manufacturer_key", "serial_key");
CREATE UNIQUE INDEX "inverters_integration_id_external_id_key" ON "inverters"("integration_id", "external_id");
CREATE INDEX "inverters_plant_id_archived_at_idx" ON "inverters"("plant_id", "archived_at");
COMMIT;

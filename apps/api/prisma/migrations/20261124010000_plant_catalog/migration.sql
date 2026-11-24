-- Migration aditiva. Revisar backup e janela de troca antes de aplicar.
BEGIN;

-- CreateEnum
CREATE TYPE "PlantOrigin" AS ENUM ('MANUAL', 'IMPORTED');

-- CreateEnum
CREATE TYPE "PlantLinkState" AS ENUM ('ACTIVE', 'DETACHED');

-- DropForeignKey
ALTER TABLE "plants" DROP CONSTRAINT "plants_integration_id_fkey";

-- DropForeignKey
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_plant_id_fkey";

-- DropForeignKey
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_integration_id_fkey";

-- AlterTable
ALTER TABLE "integrations" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "plants" ADD COLUMN     "manual_overrides" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "origin" "PlantOrigin" NOT NULL DEFAULT 'IMPORTED',
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "integration_id" DROP NOT NULL,
ALTER COLUMN "external_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "plant_external_links" (
    "id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "state" "PlantLinkState" NOT NULL DEFAULT 'ACTIVE',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detached_at" TIMESTAMP(3),
    "remote_metadata" JSONB NOT NULL,
    "last_sample" JSONB,
    "observed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plant_external_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plant_discoveries" (
    "id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "plant_id" TEXT,

    CONSTRAINT "plant_discoveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plant_audit_events" (
    "id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "operation" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plant_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plant_external_links_plant_id_state_idx" ON "plant_external_links"("plant_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "plant_external_links_integration_id_external_id_key" ON "plant_external_links"("integration_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "plant_discoveries_integration_id_external_id_key" ON "plant_discoveries"("integration_id", "external_id");

-- CreateIndex
CREATE INDEX "plant_audit_events_plant_id_created_at_idx" ON "plant_audit_events"("plant_id", "created_at");

-- AddForeignKey
ALTER TABLE "plants" ADD CONSTRAINT "plants_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_external_links" ADD CONSTRAINT "plant_external_links_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_external_links" ADD CONSTRAINT "plant_external_links_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_discoveries" ADD CONSTRAINT "plant_discoveries_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_discoveries" ADD CONSTRAINT "plant_discoveries_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_audit_events" ADD CONSTRAINT "plant_audit_events_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Garantias não expressáveis no schema Prisma 6.
CREATE UNIQUE INDEX "plant_external_links_one_active_per_plant"
ON "plant_external_links" ("plant_id") WHERE "state" = 'ACTIVE';
ALTER TABLE "plants" ADD CONSTRAINT "plants_external_pair_check"
CHECK (("integration_id" IS NULL) = ("external_id" IS NULL));
ALTER TABLE "plant_external_links" ADD CONSTRAINT "plant_link_identity_check"
CHECK (length("external_id") > 0);
ALTER TABLE "plant_external_links" ADD CONSTRAINT "plant_link_state_check"
CHECK (("state" = 'ACTIVE' AND "detached_at" IS NULL) OR
       ("state" = 'DETACHED' AND "detached_at" IS NOT NULL));

-- Preserva UUIDs, cliente, datas, alertas e métricas. Não chama nenhuma plataforma.
-- Conservador: valores existentes ficam protegidos até revisão explícita dos overrides.
INSERT INTO "plant_external_links"
  ("id", "plant_id", "integration_id", "external_id", "linked_at", "observed_at", "remote_metadata", "last_sample")
SELECT "id", "id", "integration_id", "external_id", "created_at", "updated_at",
  jsonb_build_object('name', "name", 'city', "city", 'state', "state", 'capacityKwp', "capacity_kwp"),
  CASE WHEN "last_data_at" IS NULL THEN NULL ELSE
    jsonb_build_object('status', "status", 'currentPowerKw', "current_power_kw",
      'todayEnergyKwh', "today_energy_kwh", 'totalEnergyKwh', "total_energy_kwh",
      'lastDataAt', to_char("last_data_at", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) END
FROM "plants";

UPDATE "plants" SET "manual_overrides" =
  jsonb_build_object('name', "name", 'city', "city", 'state', "state", 'capacityKwp', "capacity_kwp");

INSERT INTO "plant_audit_events" ("id", "plant_id", "operation", "details")
SELECT "id", "id", 'MIGRATION_BASELINE', jsonb_build_object('origin', 'IMPORTED', 'preserved', true)
FROM "plants";

COMMIT;

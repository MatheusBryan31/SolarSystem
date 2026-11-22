-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('DEMO');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('ONLINE', 'WARNING', 'FAULT', 'OFFLINE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "provider" "ProviderType" NOT NULL,
    "name" TEXT NOT NULL,
    "credentials" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plants" (
    "id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client_id" TEXT,
    "capacity_kwp" DOUBLE PRECISION,
    "city" TEXT,
    "state" TEXT,
    "status" "HealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "current_power_kw" DOUBLE PRECISION,
    "today_energy_kwh" DOUBLE PRECISION,
    "total_energy_kwh" DOUBLE PRECISION,
    "last_data_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plants_client_id_idx" ON "plants"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "plants_integration_id_external_id_key" ON "plants"("integration_id", "external_id");

-- AddForeignKey
ALTER TABLE "plants" ADD CONSTRAINT "plants_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plants" ADD CONSTRAINT "plants_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

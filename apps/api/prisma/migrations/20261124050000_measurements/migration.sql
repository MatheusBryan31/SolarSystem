BEGIN;
CREATE TYPE "MeasurementQuality" AS ENUM ('VALID', 'PARTIAL', 'INVALID');
CREATE UNIQUE INDEX "inverters_id_plant_id_key" ON "inverters"("id", "plant_id");
CREATE UNIQUE INDEX "plant_external_links_id_plant_id_key" ON "plant_external_links"("id", "plant_id");
CREATE TABLE "measurements" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "plant_id" TEXT NOT NULL,
  "inverter_id" TEXT,
  "source_link_id" TEXT NOT NULL,
  "source_provider" "ProviderType" NOT NULL,
  "is_simulated" BOOLEAN NOT NULL DEFAULT false,
  "measured_at" TIMESTAMPTZ(3) NOT NULL,
  "power_kw" DOUBLE PRECISION,
  "total_energy_kwh" DOUBLE PRECISION,
  "period_energy_kwh" DOUBLE PRECISION,
  "period_start_at" TIMESTAMPTZ(3),
  "operational_status" "HealthStatus",
  "quality" "MeasurementQuality" NOT NULL,
  "quality_reason" TEXT,
  "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "measurements_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "measurements_inverter_id_plant_id_fkey" FOREIGN KEY ("inverter_id", "plant_id") REFERENCES "inverters"("id", "plant_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "measurements_source_link_id_plant_id_fkey" FOREIGN KEY ("source_link_id", "plant_id") REFERENCES "plant_external_links"("id", "plant_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "measurements_power_check" CHECK ("power_kw" >= 0 AND "power_kw" < 'Infinity'::float8),
  CONSTRAINT "measurements_total_check" CHECK ("total_energy_kwh" >= 0 AND "total_energy_kwh" < 'Infinity'::float8),
  CONSTRAINT "measurements_period_check" CHECK (
    ("period_energy_kwh" IS NULL AND "period_start_at" IS NULL) OR
    ("period_energy_kwh" IS NOT NULL AND "period_start_at" IS NOT NULL AND "period_energy_kwh" >= 0 AND "period_energy_kwh" < 'Infinity'::float8 AND "period_start_at" < "measured_at")
  ),
  CONSTRAINT "measurements_simulation_check" CHECK ("is_simulated" = ("source_provider" = 'DEMO')),
  CONSTRAINT "measurements_quality_check" CHECK (
    ("quality" = 'VALID' AND ("power_kw" IS NOT NULL OR "total_energy_kwh" IS NOT NULL OR "period_energy_kwh" IS NOT NULL)) OR
    ("quality" IN ('PARTIAL', 'INVALID') AND "quality_reason" IS NOT NULL AND length(btrim("quality_reason")) BETWEEN 1 AND 500)
  )
);
CREATE UNIQUE INDEX "measurements_source_link_id_inverter_id_measured_at_key" ON "measurements"("source_link_id", "inverter_id", "measured_at");
CREATE UNIQUE INDEX "measurements_plant_source_time_key" ON "measurements"("source_link_id", "measured_at") WHERE "inverter_id" IS NULL;
CREATE INDEX "measurements_plant_id_measured_at_id_idx" ON "measurements"("plant_id", "measured_at", "id");
CREATE INDEX "measurements_inverter_id_measured_at_idx" ON "measurements"("inverter_id", "measured_at");
-- Correções não substituem silenciosamente a amostra aceita. Não há endpoint de escrita.
CREATE FUNCTION "measurement_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Medições aceitas são imutáveis; correções exigem conciliação específica' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER "measurement_immutable_guard" BEFORE UPDATE ON "measurements" FOR EACH ROW EXECUTE FUNCTION "measurement_immutable"();
COMMIT;

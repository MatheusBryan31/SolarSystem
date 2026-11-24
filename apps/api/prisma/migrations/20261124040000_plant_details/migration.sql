-- Expansão sem backfill: NULL significa informação ainda não cadastrada.
BEGIN;
CREATE TYPE "InstallationType" AS ENUM ('GROUND', 'ROOFTOP', 'HYBRID', 'CARPORT', 'FLOATING', 'OTHER');
ALTER TABLE "plants"
  ADD COLUMN "installation_type" "InstallationType",
  ADD COLUMN "nominal_power_kw" DOUBLE PRECISION,
  ADD COLUMN "module_tilt_degrees" DOUBLE PRECISION,
  ADD COLUMN "operation_start_date" DATE,
  ADD COLUMN "postal_code" TEXT,
  ADD COLUMN "street" TEXT,
  ADD COLUMN "address_number" TEXT,
  ADD COLUMN "address_complement" TEXT,
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "technical_notes" TEXT;
ALTER TABLE "plants"
  ADD CONSTRAINT "plants_nominal_power_check" CHECK ("nominal_power_kw" >= 0 AND "nominal_power_kw" < 'Infinity'::float8),
  ADD CONSTRAINT "plants_module_tilt_check" CHECK ("module_tilt_degrees" BETWEEN 0 AND 90),
  ADD CONSTRAINT "plants_postal_code_check" CHECK ("postal_code" ~ '^[0-9]{8}$'),
  ADD CONSTRAINT "plants_coordinates_check" CHECK (
    ("latitude" IS NULL AND "longitude" IS NULL) OR
    ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
  ),
  ADD CONSTRAINT "plants_street_check" CHECK (length(btrim("street")) BETWEEN 1 AND 200),
  ADD CONSTRAINT "plants_address_number_check" CHECK (length(btrim("address_number")) BETWEEN 1 AND 30),
  ADD CONSTRAINT "plants_address_complement_check" CHECK (length(btrim("address_complement")) BETWEEN 1 AND 200),
  ADD CONSTRAINT "plants_technical_notes_check" CHECK (length(btrim("technical_notes")) BETWEEN 1 AND 5000);
-- Campos antigos (incluindo UF livre) não são revalidados nem normalizados.
COMMIT;

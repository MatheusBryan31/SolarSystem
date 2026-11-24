-- Incremental: não reescreve a migration de expansão nem altera dados existentes.
BEGIN;

-- Não escolher silenciosamente qual modelo está correto se houver divergências.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "plants" p
    LEFT JOIN "plant_external_links" l ON l."plant_id" = p."id" AND l."state" = 'ACTIVE'
    WHERE p."integration_id" IS DISTINCT FROM l."integration_id"
       OR p."external_id" IS DISTINCT FROM l."external_id"
  ) THEN
    RAISE EXCEPTION 'Catálogo divergente: revisar Plant e vínculo ativo antes da migration'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION "plant_identity_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."origin" IS DISTINCT FROM OLD."origin" THEN
    RAISE EXCEPTION 'UUID e origem da usina são imutáveis' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "plant_identity_immutable_guard"
BEFORE UPDATE OF "id", "origin" ON "plants"
FOR EACH ROW EXECUTE FUNCTION "plant_identity_immutable"();

CREATE FUNCTION "plant_link_identity_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."plant_id" IS DISTINCT FROM OLD."plant_id"
     OR NEW."integration_id" IS DISTINCT FROM OLD."integration_id"
     OR NEW."external_id" IS DISTINCT FROM OLD."external_id" THEN
    RAISE EXCEPTION 'Identidade externa reservada: transferência exige conciliação específica'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "plant_link_identity_immutable_guard"
BEFORE UPDATE OF "id", "plant_id", "integration_id", "external_id" ON "plant_external_links"
FOR EACH ROW EXECUTE FUNCTION "plant_link_identity_immutable"();

-- A aplicação altera vínculo e projeção dentro da mesma transação. Verificar só
-- no COMMIT permite ambas as ordens de escrita, mas nunca divergência persistida.
CREATE FUNCTION "plant_active_projection_consistent"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_id text;
  projected_integration text;
  projected_external text;
  linked_integration text;
  linked_external text;
BEGIN
  IF TG_TABLE_NAME = 'plants' THEN
    target_id := NEW."id";
  ELSIF TG_OP = 'DELETE' THEN
    target_id := OLD."plant_id";
  ELSE
    target_id := NEW."plant_id";
  END IF;

  SELECT "integration_id", "external_id" INTO projected_integration, projected_external
  FROM "plants" WHERE "id" = target_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT "integration_id", "external_id" INTO linked_integration, linked_external
  FROM "plant_external_links" WHERE "plant_id" = target_id AND "state" = 'ACTIVE';

  IF projected_integration IS DISTINCT FROM linked_integration
     OR projected_external IS DISTINCT FROM linked_external THEN
    RAISE EXCEPTION 'Plant e vínculo ativo devem ter a mesma identidade externa'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "plant_active_projection_guard"
AFTER INSERT OR UPDATE ON "plants"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "plant_active_projection_consistent"();

CREATE CONSTRAINT TRIGGER "plant_link_projection_guard"
AFTER INSERT OR UPDATE OR DELETE ON "plant_external_links"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "plant_active_projection_consistent"();

COMMIT;

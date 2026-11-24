BEGIN;

CREATE TABLE "security_audit_events" (
  "id" BIGSERIAL PRIMARY KEY,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "actor_id" TEXT,
  "request_id" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "security_audit_events_created_at_idx" ON "security_audit_events"("created_at");
CREATE INDEX "security_audit_events_entity_type_entity_id_created_at_idx"
  ON "security_audit_events"("entity_type", "entity_id", "created_at");

CREATE FUNCTION record_security_audit() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE
  entity_id text;
  actor_id text := nullif(current_setting('solarsystem.actor_id', true), '');
  request_id text := nullif(current_setting('solarsystem.request_id', true), '');
  actions text[] := ARRAY[]::text[];
  action text;
BEGIN
  CASE TG_OP
    WHEN 'INSERT' THEN
      entity_id := NEW.id;
      actions := ARRAY['created'];
    WHEN 'DELETE' THEN
      entity_id := OLD.id;
      actions := ARRAY['deleted'];
    ELSE
      entity_id := NEW.id;
      CASE TG_TABLE_NAME
        WHEN 'users' THEN
          IF NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN
            actions := array_append(actions, 'password_changed');
          END IF;
          IF (NEW.role, NEW.active, NEW.client_id) IS DISTINCT FROM (OLD.role, OLD.active, OLD.client_id) THEN
            actions := array_append(actions, 'access_changed');
          END IF;
          IF (NEW.name, NEW.email, NEW.id) IS DISTINCT FROM (OLD.name, OLD.email, OLD.id) THEN
            actions := array_append(actions, 'profile_changed');
          END IF;
        WHEN 'clients' THEN
          IF (NEW.name, NEW.document, NEW.email, NEW.phone, NEW.id) IS DISTINCT FROM
             (OLD.name, OLD.document, OLD.email, OLD.phone, OLD.id) THEN
            actions := ARRAY['profile_changed'];
          END IF;
        WHEN 'integrations' THEN
          IF (NEW.name, NEW.provider, NEW.credentials, NEW.enabled, NEW.archived_at, NEW.id) IS DISTINCT FROM
             (OLD.name, OLD.provider, OLD.credentials, OLD.enabled, OLD.archived_at, OLD.id) THEN
            actions := ARRAY['configuration_changed'];
          END IF;
        WHEN 'inverters' THEN
          IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
            actions := ARRAY[CASE WHEN NEW.archived_at IS NULL THEN 'restored' ELSE 'archived' END];
          ELSIF (NEW.manufacturer, NEW.model, NEW.serial_number, NEW.plant_id, NEW.status) IS DISTINCT FROM
                (OLD.manufacturer, OLD.model, OLD.serial_number, OLD.plant_id, OLD.status) THEN
            actions := ARRAY['changed'];
          END IF;
        WHEN 'alerts' THEN
          IF NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at AND NEW.acknowledged_at IS NOT NULL THEN
            actions := ARRAY['acknowledged'];
          END IF;
      END CASE;
  END CASE;

  FOREACH action IN ARRAY actions LOOP
    INSERT INTO "security_audit_events" ("action", "entity_type", "entity_id", "actor_id", "request_id")
    VALUES (action, TG_TABLE_NAME, entity_id, actor_id, request_id);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "users_security_audit" AFTER INSERT OR UPDATE OR DELETE ON "users"
  FOR EACH ROW EXECUTE FUNCTION record_security_audit();
CREATE TRIGGER "clients_security_audit" AFTER INSERT OR UPDATE OR DELETE ON "clients"
  FOR EACH ROW EXECUTE FUNCTION record_security_audit();
CREATE TRIGGER "integrations_security_audit" AFTER INSERT OR UPDATE OR DELETE ON "integrations"
  FOR EACH ROW EXECUTE FUNCTION record_security_audit();
CREATE TRIGGER "inverters_security_audit" AFTER INSERT OR UPDATE OR DELETE ON "inverters"
  FOR EACH ROW EXECUTE FUNCTION record_security_audit();
CREATE TRIGGER "alerts_security_audit" AFTER UPDATE ON "alerts"
  FOR EACH ROW EXECUTE FUNCTION record_security_audit();

COMMIT;

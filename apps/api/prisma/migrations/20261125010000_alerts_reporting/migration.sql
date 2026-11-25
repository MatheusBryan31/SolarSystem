-- Valor novo precisa estar confirmado antes de ser usado por transações futuras.
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'GENERATION_ABNORMAL';
BEGIN;
-- Não resolve/apaga duplicatas históricas silenciosamente para criar índices.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM alerts WHERE status <> 'RESOLVED' AND plant_id IS NOT NULL GROUP BY plant_id, type HAVING count(*)>1)
     OR EXISTS (SELECT 1 FROM alerts WHERE status <> 'RESOLVED' AND plant_id IS NULL AND integration_id IS NOT NULL GROUP BY integration_id,type HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Alertas ativos duplicados: revisar e conciliar antes desta migration';
  END IF;
END $$;
ALTER TABLE alerts ADD COLUMN is_simulated boolean NOT NULL DEFAULT false, ADD COLUMN resolution_reason text;
CREATE UNIQUE INDEX alerts_active_plant_type_key ON alerts(plant_id,type) WHERE status <> 'RESOLVED' AND plant_id IS NOT NULL;
CREATE UNIQUE INDEX alerts_active_integration_type_key ON alerts(integration_id,type) WHERE status <> 'RESOLVED' AND plant_id IS NULL AND integration_id IS NOT NULL;
CREATE TABLE alert_policies (
  plant_id text PRIMARY KEY REFERENCES plants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  communication_minutes integer NOT NULL DEFAULT 60 CHECK(communication_minutes BETWEEN 5 AND 1440),
  generation_enabled boolean NOT NULL DEFAULT false,
  low_power_ratio double precision NOT NULL DEFAULT 0.05 CHECK(low_power_ratio BETWEEN 0 AND 2),
  high_power_ratio double precision NOT NULL DEFAULT 1.2 CHECK(high_power_ratio BETWEEN 0 AND 3),
  duration_minutes integer NOT NULL DEFAULT 10 CHECK(duration_minutes BETWEEN 1 AND 120),
  minimum_samples integer NOT NULL DEFAULT 3 CHECK(minimum_samples BETWEEN 2 AND 100),
  day_start_hour integer NOT NULL DEFAULT 8 CHECK(day_start_hour BETWEEN 0 AND 23),
  day_end_hour integer NOT NULL DEFAULT 17 CHECK(day_end_hour BETWEEN 1 AND 24),
  time_zone text NOT NULL DEFAULT 'America/Sao_Paulo',
  allow_simulated boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
  CHECK(low_power_ratio<high_power_ratio), CHECK(day_start_hour<day_end_hour)
);
CREATE TABLE alert_events (
  id text PRIMARY KEY,
  alert_id text NOT NULL REFERENCES alerts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  status "AlertStatus" NOT NULL,
  actor_id text,
  reason text,
  is_simulated boolean NOT NULL DEFAULT false,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX alert_events_alert_id_created_at_idx ON alert_events(alert_id,created_at);
-- Linha de base do histórico existente, sem disparar e-mails retroativos.
INSERT INTO alert_events(id,alert_id,status,reason,created_at,is_simulated)
  SELECT md5(a.id||':opened')::uuid::text,a.id,'OPEN','HISTORICAL_BASELINE',a.opened_at AT TIME ZONE 'UTC',
    a.is_simulated OR EXISTS(SELECT 1 FROM integrations i WHERE i.id=a.integration_id AND i.provider='DEMO')
      OR EXISTS(SELECT 1 FROM plant_external_links l JOIN integrations i ON i.id=l.integration_id WHERE l.plant_id=a.plant_id AND i.provider='DEMO') FROM alerts a;
INSERT INTO alert_events(id,alert_id,status,actor_id,reason,created_at,is_simulated)
  SELECT md5(a.id||':ack')::uuid::text,a.id,'ACKNOWLEDGED',a.acknowledged_by_id,'HISTORICAL_BASELINE',a.acknowledged_at AT TIME ZONE 'UTC',b.is_simulated FROM alerts a JOIN alert_events b ON b.alert_id=a.id AND b.status='OPEN' WHERE a.acknowledged_at IS NOT NULL;
INSERT INTO alert_events(id,alert_id,status,reason,created_at,is_simulated)
  SELECT md5(a.id||':resolved')::uuid::text,a.id,'RESOLVED','HISTORICAL_BASELINE',a.resolved_at AT TIME ZONE 'UTC',b.is_simulated FROM alerts a JOIN alert_events b ON b.alert_id=a.id AND b.status='OPEN' WHERE a.resolved_at IS NOT NULL;
-- Somente a coluna nova é preenchida; datas, estado e demais dados antigos permanecem intactos.
UPDATE alerts a SET is_simulated=true WHERE EXISTS(SELECT 1 FROM alert_events e WHERE e.alert_id=a.id AND e.is_simulated);
CREATE TABLE alert_notification_settings (
  id text PRIMARY KEY DEFAULT 'default',
  enabled boolean NOT NULL DEFAULT false,
  recipients text[] NOT NULL DEFAULT '{}',
  statuses "AlertStatus"[] NOT NULL DEFAULT ARRAY['OPEN','RESOLVED']::"AlertStatus"[],
  revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
  CHECK(cardinality(recipients)<=10), CHECK(NOT enabled OR cardinality(recipients)>0), CHECK(cardinality(statuses) BETWEEN 1 AND 3)
);
CREATE TYPE "AlertEmailStatus" AS ENUM ('PENDING','SENDING','SENT','FAILED','UNKNOWN','SKIPPED');
CREATE TABLE alert_emails (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES alert_events(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  recipient text NOT NULL,
  status "AlertEmailStatus" NOT NULL DEFAULT 'PENDING',
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempted_at timestamptz(3), sent_at timestamptz(3), failure_code text
);
CREATE UNIQUE INDEX alert_emails_event_id_recipient_key ON alert_emails(event_id,recipient);
CREATE INDEX alert_emails_status_created_at_idx ON alert_emails(status,created_at);
CREATE FUNCTION alert_transition_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='OPEN' AND NEW.status IN ('ACKNOWLEDGED','RESOLVED')) OR
    (OLD.status='ACKNOWLEDGED' AND NEW.status='RESOLVED')
  ) THEN RAISE EXCEPTION 'Transição de alerta inválida' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER alert_transition_guard BEFORE UPDATE OF status ON alerts FOR EACH ROW EXECUTE FUNCTION alert_transition_guard();
CREATE FUNCTION alert_record_event() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE event_id text := gen_random_uuid()::text; simulated boolean; settings alert_notification_settings%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NEW; END IF;
  simulated := NEW.is_simulated OR EXISTS(SELECT 1 FROM alert_events e WHERE e.alert_id=NEW.id AND e.is_simulated) OR EXISTS(SELECT 1 FROM plants p JOIN integrations i ON i.id=p.integration_id WHERE p.id=NEW.plant_id AND i.provider='DEMO')
    OR EXISTS(SELECT 1 FROM integrations i WHERE i.id=NEW.integration_id AND i.provider='DEMO');
  INSERT INTO alert_events(id,alert_id,status,actor_id,reason,is_simulated)
    VALUES(event_id,NEW.id,NEW.status,nullif(current_setting('solarsystem.actor_id',true),''),CASE WHEN NEW.status='RESOLVED' THEN NEW.resolution_reason END,simulated);
  SELECT * INTO settings FROM alert_notification_settings WHERE id='default';
  IF FOUND AND settings.enabled AND NEW.status=ANY(settings.statuses) AND NOT simulated THEN
    INSERT INTO alert_emails(id,event_id,recipient) SELECT gen_random_uuid()::text,event_id,r FROM unnest(settings.recipients) r ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER alert_record_event AFTER INSERT OR UPDATE OF status ON alerts FOR EACH ROW EXECUTE FUNCTION alert_record_event();
CREATE FUNCTION alert_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Histórico de alertas é imutável' USING ERRCODE='23514';
END $$;
CREATE TRIGGER alert_event_immutable BEFORE UPDATE OR DELETE ON alert_events FOR EACH ROW EXECUTE FUNCTION alert_event_immutable();
COMMIT;

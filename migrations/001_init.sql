-- Schema base para forusbots
-- Idempotente: no rompe si lo corres más de una vez.

BEGIN;

-- 1) Tipos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_state') THEN
    CREATE TYPE job_state AS ENUM ('queued','running','succeeded','failed','canceled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stage_status') THEN
    CREATE TYPE stage_status AS ENUM ('start','succeed','fail');
  END IF;
END$$;

-- 2) Tabla de jobs (una fila por jobId)
CREATE TABLE IF NOT EXISTS jobs (
  job_id              UUID PRIMARY KEY,
  bot_id              TEXT        NOT NULL,
  state               job_state   NOT NULL,
  accepted_at         TIMESTAMPTZ NOT NULL,
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,

  -- datos normalizados que ya manejas en memoria
  meta                JSONB,
  result              JSONB,
  error               JSONB,
  created_by          JSONB,        -- {name, role, at}

  -- estimaciones/capacidad al aceptar
  estimate            JSONB,        -- {method, avgDurationSeconds, startAt, finishAt, ...}
  capacity_snapshot   JSONB,        -- {maxConcurrency, running, queued, slotsAvailable}

  -- métricas de duración
  total_ms            INTEGER,      -- relleno al finalizar (summary) si está disponible

  -- housekeeping
  inserted_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- 3) Tabla de stages (histórico de todos los stage.*)
CREATE TABLE IF NOT EXISTS job_stages (
  id            BIGSERIAL PRIMARY KEY,
  job_id        UUID        NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  bot_id        TEXT        NOT NULL,
  stage_name    TEXT        NOT NULL,
  status        stage_status NOT NULL,  -- start | succeed | fail
  started_at    TIMESTAMPTZ,            -- para 'start' o cuando se conozca
  ended_at      TIMESTAMPTZ,
  duration_ms   INTEGER,
  meta          JSONB,
  error         JSONB,
  inserted_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4) Tabla de eventos crudos (para auditoría/forensics)
CREATE TABLE IF NOT EXISTS job_events (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL,       -- del logger
  level       TEXT        NOT NULL,       -- debug|info|warn|error
  type        TEXT        NOT NULL,       -- job.accepted / stage.succeed / ...
  job_id      UUID,                       -- puede venir nulo si algún log no trae job
  bot_id      TEXT,
  payload     JSONB       NOT NULL,       -- registro completo emitido por logger
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5) Índices útiles
CREATE INDEX IF NOT EXISTS idx_jobs_state         ON jobs(state);
CREATE INDEX IF NOT EXISTS idx_jobs_bot           ON jobs(bot_id);
CREATE INDEX IF NOT EXISTS idx_jobs_accepted_at   ON jobs(accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_finished_at   ON jobs(finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_meta_gin      ON jobs USING GIN (meta);

CREATE INDEX IF NOT EXISTS idx_stages_job         ON job_stages(job_id);
CREATE INDEX IF NOT EXISTS idx_stages_job_stage   ON job_stages(job_id, stage_name);
CREATE INDEX IF NOT EXISTS idx_stages_status      ON job_stages(status);
CREATE INDEX IF NOT EXISTS idx_stages_inserted    ON job_stages(inserted_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_job         ON job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_events_type        ON job_events(type);
CREATE INDEX IF NOT EXISTS idx_events_ts          ON job_events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_payload_gin ON job_events USING GIN (payload);

-- 6) Trigger updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_jobs_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_jobs_set_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

COMMIT;

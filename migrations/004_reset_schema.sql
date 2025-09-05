BEGIN;

-- Borra vistas si existieran
DROP VIEW IF EXISTS public.v_job_last_stage CASCADE;
DROP VIEW IF EXISTS public.v_jobs_summary CASCADE;
DROP VIEW IF EXISTS public.v_job_events CASCADE;
DROP VIEW IF EXISTS public.v_job_stages CASCADE;

-- Borra tablas si existieran
DROP TABLE IF EXISTS public.job_stages CASCADE;
DROP TABLE IF EXISTS public.jobs CASCADE;
DROP TABLE IF EXISTS public.job_events CASCADE; -- opcional: no la usamos

-- Tabla principal de jobs
CREATE TABLE public.jobs (
  job_id UUID PRIMARY KEY,
  bot_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued','running','succeeded','failed','canceled')),
  accepted_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  total_seconds INTEGER,
  created_by_name TEXT,
  created_by_role TEXT,
  created_by_at TIMESTAMPTZ,
  meta JSONB,
  result JSONB,
  error JSONB,
  stages JSONB,
  stages_list JSONB
);

CREATE INDEX jobs_state_idx    ON public.jobs(state);
CREATE INDEX jobs_finished_idx ON public.jobs(finished_at);
CREATE INDEX jobs_bot_idx      ON public.jobs(bot_id);

-- Tabla de etapas
CREATE TABLE public.job_stages (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(job_id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('start','succeed','fail')),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER,
  meta JSONB,
  error JSONB
);

CREATE INDEX job_stages_job_idx   ON public.job_stages(job_id);
CREATE INDEX job_stages_stage_idx ON public.job_stages(stage_name);
CREATE INDEX job_stages_time_idx  ON public.job_stages(started_at);

-- Vistas útiles
CREATE VIEW public.v_jobs_summary AS
SELECT
  j.job_id,
  j.bot_id,
  j.state,
  j.accepted_at,
  j.started_at,
  j.finished_at,
  j.total_seconds,
  (
    SELECT jsonb_object_agg(s.stage_name, jsonb_build_object(
      'status', s.status,
      'started_at', s.started_at,
      'ended_at', s.ended_at,
      'duration_ms', s.duration_ms
    ))
    FROM public.job_stages s
    WHERE s.job_id = j.job_id
  ) AS stages_map
FROM public.jobs j;

CREATE VIEW public.v_job_last_stage AS
SELECT DISTINCT ON (job_id)
  job_id, stage_name, status, started_at, ended_at, duration_ms
FROM public.job_stages
ORDER BY job_id, started_at DESC NULLS LAST;

COMMIT;

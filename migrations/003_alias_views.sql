BEGIN;

CREATE OR REPLACE VIEW public.v_job_events AS
SELECT
  id,
  ts,
  level,
  type,
  job_id,
  bot_id AS bot,        -- alias
  service,
  env,
  meta,
  details,
  error
FROM public.job_events;

CREATE OR REPLACE VIEW public.v_job_stages AS
SELECT
  job_id,
  stage_name AS stage,  -- alias
  status,
  started_at,
  ended_at,
  duration_ms,
  meta,
  error
FROM public.job_stages;

COMMIT;

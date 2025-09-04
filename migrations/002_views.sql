-- Vistas de consulta rápidas

-- Último stage por job (útil para /status o dashboards)
CREATE OR REPLACE VIEW v_job_last_stage AS
SELECT DISTINCT ON (js.job_id)
  js.job_id,
  js.bot_id,
  js.stage_name,
  js.status,
  js.duration_ms,
  js.meta,
  js.error,
  js.inserted_at AS logged_at
FROM job_stages js
ORDER BY js.job_id, js.inserted_at DESC;

-- Resumen ligero de jobs (para listados)
CREATE OR REPLACE VIEW v_jobs_summary AS
SELECT
  j.job_id,
  j.bot_id,
  j.state,
  j.accepted_at,
  j.started_at,
  j.finished_at,
  j.total_ms,
  (SELECT stage_name FROM v_job_last_stage v WHERE v.job_id = j.job_id) AS last_stage,
  (SELECT status     FROM v_job_last_stage v WHERE v.job_id = j.job_id) AS last_stage_status
FROM jobs j
ORDER BY j.accepted_at DESC;

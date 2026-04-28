-- forusbots_analytics.v_durations_recent
-- Últimos 5000 jobs terminados (para histogramas y muestreo).
-- finished_at en `data` se serializa como {_seconds, _nanoseconds} (Firestore Timestamp).
CREATE OR REPLACE VIEW `forusbots_analytics.v_durations_recent` AS
SELECT
  document_id AS job_id,
  JSON_VALUE(data, '$.bot_id') AS bot_id,
  JSON_VALUE(data, '$.state') AS state,
  SAFE_CAST(JSON_VALUE(data, '$.run_ms') AS FLOAT64) AS run_ms,
  TIMESTAMP_SECONDS(SAFE_CAST(JSON_VALUE(data, '$.finished_at._seconds') AS INT64)) AS finished_at
FROM `forusbots_analytics.jobs_raw_latest`
WHERE operation != 'DELETE'
  AND data IS NOT NULL
  AND JSON_VALUE(data, '$.finished_at._seconds') IS NOT NULL
ORDER BY finished_at DESC
LIMIT 5000;

-- forusbots_analytics.v_errors_recent
-- Últimos jobs con state='failed' incluyendo error.code y error.message.
-- finished_at en `data` se serializa como {_seconds, _nanoseconds} (Firestore Timestamp).
CREATE OR REPLACE VIEW `forusbots_analytics.v_errors_recent` AS
SELECT
  document_id AS job_id,
  JSON_VALUE(data, '$.bot_id') AS bot_id,
  JSON_VALUE(data, '$.error.code') AS error_code,
  JSON_VALUE(data, '$.error.message') AS error_message,
  SAFE_CAST(JSON_VALUE(data, '$.run_ms') AS FLOAT64) AS run_ms,
  TIMESTAMP_SECONDS(SAFE_CAST(JSON_VALUE(data, '$.finished_at._seconds') AS INT64)) AS finished_at
FROM `forusbots_analytics.jobs_raw_latest`
WHERE operation != 'DELETE'
  AND data IS NOT NULL
  AND JSON_VALUE(data, '$.state') = 'failed'
  AND JSON_VALUE(data, '$.finished_at._seconds') IS NOT NULL
ORDER BY finished_at DESC
LIMIT 1000;

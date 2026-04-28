-- forusbots_analytics.v_status_recent
-- Conteos succeeded/failed en ventanas 1d y 14d.
-- finished_at en `data` se serializa como {_seconds, _nanoseconds} (Firestore Timestamp).
CREATE OR REPLACE VIEW `forusbots_analytics.v_status_recent` AS
WITH parsed AS (
  SELECT
    JSON_VALUE(data, '$.state') AS state,
    TIMESTAMP_SECONDS(SAFE_CAST(JSON_VALUE(data, '$.finished_at._seconds') AS INT64)) AS finished_at
  FROM `forusbots_analytics.jobs_raw_latest`
  WHERE operation != 'DELETE'
    AND data IS NOT NULL
)
SELECT
  COUNTIF(state = 'succeeded' AND finished_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)) AS succeeded_14d,
  COUNTIF(state = 'failed'    AND finished_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)) AS failed_14d,
  COUNTIF(state = 'succeeded' AND finished_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY))  AS succeeded_1d,
  COUNTIF(state = 'failed'    AND finished_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY))  AS failed_1d
FROM parsed;

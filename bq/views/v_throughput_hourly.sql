-- forusbots_analytics.v_throughput_hourly
-- # de jobs terminados por hora.
-- finished_at en `data` se serializa como {_seconds, _nanoseconds} (Firestore Timestamp).
CREATE OR REPLACE VIEW `forusbots_analytics.v_throughput_hourly` AS
SELECT
  TIMESTAMP_TRUNC(
    TIMESTAMP_SECONDS(SAFE_CAST(JSON_VALUE(data, '$.finished_at._seconds') AS INT64)),
    HOUR
  ) AS bucket,
  COUNT(*) AS count
FROM `forusbots_analytics.jobs_raw_latest`
WHERE operation != 'DELETE'
  AND data IS NOT NULL
  AND JSON_VALUE(data, '$.finished_at._seconds') IS NOT NULL
GROUP BY bucket
HAVING bucket IS NOT NULL
ORDER BY bucket DESC;

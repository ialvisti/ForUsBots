-- forusbots_analytics.v_jobs_by_bot
-- Ranking de bots por # jobs y promedio de run_ms.
CREATE OR REPLACE VIEW `forusbots_analytics.v_jobs_by_bot` AS
SELECT
  JSON_VALUE(data, '$.bot_id') AS bot_id,
  COUNT(*) AS total,
  COUNTIF(JSON_VALUE(data, '$.state') = 'succeeded') AS succeeded,
  COUNTIF(JSON_VALUE(data, '$.state') = 'failed') AS failed,
  COUNTIF(JSON_VALUE(data, '$.state') = 'queued') AS queued,
  COUNTIF(JSON_VALUE(data, '$.state') = 'running') AS running,
  AVG(SAFE_CAST(JSON_VALUE(data, '$.run_ms') AS FLOAT64)) AS avg_run_ms
FROM `forusbots_analytics.jobs_raw_latest`
WHERE operation != 'DELETE'
  AND data IS NOT NULL
GROUP BY bot_id
ORDER BY total DESC;

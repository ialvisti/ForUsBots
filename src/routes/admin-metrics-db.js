// src/routes/admin-metrics-db.js
const express = require("express");
const { runQuery, DATASET } = require("../db/bigquery");
const { getSettings } = require("../engine/settings");
const { resolveRole } = require("../middleware/auth");
const logger = require("../engine/logger");

const router = express.Router();

const ENABLED = String(process.env.AUDIT_DB || "").trim() === "1";

function getToken(req) {
  const hdr = req.header("x-auth-token");
  if (hdr) return hdr;
  const raw = req.headers.cookie || "";
  const parts = raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    const i = p.indexOf("=");
    if (i > 0) {
      const k = p.slice(0, i);
      if (k === "forusbot_token") return decodeURIComponent(p.slice(i + 1));
    }
  }
  return null;
}

function adminGate(req, res, next) {
  const token = getToken(req);
  const role = resolveRole(token);
  if (!role) return res.status(401).json({ ok: false, error: "unauthorized" });
  if (role !== "admin") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  return next();
}

function bucketToMs(bucket) {
  if (bucket == null) return null;
  if (bucket && typeof bucket === "object" && "value" in bucket) {
    const ms = Date.parse(bucket.value);
    return Number.isFinite(ms) ? ms : null;
  }
  if (bucket instanceof Date) return bucket.getTime();
  if (typeof bucket === "string") {
    const ms = Date.parse(bucket);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/**
 * GET /forusbot/admin/metrics-db
 *  - top: máx de bots (default 30)
 *  - days: ventana para status (default 14)
 *  - limit: muestras de durations (default 400)
 *  - agg: 'hour' | 'day' | 'month'
 *
 * Las agregaciones se hacen sobre vistas en BigQuery (forusbots_analytics.v_*).
 */
router.get("/metrics-db", adminGate, async (req, res) => {
  const top = Math.max(1, Math.min(200, parseInt(req.query.top ?? "30", 10)));
  const days = Math.max(1, Math.min(365, parseInt(req.query.days ?? "14", 10)));
  const limitDur = Math.max(
    1,
    Math.min(5000, parseInt(req.query.limit ?? "400", 10))
  );
  const agg = String(req.query.agg || "hour").toLowerCase();
  const viewMap = {
    hour: "v_throughput_hourly",
    day: "v_throughput_daily",
    month: "v_throughput_monthly",
  };
  const tpView = viewMap[agg] || "v_throughput_hourly";

  if (!ENABLED) {
    return res.status(200).json({
      ok: true,
      source: "bq",
      generatedAt: new Date().toISOString(),
      note: "AUDIT_DB deshabilitado; devolviendo vacío.",
      totals: {
        running: 0,
        queued: 0,
        finished: 0,
        maxConcurrency: getSettings().maxConcurrency ?? 3,
        jobsTotal: 0,
        timeSpentSeconds: 0,
        topJob: null,
      },
      byBot: {},
      durations: [],
      throughput: [],
      status: { succeeded: 0, failed: 0 },
    });
  }

  try {
    const [byBotRows, throughputRows, statusRows, durationRows] =
      await Promise.all([
        runQuery(
          `SELECT bot_id, total, succeeded, failed, queued, running, avg_run_ms
             FROM \`${DATASET}.v_jobs_by_bot\`
            LIMIT @top`,
          { top }
        ),
        runQuery(
          `SELECT bucket, count
             FROM \`${DATASET}.${tpView}\`
            ORDER BY bucket DESC
            LIMIT 200`
        ),
        runQuery(`SELECT * FROM \`${DATASET}.v_status_recent\``),
        runQuery(
          `SELECT run_ms, state, finished_at
             FROM \`${DATASET}.v_durations_recent\`
            LIMIT @lim`,
          { lim: limitDur }
        ),
      ]);

    // ---- byBot + totales ----
    const byBot = {};
    let running = 0;
    let queued = 0;
    let finished = 0;
    let jobsTotal = 0;
    let timeSpentMs = 0;
    let topJob = null;

    for (const r of byBotRows) {
      const total = Number(r.total) || 0;
      const succeeded = Number(r.succeeded) || 0;
      const failed = Number(r.failed) || 0;
      const queuedN = Number(r.queued) || 0;
      const runningN = Number(r.running) || 0;
      const avgMs = r.avg_run_ms != null ? Number(r.avg_run_ms) : null;

      byBot[r.bot_id || "unknown"] = {
        total,
        succeeded,
        failed,
        queued: queuedN,
        running: runningN,
        avgDurationSeconds:
          avgMs != null && Number.isFinite(avgMs)
            ? Math.max(0, Math.round(avgMs / 1000))
            : null,
      };

      jobsTotal += total;
      running += runningN;
      queued += queuedN;
      finished += succeeded + failed;
      if (avgMs != null && Number.isFinite(avgMs)) {
        timeSpentMs += avgMs * (succeeded + failed);
      }
      if (!topJob || total > topJob.count) {
        topJob = { botId: r.bot_id || "unknown", count: total };
      }
    }

    // ---- Durations (segundos) ----
    const durations = durationRows
      .map((r) => (r.run_ms != null ? Number(r.run_ms) / 1000 : null))
      .filter((v) => Number.isFinite(v) && v >= 0);

    // ---- Throughput ordenado ascendente para charts ----
    const throughput = throughputRows
      .map((r) => ({
        tsHour: bucketToMs(r.bucket),
        count: Number(r.count) || 0,
      }))
      .filter((p) => p.tsHour != null)
      .sort((a, b) => a.tsHour - b.tsHour);

    // ---- Status (succ/failed en N días) ----
    let status = { succeeded: 0, failed: 0 };
    const sRow = statusRows[0] || {};
    if (days <= 1) {
      status = {
        succeeded: Number(sRow.succeeded_1d) || 0,
        failed: Number(sRow.failed_1d) || 0,
      };
    } else {
      status = {
        succeeded: Number(sRow.succeeded_14d) || 0,
        failed: Number(sRow.failed_14d) || 0,
      };
    }

    const settings = getSettings();
    return res.json({
      ok: true,
      source: "bq",
      generatedAt: new Date().toISOString(),
      totals: {
        running,
        queued,
        finished,
        maxConcurrency: settings?.maxConcurrency ?? 3,
        jobsTotal,
        timeSpentSeconds: Math.round(timeSpentMs / 1000),
        topJob,
      },
      byBot,
      durations,
      throughput,
      status,
    });
  } catch (e) {
    logger.error({
      type: "route.admin_metrics_db.admin_metrics_db_error",
      error: e,
    });
    return res.status(500).json({ ok: false, error: "bq_error" });
  }
});

module.exports = router;

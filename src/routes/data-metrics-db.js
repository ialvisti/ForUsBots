// src/routes/data-metrics-db.js
const express = require("express");
const { Pool } = require("pg");
const { getSettings } = require("../engine/settings");
const { resolveRole } = require("../middleware/auth");

const router = express.Router();

const ENABLED = String(process.env.AUDIT_DB || "").trim() === "1";
const DBURL = process.env.DATABASE_URL || "";

let pool = null;
function getPool() {
  if (!ENABLED || !DBURL) return null;
  if (pool) return pool;
  pool = new Pool({ connectionString: DBURL, max: 5 });
  return pool;
}

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

// Gate de datos: cualquier rol reconocido
function dataGate(req, res, next) {
  const token = getToken(req);
  const role = resolveRole(token);
  if (!role) return res.status(401).json({ ok: false, error: "unauthorized" });
  return next();
}

/**
 * GET /forusbot/data/metrics-db
 * Igual a admin/metrics-db, pero sin requerir rol admin.
 * Query: top, hours, days, limit, agg(hour|day|month), date, month, year
 */
router.get("/metrics-db", dataGate, async (req, res) => {
  const top = Math.max(1, Math.min(200, parseInt(req.query.top ?? "30", 10)));
  const hours = Math.max(
    1,
    Math.min(720, parseInt(req.query.hours ?? "48", 10))
  );
  const days = Math.max(1, Math.min(365, parseInt(req.query.days ?? "14", 10)));
  const limitDur = Math.max(
    1,
    Math.min(5000, parseInt(req.query.limit ?? "400", 10))
  );

  const agg = String(req.query.agg || "").toLowerCase();
  const dateStr = (req.query.date || "").trim();
  const monthStr = (req.query.month || "").trim();
  const yearStr = (req.query.year || "").trim();

  if (!ENABLED || !DBURL) {
    return res.status(200).json({
      ok: true,
      source: "db",
      generatedAt: new Date().toISOString(),
      note: "AUDIT_DB deshabilitado o sin DATABASE_URL; devolviendo vacío.",
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

  const p = getPool();
  try {
    const client = await p.connect();
    try {
      // Totales por estado
      const qTotals = await client.query(`
        SELECT state, COUNT(*)::int AS c
          FROM jobs
         GROUP BY state
      `);
      let running = 0,
        queued = 0,
        finished = 0;
      for (const r of qTotals.rows) {
        if (r.state === "running") running = r.c;
        else if (r.state === "queued") queued = r.c;
        else if (
          r.state === "succeeded" ||
          r.state === "failed" ||
          r.state === "canceled"
        ) {
          finished += r.c;
        }
      }

      // Ranking por bot
      const qByBot = await client.query(
        `
        SELECT
          bot_id,
          COUNT(*)::int AS total,
          SUM(CASE WHEN state='succeeded' THEN 1 ELSE 0 END)::int AS succeeded,
          SUM(CASE WHEN state='failed'    THEN 1 ELSE 0 END)::int AS failed,
          SUM(CASE WHEN state='queued'    THEN 1 ELSE 0 END)::int AS queued,
          SUM(CASE WHEN state='running'   THEN 1 ELSE 0 END)::int AS running,
          AVG(
            CASE
              WHEN run_ms IS NOT NULL THEN run_ms
              WHEN total_seconds IS NOT NULL THEN total_seconds * 1000
              ELSE NULL
            END
          )::float AS avg_run_ms
        FROM jobs
        GROUP BY bot_id
        ORDER BY total DESC
        LIMIT $1
      `,
        [top]
      );

      const byBot = {};
      for (const r of qByBot.rows) {
        byBot[r.bot_id] = {
          total: r.total,
          succeeded: r.succeeded,
          failed: r.failed,
          queued: r.queued,
          running: r.running,
          avgDurationSeconds:
            r.avg_run_ms != null
              ? Math.max(0, Math.round(r.avg_run_ms / 1000))
              : null,
        };
      }

      // Durations (últimos N finalizados)
      const qDurations = await client.query(
        `
        SELECT COALESCE(run_ms, total_seconds * 1000) AS ms
          FROM jobs
         WHERE finished_at IS NOT NULL
         ORDER BY finished_at DESC
         LIMIT $1
        `,
        [limitDur]
      );
      const durations = qDurations.rows
        .map((r) => (r.ms != null ? Number(r.ms) / 1000 : null))
        .filter((v) => Number.isFinite(v) && v >= 0);

      // Métricas agregadas
      const qJobsTotal = await client.query(
        `SELECT COUNT(*)::int AS c FROM jobs`
      );
      const jobsTotal = Number(qJobsTotal.rows[0]?.c || 0);

      const qTimeSpent = await client.query(`
        SELECT COALESCE(SUM(
          CASE
            WHEN run_ms IS NOT NULL THEN run_ms
            WHEN total_seconds IS NOT NULL THEN total_seconds * 1000
            ELSE 0
          END
        ),0)::bigint AS ms
          FROM jobs
         WHERE finished_at IS NOT NULL
      `);
      const timeSpentSeconds = Math.round(
        Number(qTimeSpent.rows[0]?.ms || 0) / 1000
      );

      const topRow = qByBot.rows[0] || null;
      const topJob = topRow
        ? { botId: topRow.bot_id, count: Number(topRow.total) }
        : null;

      // Throughput
      async function throughputSeries() {
        if (agg === "hour") {
          const q = await client.query(
            `
            WITH bounds AS (
              SELECT COALESCE($1::date, NOW()::date) AS d,
                     date_trunc('hour', NOW()) AS nowh
            ),
            series AS (
              SELECT gs AS bucket
              FROM bounds, generate_series(
                date_trunc('day', d)::timestamptz,
                CASE WHEN d = NOW()::date
                     THEN (SELECT nowh FROM bounds)
                     ELSE date_trunc('day', d) + INTERVAL '23 hour' END,
                INTERVAL '1 hour'
              ) AS gs
            ),
            hits AS (
              SELECT date_trunc('hour', finished_at) AS bucket, COUNT(*)::int AS c
                FROM jobs, bounds
               WHERE finished_at >= date_trunc('day', d)
                 AND finished_at  < date_trunc('day', d) + INTERVAL '1 day'
               GROUP BY 1
            )
            SELECT EXTRACT(EPOCH FROM s.bucket)::bigint*1000 AS ts, COALESCE(h.c,0) AS c
              FROM series s
              LEFT JOIN hits h ON h.bucket = s.bucket
             ORDER BY s.bucket
            `,
            [dateStr || null]
          );
          return q.rows.map((r) => ({
            tsHour: Number(r.ts),
            count: Number(r.c),
          }));
        }

        if (agg === "day") {
          const monthParam = monthStr ? `${monthStr}-01` : null;
          const q = await client.query(
            `
            WITH bounds AS (
              SELECT
                date_trunc('month', COALESCE($1::date, NOW()::date)) AS mstart,
                LEAST(
                  date_trunc('month', COALESCE($1::date, NOW()::date)) + INTERVAL '1 month',
                  date_trunc('day', NOW()) + INTERVAL '1 day'
                ) AS mend_ex
            ),
            series AS (
              SELECT gs AS bucket
              FROM bounds, generate_series(
                (SELECT mstart FROM bounds),
                (SELECT mend_ex FROM bounds) - INTERVAL '1 day',
                INTERVAL '1 day'
              ) AS gs
            ),
            hits AS (
              SELECT date_trunc('day', finished_at) AS bucket, COUNT(*)::int AS c
                FROM jobs, bounds
               WHERE finished_at >= (SELECT mstart FROM bounds)
                 AND finished_at  < (SELECT mend_ex  FROM bounds)
               GROUP BY 1
            )
            SELECT EXTRACT(EPOCH FROM s.bucket)::bigint*1000 AS ts, COALESCE(h.c,0) AS c
              FROM series s
              LEFT JOIN hits h ON h.bucket = s.bucket
             ORDER BY s.bucket
            `,
            [monthParam]
          );
          return q.rows.map((r) => ({
            tsHour: Number(r.ts),
            count: Number(r.c),
          }));
        }

        if (agg === "month") {
          const yearParam = yearStr ? `${yearStr}-01-01` : null;
          const q = await client.query(
            `
            WITH bounds AS (
              SELECT
                date_trunc('year', COALESCE($1::date, NOW()::date)) AS ystart,
                LEAST(
                  date_trunc('year', COALESCE($1::date, NOW()::date)) + INTERVAL '1 year',
                  date_trunc('month', NOW()) + INTERVAL '1 month'
                ) AS yend_ex
            ),
            series AS (
              SELECT gs AS bucket
              FROM bounds, generate_series(
                (SELECT ystart FROM bounds),
                (SELECT yend_ex FROM bounds) - INTERVAL '1 month',
                INTERVAL '1 month'
              ) AS gs
            ),
            hits AS (
              SELECT date_trunc('month', finished_at) AS bucket, COUNT(*)::int AS c
                FROM jobs, bounds
               WHERE finished_at >= (SELECT ystart FROM bounds)
                 AND finished_at  < (SELECT yend_ex FROM bounds)
               GROUP BY 1
            )
            SELECT EXTRACT(EPOCH FROM s.bucket)::bigint*1000 AS ts, COALESCE(h.c,0) AS c
              FROM series s
              LEFT JOIN hits h ON h.bucket = s.bucket
             ORDER BY s.bucket
            `,
            [yearParam]
          );
          return q.rows.map((r) => ({
            tsHour: Number(r.ts),
            count: Number(r.c),
          }));
        }

        // Fallback últimas N horas
        const q = await client.query(
          `
          WITH bounds AS (
            SELECT
              date_trunc('hour', NOW() - ($1 || ' hours')::interval) AS fromh,
              date_trunc('hour', NOW()) AS toh
          ),
          series AS (
            SELECT generate_series(fromh, toh, INTERVAL '1 hour') AS bucket
              FROM bounds
          ),
          hits AS (
            SELECT date_trunc('hour', finished_at) AS bucket, COUNT(*)::int AS c
              FROM jobs, bounds
             WHERE finished_at >= (SELECT fromh FROM bounds)
               AND finished_at  < (SELECT toh   FROM bounds) + INTERVAL '1 hour'
             GROUP BY 1
          )
          SELECT EXTRACT(EPOCH FROM s.bucket)::bigint*1000 AS ts, COALESCE(h.c,0) AS c
            FROM series s
            LEFT JOIN hits h ON h.bucket = s.bucket
           ORDER BY s.bucket
          `,
          [String(hours)]
        );
        return q.rows.map((r) => ({
          tsHour: Number(r.ts),
          count: Number(r.c),
        }));
      }

      const throughput = await throughputSeries();

      // Estado succ/fail últimos N días
      const qStatus = await client.query(`
        SELECT
          SUM(CASE WHEN state='succeeded' THEN 1 ELSE 0 END)::int AS succeeded,
          SUM(CASE WHEN state='failed'    THEN 1 ELSE 0 END)::int AS failed
          FROM jobs
         WHERE finished_at >= NOW() - INTERVAL '${days} days'
      `);
      const status = {
        succeeded: Number(qStatus.rows[0]?.succeeded) || 0,
        failed: Number(qStatus.rows[0]?.failed) || 0,
      };

      const settings = getSettings();
      return res.json({
        ok: true,
        source: "db",
        generatedAt: new Date().toISOString(),
        totals: {
          running,
          queued,
          finished,
          maxConcurrency: settings?.maxConcurrency ?? 3,
          jobsTotal,
          timeSpentSeconds,
          topJob,
        },
        byBot,
        durations,
        throughput,
        status,
      });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[data/metrics-db] error", e && e.stack ? e.stack : e);
    return res.status(500).json({ ok: false, error: "db_error" });
  }
});

module.exports = router;

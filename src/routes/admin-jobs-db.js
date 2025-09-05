// src/routes/admin-jobs-db.js
const express = require("express");
const { Pool } = require("pg");
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

function readCookie(req, key) {
  const raw = req.headers.cookie || "";
  const parts = raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    const i = p.indexOf("=");
    if (i > 0) {
      const k = p.slice(0, i);
      if (k === key) return decodeURIComponent(p.slice(i + 1));
    }
  }
  return null;
}

function getToken(req) {
  return (
    req.header("x-auth-token") || readCookie(req, "forusbot_token") || null
  );
}

function adminGate(req, res, next) {
  const token = getToken(req);
  const role = resolveRole(token);
  if (!role) return res.status(401).json({ ok: false, error: "unauthorized" });
  if (role !== "admin")
    return res.status(403).json({ ok: false, error: "forbidden" });
  return next();
}

// --- util: normaliza cualquier formato raro de created_by_name ---
function normalizeCreatedByName(v) {
  if (v == null) return null;

  // Si ya viene objeto {name,...}
  if (typeof v === "object") {
    return v.name || v.fullname || v.username || null;
  }

  // Si viene como string
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    // Si parece JSON, intentamos parsear y tomar .name
    if (s.startsWith("{") || s.startsWith("[")) {
      try {
        const o = JSON.parse(s);
        if (o && typeof o === "object") {
          return o.name || o.fullname || o.username || s;
        }
        return s;
      } catch {
        return s; // si falla parseo, devolvemos el texto tal cual
      }
    }
    // Texto plano (nombre ya limpio)
    return s;
  }

  // cualquier otro tipo
  return String(v);
}

function camel(r) {
  if (!r) return r;
  return {
    jobId: r.job_id,
    botId: r.bot_id,
    state: r.state,
    acceptedAt: r.accepted_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at,

    // Nuevo: siempre entregamos CREATED BY limpio
    createdByName: normalizeCreatedByName(r.created_by_name),

    // devolvemos segundos: preferimos total_ms/run_ms si están; caemos a total_seconds
    totalSeconds:
      r.total_ms != null
        ? Math.round(Number(r.total_ms) / 1000)
        : r.run_ms != null
        ? Math.round(Number(r.run_ms) / 1000)
        : r.total_seconds != null
        ? Number(r.total_seconds)
        : null,
    queueMs: r.queue_ms != null ? Number(r.queue_ms) : null,
    runMs: r.run_ms != null ? Number(r.run_ms) : null,
    totalMs: r.total_ms != null ? Number(r.total_ms) : null,
    meta: r.meta || {},
    result: r.result || null,
    error: r.error || null,
  };
}

function camelStage(s) {
  return {
    name: s.name,
    status: s.status,
    startedAt: s.started_at,
    endedAt: s.ended_at,
    durationMs: s.duration_ms != null ? Number(s.duration_ms) : null,
    meta: s.meta || null,
    error: s.error || null,
  };
}

/**
 * GET /forusbot/admin/jobs-db
 * Query params:
 *  - state (queued|running|succeeded|failed|canceled)
 *  - botId (substring match, case-insensitive)
 *  - limit (1..500) default 100
 *  - offset (>=0) default 0
 */
router.get("/jobs-db", adminGate, async (req, res) => {
  if (!ENABLED || !DBURL) {
    return res.json({ ok: true, total: 0, limit: 0, offset: 0, jobs: [] });
  }
  const limit = Math.min(
    500,
    Math.max(1, parseInt(req.query.limit ?? "100", 10))
  );
  const offset = Math.max(0, parseInt(req.query.offset ?? "0", 10));
  const state = (req.query.state || "").trim().toLowerCase();
  const botId = (req.query.botId || "").trim();

  const p = getPool();
  const where = [];
  const args = [];
  if (state) {
    args.push(state);
    where.push(`state = $${args.length}`);
  }
  if (botId) {
    args.push(`%${botId}%`);
    where.push(`bot_id ILIKE $${args.length}`);
  }
  const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

  try {
    const client = await p.connect();
    try {
      const countSQL = `SELECT COUNT(*)::int AS c FROM jobs ${whereSQL}`;
      const total = (await client.query(countSQL, args)).rows[0].c;

      const listSQL = `
        SELECT job_id, bot_id, state,
               to_char(accepted_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as accepted_at,
               to_char(started_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as started_at,
               to_char(finished_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as finished_at,
               created_by_name,
               total_seconds, queue_ms, run_ms, total_ms, meta, result, error
          FROM jobs
          ${whereSQL}
         ORDER BY accepted_at DESC NULLS LAST
         LIMIT ${limit} OFFSET ${offset}
      `;
      const rows = (await client.query(listSQL, args)).rows.map(camel);
      return res.json({ ok: true, total, limit, offset, jobs: rows });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[admin/jobs-db] list error", e);
    return res.status(500).json({ ok: false, error: "db_error" });
  }
});

/**
 * GET /forusbot/admin/jobs-db/:id
 * Detalle + stages desde BD
 */
router.get("/jobs-db/:id", adminGate, async (req, res) => {
  if (!ENABLED || !DBURL) {
    return res.status(404).json({ ok: false, error: "not_found" });
  }
  const id = String(req.params.id || "").trim();
  const p = getPool();
  try {
    const client = await p.connect();
    try {
      const jobSQL = `
        SELECT job_id, bot_id, state,
               to_char(accepted_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as accepted_at,
               to_char(started_at,  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as started_at,
               to_char(finished_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as finished_at,
               created_by_name,
               total_seconds, queue_ms, run_ms, total_ms, meta, result, error
          FROM jobs
         WHERE job_id = $1
         LIMIT 1
      `;
      const jr = await client.query(jobSQL, [id]);
      if (!jr.rowCount)
        return res.status(404).json({ ok: false, error: "not_found" });
      const job = camel(jr.rows[0]);

      const stagesSQL = `
        SELECT stage_name AS name, status,
               to_char(started_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as started_at,
               to_char(ended_at,   'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as ended_at,
               duration_ms, meta, error
          FROM job_stages
         WHERE job_id = $1
         ORDER BY started_at ASC NULLS FIRST, id ASC
      `;
      const st = await client.query(stagesSQL, [id]);
      job.stages = st.rows.map(camelStage);
      return res.json(job);
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[admin/jobs-db] get error", e);
    return res.status(500).json({ ok: false, error: "db_error" });
  }
});

/**
 * DELETE /forusbot/admin/jobs-db/_purge
 * Borra todos los registros de job_stages, jobs (y job_events si existe).
 */
router.delete("/jobs-db/_purge", adminGate, async (_req, res) => {
  if (!ENABLED || !DBURL) {
    return res.status(503).json({ ok: false, error: "audit_db_disabled" });
  }
  const p = getPool();
  try {
    const client = await p.connect();
    try {
      await client.query("BEGIN");

      const beforeStages = await client.query(
        "SELECT COUNT(*)::int AS c FROM public.job_stages"
      );
      const beforeJobs = await client.query(
        "SELECT COUNT(*)::int AS c FROM public.jobs"
      );
      let beforeEvents = { rows: [{ c: 0 }] };
      const hasEvents = await client.query(
        "SELECT to_regclass('public.job_events') IS NOT NULL AS ok"
      );
      if (hasEvents.rows[0]?.ok) {
        beforeEvents = await client.query(
          "SELECT COUNT(*)::int AS c FROM public.job_events"
        );
      }

      // Truncate (orden no importa con CASCADE, pero dejamos stages primero por claridad)
      await client.query(
        "TRUNCATE TABLE public.job_stages RESTART IDENTITY CASCADE"
      );
      await client.query("TRUNCATE TABLE public.jobs RESTART IDENTITY CASCADE");
      if (hasEvents.rows[0]?.ok) {
        await client.query(
          "TRUNCATE TABLE public.job_events RESTART IDENTITY CASCADE"
        );
      }

      await client.query("COMMIT");
      return res.json({
        ok: true,
        purged: {
          stages: beforeStages.rows[0].c,
          jobs: beforeJobs.rows[0].c,
          events: beforeEvents.rows[0].c,
        },
      });
    } catch (e) {
      await p.query?.("ROLLBACK").catch(() => {});
      console.error("[admin/jobs-db] purge error", e);
      return res.status(500).json({ ok: false, error: "db_error" });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[admin/jobs-db] purge connect error", e);
    return res.status(500).json({ ok: false, error: "db_error" });
  }
});

module.exports = router;

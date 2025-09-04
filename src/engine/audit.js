// src/engine/audit.js
// Persiste jobs y stages en Postgres al ritmo de los eventos del logger.
// Auto-crea el esquema si no existe. No tiene dependencias del logger para evitar ciclos.

const { Pool } = require("pg");

const ENABLED = String(process.env.AUDIT_DB || "").trim() === "1";
const DBURL = process.env.DATABASE_URL || "";

let pool = null;
let ensured = null;

function getPool() {
  if (!ENABLED || !DBURL) return null;
  if (pool) return pool;
  // Render usa sslmode=require en el URL; pg lo respeta automáticamente.
  pool = new Pool({ connectionString: DBURL, max: 5 });
  return pool;
}

async function ensureSchema() {
  if (ensured) return ensured;
  const p = getPool();
  if (!p) return null;
  ensured = (async () => {
    const sql = `
    CREATE TABLE IF NOT EXISTS jobs (
      job_id UUID PRIMARY KEY,
      bot_id TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('queued','running','succeeded','failed','canceled')),
      accepted_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      total_seconds INTEGER,
      created_by_name TEXT,
      created_by_role TEXT,
      created_by_at TIMESTAMPTZ,
      meta JSONB,
      result JSONB,
      error JSONB,
      stages JSONB,
      stages_list JSONB
    );

    CREATE INDEX IF NOT EXISTS jobs_state_idx ON jobs(state);
    CREATE INDEX IF NOT EXISTS jobs_finished_idx ON jobs(finished_at);
    CREATE INDEX IF NOT EXISTS jobs_bot_idx ON jobs(bot_id);

    CREATE TABLE IF NOT EXISTS job_stages (
      id BIGSERIAL PRIMARY KEY,
      job_id UUID NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('start','succeed','fail')),
      started_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ,
      duration_ms INTEGER,
      meta JSONB,
      error JSONB
    );

    CREATE INDEX IF NOT EXISTS job_stages_job_idx ON job_stages(job_id);
    CREATE INDEX IF NOT EXISTS job_stages_name_idx ON job_stages(name);
    `;
    await p.query(sql);
  })().catch((e) => {
    // No rompas la app si falla el esquema (solo log interno)
    console.error("[audit.ensureSchema] error:", e);
    ensured = null;
  });
  return ensured;
}

function js(v) {
  if (v == null) return null;
  try {
    return JSON.stringify(v);
  } catch {
    return JSON.stringify(String(v));
  }
}

async function upsertAccepted(rec) {
  const p = getPool();
  if (!p) return;
  await ensureSchema();

  const jobId = rec.jobId || rec.job_id;
  const botId = rec.bot || rec.botId || "unknown";
  const acceptedAt = rec.ts;
  const meta = js(rec.meta || null);

  const sql = `
  INSERT INTO jobs (job_id, bot_id, state, accepted_at, meta)
  VALUES ($1, $2, 'queued', $3, $4::jsonb)
  ON CONFLICT (job_id)
  DO UPDATE SET
    bot_id = EXCLUDED.bot_id,
    state = 'queued',
    accepted_at = EXCLUDED.accepted_at,
    meta = COALESCE(jobs.meta, '{}'::jsonb) || COALESCE(EXCLUDED.meta, '{}'::jsonb)
  `;
  await p.query(sql, [jobId, botId, acceptedAt, meta]);
}

async function markStarted(rec) {
  const p = getPool();
  if (!p) return;
  await ensureSchema();

  const jobId = rec.jobId;
  const startedAt = rec.ts;
  const sql = `
  UPDATE jobs
     SET state='running', started_at=$2
   WHERE job_id=$1
  `;
  await p.query(sql, [jobId, startedAt]);
}

async function markSucceeded(rec) {
  const p = getPool();
  if (!p) return;
  await ensureSchema();

  const jobId = rec.jobId;
  const finishedAt = rec.ts;
  const result = js(rec.result || null);

  const sql = `
  UPDATE jobs
     SET state='succeeded',
         finished_at=$2,
         result=$3::jsonb,
         total_seconds = CASE
           WHEN started_at IS NOT NULL THEN EXTRACT(EPOCH FROM ($2::timestamptz - started_at))::int
           ELSE NULL END
   WHERE job_id=$1
  `;
  await p.query(sql, [jobId, finishedAt, result]);
}

async function markFailed(rec) {
  const p = getPool();
  if (!p) return;
  await ensureSchema();

  const jobId = rec.jobId;
  const finishedAt = rec.ts;
  const error = js(rec.error || null);

  const sql = `
  UPDATE jobs
     SET state='failed',
         finished_at=$2,
         error=$3::jsonb,
         total_seconds = CASE
           WHEN started_at IS NOT NULL THEN EXTRACT(EPOCH FROM ($2::timestamptz - started_at))::int
           ELSE NULL END
   WHERE job_id=$1
  `;
  await p.query(sql, [jobId, finishedAt, error]);
}

async function saveStage(rec, status) {
  const p = getPool();
  if (!p) return;
  await ensureSchema();

  const jobId = rec.jobId;
  const name = rec.stage || "";
  const meta = js(rec.meta || null);
  const error = js(rec.error || null);

  // Para succeed/fail estimamos started_at a partir de durationMs si no existe un start previo
  const endedAt = rec.ts ? new Date(rec.ts) : new Date();
  const duration = Number.isFinite(rec.durationMs) ? rec.durationMs : null;
  const startedAt =
    duration != null ? new Date(endedAt.getTime() - duration) : endedAt;

  const sql = `
  INSERT INTO job_stages (job_id, name, status, started_at, ended_at, duration_ms, meta, error)
  VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
  `;
  await p.query(sql, [
    jobId,
    name,
    status,
    startedAt.toISOString(),
    endedAt.toISOString(),
    duration,
    meta,
    error,
  ]);
}

async function saveSummary(rec) {
  const p = getPool();
  if (!p) return;
  await ensureSchema();

  const jobId = rec.jobId;
  const totalMs = Number.isFinite(rec.totalMs) ? rec.totalMs : null;
  const stages = js(rec.stages || null);
  const stagesList = js(rec.stagesList || null);

  const sql = `
  UPDATE jobs
     SET stages=$2::jsonb,
         stages_list=$3::jsonb,
         total_seconds = COALESCE($4, total_seconds)
   WHERE job_id=$1
  `;
  const totalSecs = totalMs != null ? Math.round(totalMs / 1000) : null;
  await p.query(sql, [jobId, stages, stagesList, totalSecs]);
}

async function trackEvent(rec) {
  // Silencioso si no hay DB o no está habilitado
  if (!ENABLED || !DBURL || !rec || !rec.type) return;

  try {
    // Algunos eventos no traen jobId (ignorar)
    if (!rec.jobId) return;

    const t = String(rec.type);
    if (t === "job.accepted") return upsertAccepted(rec);
    if (t === "job.started") return markStarted(rec);
    if (t === "job.succeeded") return markSucceeded(rec);
    if (t === "job.failed") return markFailed(rec);
    if (t === "stage.start") return saveStage(rec, "start");
    if (t === "stage.succeed") return saveStage(rec, "succeed");
    if (t === "stage.fail") return saveStage(rec, "fail");
    if (t === "job.summary") return saveSummary(rec);

    // Otros tipos no críticos: ignorar
  } catch (e) {
    // Nunca romper el flujo por la auditoría
    console.error("[audit.trackEvent] error:", e && e.message ? e.message : e);
  }
}

module.exports = { trackEvent };

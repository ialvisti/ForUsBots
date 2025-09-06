// src/engine/audit.js
// Persiste jobs y stages en Postgres al ritmo de los eventos del logger.

const { Pool } = require("pg");

const ENABLED = String(process.env.AUDIT_DB || "").trim() === "1";
const DBURL = process.env.DATABASE_URL || "";

let pool = null;
let ensured = null;

function getPool() {
  if (!ENABLED || !DBURL) return null;
  if (pool) return pool;
  pool = new Pool({ connectionString: DBURL, max: 5 });
  return pool;
}

async function ensureSchema() {
  if (ensured) return ensured;
  const p = getPool();
  if (!p) return null;

  ensured = (async () => {
    // Esquema base + columnas en ms idempotentes + estimate/capacity_snapshot
    const sql = `
    CREATE TABLE IF NOT EXISTS jobs (
      job_id UUID PRIMARY KEY,
      bot_id TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('queued','running','succeeded','failed','canceled')),
      accepted_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      total_seconds INTEGER,
      -- métricas en ms (se agregan si faltan)
      queue_ms INTEGER,
      run_ms INTEGER,
      total_ms INTEGER,
      -- quién ejecutó
      created_by_name TEXT,
      created_by_role TEXT,
      created_by_at TIMESTAMPTZ,
      -- snapshots al aceptar
      estimate JSONB,
      capacity_snapshot JSONB,
      -- payloads
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
      stage_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('start','succeed','fail')),
      started_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ,
      duration_ms INTEGER,
      meta JSONB,
      error JSONB
    );

    CREATE INDEX IF NOT EXISTS job_stages_job_idx ON job_stages(job_id);
    CREATE INDEX IF NOT EXISTS job_stages_name_idx ON job_stages(stage_name);
    CREATE INDEX IF NOT EXISTS job_stages_started_idx ON job_stages(started_at);

    -- Asegurar columnas si venimos de un esquema anterior
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='jobs' AND column_name='queue_ms'
      ) THEN
        ALTER TABLE jobs ADD COLUMN queue_ms INTEGER;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='jobs' AND column_name='run_ms'
      ) THEN
        ALTER TABLE jobs ADD COLUMN run_ms INTEGER;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='jobs' AND column_name='total_ms'
      ) THEN
        ALTER TABLE jobs ADD COLUMN total_ms INTEGER;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='jobs' AND column_name='estimate'
      ) THEN
        ALTER TABLE jobs ADD COLUMN estimate JSONB;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='jobs' AND column_name='capacity_snapshot'
      ) THEN
        ALTER TABLE jobs ADD COLUMN capacity_snapshot JSONB;
      END IF;
    END $$;
    `;
    await p.query(sql);
  })().catch((e) => {
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

function pickCreatedBy(executedBy) {
  if (!executedBy || typeof executedBy !== "object")
    return { name: null, role: null, at: null };
  const name = executedBy.name ?? null;
  const role = executedBy.role ?? null;
  const at = executedBy.at ?? null;
  return { name, role, at };
}

async function upsertAccepted(rec) {
  const p = getPool();
  if (!p) return;
  await ensureSchema();

  const jobId = rec.jobId || rec.job_id;
  const botId = rec.bot || rec.botId || "unknown";
  const acceptedAt = rec.ts;
  const meta = js(rec.meta || null);
  const estimate = js(rec.estimate || null);
  const capacity = js(rec.capacitySnapshot || null);
  const { name, role, at } = pickCreatedBy(rec.executedBy);

  const sql = `
  INSERT INTO jobs (
    job_id, bot_id, state, accepted_at, meta,
    created_by_name, created_by_role, created_by_at,
    estimate, capacity_snapshot
  )
  VALUES ($1, $2, 'queued', $3, $4::jsonb, $5, $6, $7::timestamptz, $8::jsonb, $9::jsonb)
  ON CONFLICT (job_id)
  DO UPDATE SET
    bot_id = EXCLUDED.bot_id,
    state = 'queued',
    accepted_at = EXCLUDED.accepted_at,
    meta = COALESCE(jobs.meta, '{}'::jsonb) || COALESCE(EXCLUDED.meta, '{}'::jsonb),
    created_by_name = COALESCE(jobs.created_by_name, EXCLUDED.created_by_name),
    created_by_role = COALESCE(jobs.created_by_role, EXCLUDED.created_by_role),
    created_by_at   = COALESCE(jobs.created_by_at,   EXCLUDED.created_by_at),
    estimate = COALESCE(jobs.estimate, EXCLUDED.estimate),
    capacity_snapshot = COALESCE(jobs.capacity_snapshot, EXCLUDED.capacity_snapshot)
  `;
  await p.query(sql, [
    jobId,
    botId,
    acceptedAt,
    meta,
    name,
    role,
    at,
    estimate,
    capacity,
  ]);
}

async function markStarted(rec) {
  const p = getPool();
  if (!p) return;
  await ensureSchema();

  const jobId = rec.jobId;
  const startedAt = rec.ts;
  const sql = `
  UPDATE jobs
     SET state='running',
         started_at=COALESCE(started_at, $2),
         queue_ms = CASE
           WHEN accepted_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM ($2::timestamptz - accepted_at))*1000)::int
           ELSE queue_ms END
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
         -- mantener semántica previa de total_seconds (seg): finished - started
         total_seconds = CASE
           WHEN started_at IS NOT NULL THEN EXTRACT(EPOCH FROM ($2::timestamptz - started_at))::int
           ELSE total_seconds END,
         -- nuevas métricas en ms
         run_ms = CASE
           WHEN started_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM ($2::timestamptz - started_at))*1000)::int
           ELSE run_ms END,
         total_ms = CASE
           WHEN accepted_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM ($2::timestamptz - accepted_at))*1000)::int
           ELSE total_ms END
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
         -- mantener semántica previa de total_seconds (seg): finished - started
         total_seconds = CASE
           WHEN started_at IS NOT NULL THEN EXTRACT(EPOCH FROM ($2::timestamptz - started_at))::int
           ELSE total_seconds END,
         -- métricas en ms
         run_ms = CASE
           WHEN started_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM ($2::timestamptz - started_at))*1000)::int
           ELSE run_ms END,
         total_ms = CASE
           WHEN accepted_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM ($2::timestamptz - accepted_at))*1000)::int
           ELSE total_ms END
   WHERE job_id=$1
  `;
  await p.query(sql, [jobId, finishedAt, error]);
}

async function saveStage(rec, status) {
  const p = getPool();
  if (!p) return;
  await ensureSchema();

  const jobId = rec.jobId;
  const stageName = rec.stage || rec.stage_name || "";
  const meta = js(rec.meta || null);
  const error = js(rec.error || null);

  const endedAt = rec.ts ? new Date(rec.ts) : new Date();
  const duration = Number.isFinite(rec.durationMs) ? rec.durationMs : null;
  const startedAt =
    duration != null ? new Date(endedAt.getTime() - duration) : endedAt;

  const sql = `
  INSERT INTO job_stages (job_id, stage_name, status, started_at, ended_at, duration_ms, meta, error)
  VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
  ON CONFLICT (job_id, stage_name, status, started_at, ended_at) DO NOTHING
  `;
  await p.query(sql, [
    jobId,
    stageName,
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
  const totalMs = Number.isFinite(rec.totalMs) ? rec.totalMs : null; // del runner: started→finished (run_ms)
  const stages = js(rec.stages || null);
  const stagesList = js(rec.stagesList || null);

  const sql = `
  UPDATE jobs
     SET stages=$2::jsonb,
         stages_list=$3::jsonb,
         -- completa run_ms/total_seconds sólo si estaban nulos (compat)
         run_ms = COALESCE(run_ms, $4),
         total_seconds = COALESCE(total_seconds, CASE WHEN $4 IS NULL THEN NULL ELSE ($4/1000)::int END)
   WHERE job_id=$1
  `;
  await p.query(sql, [jobId, stages, stagesList, totalMs]);
}

async function trackEvent(rec) {
  // Silencioso si no hay DB o no está habilitado
  if (!ENABLED || !DBURL || !rec || !rec.type) return;

  try {
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
  } catch (e) {
    console.error("[audit.trackEvent] error:", e && e.message ? e.message : e);
  }
}

module.exports = {
  trackEvent,
  // alias opcionales, por si en el futuro cambias el logger
  onLogEvent: trackEvent,
  logEvent: trackEvent,
  event: trackEvent,
};

// src/routes/admin-jobs-db.js
const express = require("express");
const { jobsCol, stagesCol, db } = require("../db/firestore");
const { resolveRole } = require("../middleware/auth");
const logger = require("../engine/logger");

const router = express.Router();

const ENABLED = String(process.env.AUDIT_DB || "").trim() === "1";

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
  if (role !== "admin") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  return next();
}

function normalizeCreatedByName(v) {
  if (v == null) return null;
  if (typeof v === "object") {
    return v.name || v.fullname || v.username || null;
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    if (s.startsWith("{") || s.startsWith("[")) {
      try {
        const o = JSON.parse(s);
        if (o && typeof o === "object") {
          return o.name || o.fullname || o.username || s;
        }
        return s;
      } catch {
        return s;
      }
    }
    return s;
  }
  return String(v);
}

function tsToIso(t) {
  if (t == null) return null;
  if (typeof t.toDate === "function") {
    try {
      return t.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (t instanceof Date) return t.toISOString();
  if (typeof t === "string") return t;
  return null;
}

function mapJobDoc(id, d) {
  if (!d) return null;
  return {
    jobId: id,
    botId: d.bot_id || null,
    state: d.state || null,
    acceptedAt: tsToIso(d.accepted_at),
    startedAt: tsToIso(d.started_at),
    finishedAt: tsToIso(d.finished_at),
    createdByName: normalizeCreatedByName(d.created_by_name),
    totalSeconds:
      d.total_ms != null
        ? Math.round(Number(d.total_ms) / 1000)
        : d.run_ms != null
        ? Math.round(Number(d.run_ms) / 1000)
        : d.total_seconds != null
        ? Number(d.total_seconds)
        : null,
    queueMs: d.queue_ms != null ? Number(d.queue_ms) : null,
    runMs: d.run_ms != null ? Number(d.run_ms) : null,
    totalMs: d.total_ms != null ? Number(d.total_ms) : null,
    meta: d.meta || {},
    result: d.result || null,
    error: d.error || null,
  };
}

function mapStageDoc(d) {
  if (!d) return null;
  return {
    name: d.stage_name || null,
    status: d.status || null,
    startedAt: tsToIso(d.started_at),
    endedAt: tsToIso(d.ended_at),
    durationMs: d.duration_ms != null ? Number(d.duration_ms) : null,
    meta: d.meta || null,
    error: d.error || null,
  };
}

/**
 * GET /forusbot/admin/jobs-db
 * Query params:
 *  - state (queued|running|succeeded|failed|canceled)
 *  - botId (exact match — Firestore no soporta ILIKE)
 *  - limit (1..500) default 100
 *  - offset (>=0) default 0
 */
router.get("/jobs-db", adminGate, async (req, res) => {
  if (!ENABLED) {
    return res.json({ ok: true, total: 0, limit: 0, offset: 0, jobs: [] });
  }

  const limit = Math.min(
    500,
    Math.max(1, parseInt(req.query.limit ?? "100", 10))
  );
  const offset = Math.max(0, parseInt(req.query.offset ?? "0", 10));
  const state = (req.query.state || "").trim().toLowerCase();
  const botId = (req.query.botId || "").trim();

  try {
    let q = jobsCol();
    if (state) q = q.where("state", "==", state);
    if (botId) q = q.where("bot_id", "==", botId);
    q = q.orderBy("accepted_at", "desc");
    if (offset > 0) q = q.offset(offset);
    q = q.limit(limit);

    const snap = await q.get();
    const jobs = snap.docs.map((doc) => mapJobDoc(doc.id, doc.data()));
    return res.json({
      ok: true,
      total: jobs.length,
      limit,
      offset,
      jobs,
    });
  } catch (e) {
    logger.error({
      type: "route.admin_jobs_db.admin_jobs_db_list_error",
      error: e,
    });
    return res.status(500).json({ ok: false, error: "db_error" });
  }
});

/**
 * GET /forusbot/admin/jobs-db/:id
 * Detalle + stages desde Firestore
 */
router.get("/jobs-db/:id", adminGate, async (req, res) => {
  if (!ENABLED) {
    return res.status(404).json({ ok: false, error: "not_found" });
  }
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "missing_id" });

  try {
    const doc = await jobsCol().doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }
    const job = mapJobDoc(doc.id, doc.data());

    let stagesSnap;
    try {
      stagesSnap = await stagesCol(id).orderBy("started_at", "asc").get();
    } catch {
      stagesSnap = await stagesCol(id).get();
    }
    job.stages = stagesSnap.docs
      .map((s) => mapStageDoc(s.data()))
      .filter(Boolean);

    return res.json(job);
  } catch (e) {
    logger.error({
      type: "route.admin_jobs_db.admin_jobs_db_get_error",
      error: e,
    });
    return res.status(500).json({ ok: false, error: "db_error" });
  }
});

/**
 * DELETE /forusbot/admin/jobs-db/_purge
 * Borra jobs/* y sus subcolecciones stages/* en Firestore.
 */
router.delete("/jobs-db/_purge", adminGate, async (_req, res) => {
  if (!ENABLED) {
    return res.status(503).json({ ok: false, error: "audit_db_disabled" });
  }
  try {
    let stagesPurged = 0;
    let jobsPurged = 0;

    // Borrar en lotes de 250 docs.
    const PAGE = 250;
    let more = true;
    while (more) {
      const snap = await jobsCol().limit(PAGE).get();
      if (snap.empty) break;

      for (const jobDoc of snap.docs) {
        // Borrar subcolección stages del job
        let moreStages = true;
        while (moreStages) {
          const stSnap = await stagesCol(jobDoc.id).limit(PAGE).get();
          if (stSnap.empty) break;
          const stBatch = db().batch();
          stSnap.docs.forEach((s) => stBatch.delete(s.ref));
          await stBatch.commit();
          stagesPurged += stSnap.size;
          moreStages = stSnap.size === PAGE;
        }
      }

      const batch = db().batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      jobsPurged += snap.size;
      more = snap.size === PAGE;
    }

    return res.json({
      ok: true,
      purged: { stages: stagesPurged, jobs: jobsPurged, events: 0 },
    });
  } catch (e) {
    logger.error({
      type: "route.admin_jobs_db.admin_jobs_db_purge_error",
      error: e,
    });
    return res.status(500).json({ ok: false, error: "db_error" });
  }
});

module.exports = router;

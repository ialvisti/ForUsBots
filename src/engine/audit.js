// src/engine/audit.js
// Persiste jobs, stages y eventos en Firestore al ritmo de los eventos del logger.

const {
  jobsCol,
  eventsCol,
  stagesCol,
  FieldValue,
  Timestamp,
} = require("../db/firestore");

const ENABLED = String(process.env.AUDIT_DB || "").trim() === "1";

function toTs(date) {
  if (!date) return null;
  if (date instanceof Date) {
    const t = date.getTime();
    if (!Number.isFinite(t)) return null;
    return Timestamp.fromDate(date);
  }
  if (typeof date === "string" || typeof date === "number") {
    const d = new Date(date);
    const t = d.getTime();
    if (!Number.isFinite(t)) return null;
    return Timestamp.fromDate(d);
  }
  return null;
}

function pickCreatedBy(executedBy) {
  if (!executedBy || typeof executedBy !== "object") {
    return { name: null, role: null, at: null };
  }
  return {
    name: executedBy.name ?? null,
    role: executedBy.role ?? null,
    at: executedBy.at ?? null,
  };
}

function safeJsonClone(v) {
  // Asegura que el payload sea serializable y libre de objetos exóticos.
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return null;
  }
}

async function trackEvent(rec) {
  if (!ENABLED || !rec || !rec.type) return;

  const type = String(rec.type);
  const jobId = rec.jobId || rec.job_id || null;

  try {
    if (type === "job.accepted" && jobId) {
      const { name, role, at } = pickCreatedBy(rec.executedBy);
      await jobsCol().doc(jobId).set(
        {
          bot_id: rec.bot || rec.botId || "unknown",
          state: "queued",
          accepted_at: toTs(rec.ts),
          meta: rec.meta || {},
          created_by_name: name,
          created_by_role: role,
          created_by_at: toTs(at),
          estimate: rec.estimate || null,
          capacity_snapshot: rec.capacitySnapshot || null,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else if (type === "job.started" && jobId) {
      await jobsCol().doc(jobId).set(
        {
          state: "running",
          started_at: toTs(rec.ts),
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else if (
      (type === "job.succeeded" ||
        type === "job.failed" ||
        type === "job.canceled") &&
      jobId
    ) {
      await jobsCol().doc(jobId).set(
        {
          state: type.split(".")[1],
          finished_at: toTs(rec.ts),
          result: rec.result || null,
          error: rec.error || null,
          run_ms: Number.isFinite(rec.runMs) ? rec.runMs : null,
          queue_ms: Number.isFinite(rec.queueMs) ? rec.queueMs : null,
          total_ms: Number.isFinite(rec.totalMs) ? rec.totalMs : null,
          total_seconds: Number.isFinite(rec.totalSeconds)
            ? rec.totalSeconds
            : null,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else if (type === "job.summary" && jobId) {
      await jobsCol().doc(jobId).set(
        {
          stages: rec.stages || null,
          stages_list: rec.stagesList || null,
          run_ms: Number.isFinite(rec.totalMs) ? rec.totalMs : null,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else if (type.startsWith("stage.") && jobId) {
      const status = type.split(".")[1]; // start | succeed | fail
      const endedAt = rec.ts ? new Date(rec.ts) : new Date();
      const durationMs = Number.isFinite(rec.durationMs) ? rec.durationMs : null;
      const startedAt =
        durationMs != null ? new Date(endedAt.getTime() - durationMs) : endedAt;

      await stagesCol(jobId).add({
        bot_id: rec.bot || rec.botId || null,
        stage_name: rec.stage || rec.stage_name || "",
        status,
        started_at: toTs(startedAt),
        ended_at: toTs(endedAt),
        duration_ms: durationMs,
        meta: rec.meta || null,
        error: rec.error || null,
        sequence: Number.isFinite(rec.sequence) ? rec.sequence : Date.now(),
        inserted_at: FieldValue.serverTimestamp(),
      });
    }

    // Siempre escribir el evento crudo en events/
    await eventsCol().add({
      ts: toTs(rec.ts) || FieldValue.serverTimestamp(),
      level: rec.level || "info",
      type,
      job_id: jobId,
      bot_id: rec.bot || rec.botId || null,
      payload: safeJsonClone(rec),
      inserted_at: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    // No tirar; sólo log local. NO usar el logger para evitar recursividad
    // si el logger reenvía a este audit.
    // eslint-disable-next-line no-console
    console.error("[audit] firestore write failed:", err.message);
  }
}

module.exports = {
  trackEvent,
  // alias por compatibilidad con código existente
  onLogEvent: trackEvent,
  logEvent: trackEvent,
  event: trackEvent,
};

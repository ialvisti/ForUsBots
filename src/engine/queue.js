// src/engine/queue.js
const { randomUUID } = require("crypto");
const { MAX_CONCURRENCY: CFG_MAX } = require("../config");
const { getSettings } = require("./settings");
const log = require("./logger");
const { normalizeResultEnvelope } = require("./normalizer");

// ===== Config de estimaciones (por bot, moving avg) =====
const ESTIMATE_AVG_SECONDS = Math.max(
  30,
  parseInt(process.env.ESTIMATE_AVG_SECONDS || "120", 10)
);
const ESTIMATE_AVG_WINDOW = Math.max(
  3,
  parseInt(process.env.ESTIMATE_AVG_WINDOW || "10", 10)
);

// Estado en memoria (por proceso)
const running = []; // [{ jobId, botId, meta, startedAt, run, finishedAt, _resolve, _reject, __tracker, __stagesHistory: [] }]
const queue = []; // [{ jobId, botId, meta, enqueuedAt, run, _resolve, _reject }]

// Stage por jobId (telemetría fina runtime /status)
const stageByJob = new Map(); // jobId -> { name, meta, sinceISO }

// Registro de jobs (para GET /jobs/:id y listados)
const jobsById = new Map(); // jobId -> { jobId, botId, meta, state, acceptedAt, startedAt, finishedAt, result, error, createdBy, stages: [], stagesSummaryMsByName?, rawResult? }

// Promedios móviles por bot
const durationsByBot = new Map(); // botId -> number[] (segundos)

// ===== Utilidades tiempo =====
function nowISO() {
  return new Date().toISOString();
}
function secondsSince(iso) {
  try {
    return Math.max(
      0,
      Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    );
  } catch {
    return 0;
  }
}
function secondsBetweenISO(aISO, bISO) {
  try {
    const a = new Date(aISO).getTime();
    const b = new Date(bISO).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.max(0, Math.floor((b - a) / 1000));
  } catch {
    return null;
  }
}
function msBetweenISO(aISO, bISO) {
  try {
    const a = new Date(aISO).getTime();
    const b = new Date(bISO).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.max(0, b - a);
  } catch {
    return null;
  }
}

// ===== Concurrencia dinámica =====
function currentMaxConcurrency() {
  const s =
    getSettings && typeof getSettings === "function" ? getSettings() : null;
  const n = s && Number.isFinite(s.maxConcurrency) ? s.maxConcurrency : CFG_MAX;
  return Math.max(1, Number.isFinite(n) ? n : 3);
}

// ===== Helpers de createdBy/meta =====
function sanitizeCreatedBy(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = raw.name ?? null;
  const role = raw.role ? String(raw.role) : null;
  const at = raw.at ? String(raw.at) : nowISO();
  return { name, role, at };
}
function splitMeta(meta) {
  if (!meta || typeof meta !== "object")
    return { metaSansCreator: {}, createdBySan: null };
  const { createdBy, ...rest } = meta;
  return { metaSansCreator: rest, createdBySan: sanitizeCreatedBy(createdBy) };
}

// ===== Stages (runtime status) =====
function setJobStage(jobId, name, meta) {
  if (!jobId) return;
  stageByJob.set(jobId, {
    name: String(name || ""),
    meta: meta || null,
    sinceISO: nowISO(),
  });
}
function clearJobStage(jobId) {
  stageByJob.delete(jobId);
}

// ===== Promedios =====
function summarizeByBot() {
  const s = {};
  for (const j of running) {
    (s[j.botId] ||= { running: 0, queued: 0 }).running++;
  }
  for (const j of queue) {
    (s[j.botId] ||= { running: 0, queued: 0 }).queued++;
  }
  return s;
}
function avgDurationSeconds(botId) {
  const arr = durationsByBot.get(botId);
  if (!arr || arr.length === 0) return ESTIMATE_AVG_SECONDS;
  const sum = arr.reduce((a, b) => a + b, 0);
  return Math.max(1, Math.round(sum / arr.length));
}
function pushDuration(botId, secs) {
  if (!Number.isFinite(secs) || secs <= 0) return;
  const key = String(botId || "unknown");
  const arr = durationsByBot.get(key) || [];
  arr.push(Math.round(secs));
  while (arr.length > ESTIMATE_AVG_WINDOW) arr.shift();
  durationsByBot.set(key, arr);
}

// ===== Capacidad + ETA =====
function capacitySnapshot() {
  const MC = currentMaxConcurrency();
  return {
    maxConcurrency: MC,
    running: running.length,
    queued: queue.length,
    slotsAvailable: Math.max(0, MC - running.length),
  };
}

// ETA avanzada: “lanes” + tiempos remanentes
function computeEstimate(
  botId,
  snapshot,
  positionInQueue /* 1-based (pre-inserción) */
) {
  const C = snapshot.maxConcurrency;
  const avgThis = avgDurationSeconds(botId);

  // 1) Inicializa C lanes con 0s
  const lanes = Array(Math.max(1, C)).fill(0);

  // 2) Carga tiempos remanentes de los jobs en ejecución
  const runningNow = running.slice(0, C);
  for (let i = 0; i < runningNow.length && i < C; i++) {
    const r = runningNow[i];
    const elapsed = r.startedAt ? secondsSince(r.startedAt) : 0;
    const avgBot = avgDurationSeconds(r.botId);
    const remaining = Math.max(1, avgBot - elapsed);
    lanes[i] = remaining;
  }

  // 3) Simula la cola anterior a “nosotros”
  const queuedAhead = Math.max(0, positionInQueue - 1);
  const aheadList = queue.slice(0, queuedAhead);

  function indexOfMin(arr) {
    let idx = 0;
    let min = arr[0];
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] < min) {
        min = arr[i];
        idx = i;
      }
    }
    return idx;
  }

  for (const q of aheadList) {
    const d = avgDurationSeconds(q.botId);
    const laneIdx = indexOfMin(lanes);
    lanes[laneIdx] += d;
  }

  // 4) Nuestro job comienza cuando termine el lane más libre
  const startSeconds = Math.min(...lanes);
  const finishSeconds = startSeconds + avgThis;
  const now = Date.now();
  const startAt = new Date(now + startSeconds * 1000).toISOString();
  const finishAt = new Date(now + finishSeconds * 1000).toISOString();

  return {
    method: "lanes+movingAvg",
    avgDurationSeconds: avgThis,
    startSeconds,
    finishSeconds,
    startAt,
    finishAt,
  };
}

// ===== Tracker de stages (duraciones + logs) =====
function makeStageTracker(job) {
  let current = null; // { name, meta, startedAt }
  const history = []; // [{ name, startedAt, endedAt, durationMs, status, meta, error? }]

  function appendHistory(entry) {
    history.push(entry);
    // Persistir en registro público del job
    const reg = jobsById.get(job.jobId);
    if (reg) {
      reg.stages = reg.stages || [];
      reg.stages.push(entry);
    }
  }

  function start(name, meta) {
    // cerrar previo (succeed implícito) si lo hubiera
    if (current) {
      const now = nowISO();
      const durationMs = msBetweenISO(current.startedAt, now);
      const entry = {
        name: current.name,
        startedAt: current.startedAt,
        endedAt: now,
        durationMs,
        status: "succeed",
        meta: current.meta || null,
      };
      appendHistory(entry);
      log.event(
        {
          type: "stage.succeed",
          jobId: job.jobId,
          bot: job.botId,
          stage: current.name,
          durationMs,
          meta: current.meta || null,
        },
        "info"
      );
    }
    current = {
      name: String(name || ""),
      meta: meta || null,
      startedAt: nowISO(),
    };
    setJobStage(job.jobId, current.name, current.meta);
    log.event(
      {
        type: "stage.start",
        jobId: job.jobId,
        bot: job.botId,
        stage: current.name,
        meta: current.meta || null,
      },
      "debug"
    );
  }

  function failCurrent(err) {
    if (!current) return;
    const now = nowISO();
    const durationMs = msBetweenISO(current.startedAt, now);
    const error = log.normalizeError(err);
    const entry = {
      name: current.name,
      startedAt: current.startedAt,
      endedAt: now,
      durationMs,
      status: "fail",
      meta: current.meta || null,
      error,
    };
    appendHistory(entry);
    log.event(
      {
        type: "stage.fail",
        jobId: job.jobId,
        bot: job.botId,
        stage: current.name,
        durationMs,
        meta: current.meta || null,
        error,
      },
      "error"
    );
    current = null;
  }

  function closeFinal(ok, err) {
    if (current) {
      const now = nowISO();
      const durationMs = msBetweenISO(current.startedAt, now);
      if (ok) {
        const entry = {
          name: current.name,
          startedAt: current.startedAt,
          endedAt: now,
          durationMs,
          status: "succeed",
          meta: current.meta || null,
        };
        appendHistory(entry);
        log.event(
          {
            type: "stage.succeed",
            jobId: job.jobId,
            bot: job.botId,
            stage: current.name,
            durationMs,
            meta: current.meta || null,
          },
          "info"
        );
      } else {
        const error = log.normalizeError(err);
        const entry = {
          name: current.name,
          startedAt: current.startedAt,
          endedAt: now,
          durationMs,
          status: "fail",
          meta: current.meta || null,
          error,
        };
        appendHistory(entry);
        log.event(
          {
            type: "stage.fail",
            jobId: job.jobId,
            bot: job.botId,
            stage: current.name,
            durationMs,
            meta: current.meta || null,
            error,
          },
          "error"
        );
      }
      current = null;
    }

    // resumen por nombre (ms)
    const stagesSummary = {};
    for (const h of history) {
      stagesSummary[h.name] =
        (stagesSummary[h.name] || 0) + (h.durationMs || 0);
    }
    const reg = jobsById.get(job.jobId);
    if (reg) {
      reg.stagesSummaryMsByName = stagesSummary;
    }

    const totalMs =
      job.startedAt && job.finishedAt
        ? msBetweenISO(job.startedAt, job.finishedAt)
        : null;
    log.event(
      {
        type: "job.summary",
        jobId: job.jobId,
        bot: job.botId,
        result: ok ? "Succeeded" : "Failed",
        totalMs,
        stages: stagesSummary,
        stagesList: history,
        meta: job.meta || null,
      },
      ok ? "info" : "error"
    );
  }

  return { start, failCurrent, closeFinal };
}

// ===== Motor de ejecución =====
function maybeStartNext() {
  while (running.length < currentMaxConcurrency() && queue.length > 0) {
    const job = queue.shift();
    job.startedAt = nowISO();
    running.push(job);

    const reg = jobsById.get(job.jobId);
    if (reg) {
      reg.state = "running";
      reg.startedAt = job.startedAt;
      reg.stages = []; // inicializa historial persistido
    }

    // tracker + ctx
    const tracker = makeStageTracker(job);
    job.__tracker = tracker;
    job.__stagesHistory = []; // no expuesto; redundante con reg.stages

    const jobCtx = {
      jobId: job.jobId,
      setStage: (name, meta) => tracker.start(name, meta),
    };

    log.event(
      {
        type: "job.started",
        jobId: job.jobId,
        bot: job.botId,
        meta: job.meta || null,
        running: running.length,
        queued: queue.length,
      },
      "info"
    );

    Promise.resolve()
      .then(() => job.run(jobCtx))
      .then(
        (val) => finalize(job, null, val),
        (err) => finalize(job, err, null)
      );
  }
}

function finalize(job, err, val) {
  job.finishedAt = nowISO();
  clearJobStage(job.jobId);
  const idx = running.findIndex((j) => j.jobId === job.jobId);
  if (idx >= 0) running.splice(idx, 1);

  const reg = jobsById.get(job.jobId);
  if (reg) {
    reg.finishedAt = job.finishedAt;
    if (err) {
      reg.state = "failed";
      reg.error = String(err && err.message ? err.message : err);
      // Normalizar aún en error
      try {
        reg.result = normalizeResultEnvelope(reg.botId, false, null, {
          error: reg.error,
        });
      } catch {
        reg.result = {
          ok: false,
          code: "ERROR",
          message: reg.error || null,
          data: null,
          warnings: [],
          errors: [],
        };
      }
    } else {
      reg.state = "succeeded";
      // Guardamos raw por depuración, pero no lo exponemos públicamente
      reg.rawResult = val;
      // Normalizamos a envelope canónico
      try {
        reg.result = normalizeResultEnvelope(reg.botId, true, val, null);
      } catch (e) {
        // Si algo falla, degradamos a genérico
        reg.result = {
          ok: true,
          code: "OK",
          message: null,
          data: val ?? null,
          warnings: [],
          errors: [],
        };
      }
      if (reg.startedAt) {
        const dur = secondsBetweenISO(reg.startedAt, reg.finishedAt);
        if (dur != null) pushDuration(reg.botId, dur);
      }
    }
  }

  // cerrar tracker (emite stage.* final y job.summary)
  if (job.__tracker) {
    try {
      job.__tracker.closeFinal(!err, err);
    } catch {}
  }

  // evento de cierre
  if (err) {
    log.event(
      {
        type: "job.failed",
        jobId: job.jobId,
        bot: job.botId,
        error: log.normalizeError(err),
        meta: job.meta || null,
      },
      "error"
    );
  } else {
    log.event(
      {
        type: "job.succeeded",
        jobId: job.jobId,
        bot: job.botId,
        meta: job.meta || null,
        result: (reg && reg.result) || null,
      },
      "info"
    );
  }

  setImmediate(maybeStartNext);

  if (err) job._reject(err);
  else job._resolve(val);
}

// ===== API Legacy (por compat interna) =====
function enqueue({ botId, meta = {}, run }) {
  if (typeof run !== "function")
    throw new Error("enqueue requiere un run() function");

  // Separar createdBy y limpiar meta para persistencia
  const { metaSansCreator, createdBySan } = splitMeta(meta);

  const job = {
    jobId: randomUUID(),
    botId: String(botId || "unknown"),
    meta: metaSansCreator, // <- ya sin createdBy
    enqueuedAt: nowISO(),
    run,
    _resolve: null,
    _reject: null,
  };

  jobsById.set(job.jobId, {
    jobId: job.jobId,
    botId: job.botId,
    meta: job.meta, // persistimos meta sin createdBy
    state: "queued",
    acceptedAt: job.enqueuedAt,
    startedAt: null,
    finishedAt: null,
    result: null,
    error: null,
    createdBy: createdBySan || null, // top-level, solo {name, role, at}
    stages: [],
  });

  const p = new Promise((resolve, reject) => {
    job._resolve = resolve;
    job._reject = reject;
  });

  queue.push(job);

  log.event(
    {
      type: "job.accepted",
      jobId: job.jobId,
      bot: job.botId,
      meta: job.meta || null,
      mode: "legacy-enqueue",
    },
    "info"
  );

  setImmediate(maybeStartNext);

  p.jobId = job.jobId;
  return p;
}

// ===== Nueva API 202: submit =====
function submit({ botId, meta = {}, run }) {
  if (typeof run !== "function")
    throw new Error("submit requiere un run() function");

  // Separar createdBy y limpiar meta para persistencia
  const { metaSansCreator, createdBySan } = splitMeta(meta);

  const jobId = randomUUID();
  const acceptedAt = nowISO();
  const job = {
    jobId,
    botId: String(botId || "unknown"),
    meta: metaSansCreator, // <- ya sin createdBy
    enqueuedAt: acceptedAt,
    run,
    _resolve: () => {},
    _reject: () => {},
  };

  jobsById.set(jobId, {
    jobId,
    botId: job.botId,
    meta: job.meta, // persistimos meta sin createdBy
    state: "queued",
    acceptedAt,
    startedAt: null,
    finishedAt: null,
    result: null,
    error: null,
    createdBy: createdBySan || null, // top-level, solo {name, role, at}
    stages: [],
  });

  // Snapshot/posición antes de encolar (nuestra posición será el último de la cola actual + 1)
  const snap = capacitySnapshot();
  const queuePosition = queue.length + 1;
  const estimate = computeEstimate(job.botId, snap, queuePosition);

  // Encola y dispara
  queue.push(job);
  setImmediate(maybeStartNext);

  const cap2 = capacitySnapshot();

  log.event(
    {
      type: "job.accepted",
      jobId,
      bot: job.botId,
      meta: job.meta || null,
      estimate,
      capacitySnapshot: cap2,
      mode: "submit",
    },
    "info"
  );

  return {
    ok: true,
    jobId,
    acceptedAt,
    queuePosition,
    estimate,
    capacitySnapshot: cap2,
  };
}

// ===== Cancelación / Listado / Métricas =====

/**
 * Cancela un job que esté en la COLA (no running).
 * Devuelve { ok, canceled, reason } con reason = 'queued' | 'running' | 'not_found'
 */
function cancel(jobId) {
  const id = String(jobId || "");
  const idx = queue.findIndex((j) => j.jobId === id);
  if (idx >= 0) {
    const [job] = queue.splice(idx, 1);
    const reg = jobsById.get(id);
    if (reg) {
      reg.state = "canceled";
      reg.finishedAt = nowISO();
      reg.error = "canceled";
    }
    // Rechaza promesa si existe (legacy enqueue)
    try {
      job._reject && job._reject(new Error("canceled"));
    } catch {}
    log.event(
      {
        type: "job.failed",
        jobId: id,
        bot: job.botId,
        error: { name: "Canceled", message: "canceled" },
      },
      "warn"
    );
    return { ok: true, canceled: true, reason: "queued" };
  }

  const reg = jobsById.get(id);
  if (!reg) return { ok: false, canceled: false, reason: "not_found" };
  if (reg.state === "running")
    return { ok: true, canceled: false, reason: "running" };
  // Ya terminó
  return { ok: true, canceled: false, reason: reg.state || "done" };
}

/**
 * Lista jobs con filtros básicos.
 * opts: { state?, botId?, limit?, offset? }
 */
function listJobs(opts = {}) {
  const { state, botId } = opts || {};
  const limit = Math.min(500, Math.max(1, parseInt(opts.limit ?? "50", 10)));
  const offset = Math.max(0, parseInt(opts.offset ?? "0", 10));

  // Tomamos todos los registros
  let arr = Array.from(jobsById.values());

  if (state) {
    const st = String(state).toLowerCase();
    arr = arr.filter((r) => String(r.state).toLowerCase() === st);
  }
  if (botId) {
    arr = arr.filter((r) => String(r.botId) === String(botId));
  }

  // Orden por acceptedAt desc (más recientes primero)
  arr.sort((a, b) => (b.acceptedAt || "").localeCompare(a.acceptedAt || ""));

  const total = arr.length;
  const items = arr.slice(offset, offset + limit);

  return {
    ok: true,
    total,
    limit,
    offset,
    jobs: items,
  };
}

/**
 * Métricas útiles (por bot y globales)
 */
function getMetrics() {
  const byBot = {};
  const botIds = new Set([
    ...Array.from(jobsById.values()).map((j) => j.botId),
    ...Array.from(durationsByBot.keys()),
    ...running.map((r) => r.botId),
    ...queue.map((q) => q.botId),
  ]);

  for (const b of botIds) {
    byBot[b] = {
      running: running.filter((r) => r.botId === b).length,
      queued: queue.filter((q) => q.botId === b).length,
      avgDurationSeconds: avgDurationSeconds(b),
      samples: durationsByBot.get(b) || [],
    };
  }

  const finishedCount = Array.from(jobsById.values()).filter(
    (j) =>
      j.state === "succeeded" || j.state === "failed" || j.state === "canceled"
  ).length;

  return {
    ok: true,
    timestamp: nowISO(),
    totals: {
      running: running.length,
      queued: queue.length,
      finished: finishedCount,
      maxConcurrency: currentMaxConcurrency(),
    },
    byBot,
  };
}

/**
 * Intenta arrancar nuevos jobs si hay slots (útil tras cambiar la concurrencia).
 */
function kick() {
  setImmediate(maybeStartNext);
}

// ===== Lectura de estado =====
function getJob(jobId) {
  const reg = jobsById.get(String(jobId || ""));
  if (!reg) return null;

  const stage = stageByJob.get(reg.jobId) || null;
  let metrics = {};

  if (reg.state === "queued") {
    metrics = {
      waitingSeconds: secondsSince(reg.acceptedAt),
      position: 1 + queue.findIndex((j) => j.jobId === reg.jobId),
    };
  } else if (reg.state === "running") {
    metrics = {
      elapsedSeconds: reg.startedAt ? secondsSince(reg.startedAt) : null,
      stage: stage ? stage.name : null,
      stageSince: stage ? stage.sinceISO : null,
      stageSeconds: stage ? secondsSince(stage.sinceISO) : null,
      stageMeta: stage ? stage.meta : null,
    };
  } else if (
    reg.state === "succeeded" ||
    reg.state === "failed" ||
    reg.state === "canceled"
  ) {
    metrics = {
      totalSeconds:
        reg.startedAt && reg.finishedAt
          ? secondsBetweenISO(reg.startedAt, reg.finishedAt)
          : null,
    };
  }

  return {
    ok: true,
    ...reg,
    ...metrics,
  };
}

function getStatus() {
  const stamp = nowISO();
  const runningView = running.map((j) => {
    const st = stageByJob.get(j.jobId);
    return {
      jobId: j.jobId,
      botId: j.botId,
      meta: j.meta, // ya sin createdBy
      startedAt: j.startedAt,
      elapsedSeconds: secondsSince(j.startedAt),
      stage: st ? st.name : null,
      stageSince: st ? st.sinceISO : null,
      stageSeconds: st ? secondsSince(st.sinceISO) : null,
      stageMeta: st ? st.meta : null,
    };
  });
  const queueView = queue.map((j, idx) => ({
    position: idx + 1,
    jobId: j.jobId,
    botId: j.botId,
    meta: j.meta, // ya sin createdBy
    enqueuedAt: j.enqueuedAt,
    waitingSeconds: secondsSince(j.enqueuedAt),
  }));
  const cap = capacitySnapshot();

  return {
    ok: true,
    timestamp: stamp,
    running: runningView,
    queue: queueView,
    summaryPorBot: summarizeByBot(),
    capacity: cap,
  };
}

module.exports = {
  // 202
  submit,
  getJob,

  // Admin
  cancel,
  listJobs,
  getMetrics,
  kick,

  // legacy
  enqueue,
  getStatus,

  // Expuestos para pruebas/inspección
  __state: { running, queue, durationsByBot, jobsById },
  __stage: { setJobStage, clearJobStage },

  // Utilidades exportadas por si se necesitan
  _internal: { avgDurationSeconds, capacitySnapshot, currentMaxConcurrency },
};

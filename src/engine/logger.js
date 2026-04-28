// src/engine/logger.js
// Logger estructurado, sin dependencias, JSON line-oriented o pretty.
// Schema cerrado: ver log-schema.md
//
// Campos automáticos: ts, severity, level, service, env, pid,
// y (si hay AsyncLocalStorage context) correlationId/jobId/botId.

const { getContext } = require("./log-context");

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const SEVERITY = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
};

const LOG_LEVEL = String(process.env.LOG_LEVEL || "info").toLowerCase();
const LOG_FORMAT = String(process.env.LOG_FORMAT || "json").toLowerCase(); // 'json' | 'pretty'
const SERVICE_NAME = process.env.SERVICE_NAME || "forusbots";
const ENV = process.env.NODE_ENV || "development";

const MAX_META_CHARS = Math.max(
  2000,
  parseInt(process.env.LOG_MAX_META_CHARS || "4000", 10)
);
const MAX_ERR_STACK_CHARS = Math.max(
  1000,
  parseInt(process.env.LOG_MAX_ERR_STACK_CHARS || "4000", 10)
);

function levelNum(lvl) {
  return LEVELS[lvl] ?? LEVELS.info;
}
function enabled(lvl) {
  return levelNum(lvl) >= levelNum(LOG_LEVEL);
}
function ts() {
  return new Date().toISOString();
}

function safeJson(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return JSON.stringify(String(obj));
  }
}

function truncateString(s, max) {
  if (typeof s !== "string") s = safeJson(s);
  if (s.length <= max) return s;
  return s.slice(0, max) + `…(+${s.length - max} chars)`;
}

function normalizeError(err) {
  if (!err) return null;
  const name = err.name || "Error";
  const message = err.message || String(err);
  let stack = err.stack || null;
  if (stack) stack = truncateString(String(stack), MAX_ERR_STACK_CHARS);
  return { name, message, stack };
}

function base(lvl) {
  return {
    ts: ts(),
    severity: SEVERITY[lvl] || "INFO",
    service: SERVICE_NAME,
    env: ENV,
    pid: process.pid,
  };
}

// ======== Auditoría (Firestore vía src/engine/audit.js) ========
// Lazy require para evitar ciclos en require-time (audit no debería re-llamar al logger).
const AUDIT_ENABLED = String(process.env.AUDIT_DB || "").trim() === "1";
let _audit = null;
function getAudit() {
  if (_audit) return _audit;
  try {
    _audit = require("./audit");
  } catch {
    _audit = null;
  }
  return _audit;
}

function forwardToAudit(rec) {
  if (!AUDIT_ENABLED) return;
  const a = getAudit();
  if (!a || typeof a.trackEvent !== "function") return;
  // fire-and-forget: no esperamos. audit.trackEvent ya captura sus errores.
  Promise.resolve()
    .then(() => a.trackEvent(rec))
    .catch(() => {
      // ya logueado dentro de audit; nada que hacer aquí.
    });
}

async function flushAudit() {
  // Firestore SDK no requiere flush explícito; las escrituras pendientes
  // se cierran al terminar el proceso. Conservamos la firma para compat.
}

// safeTruncateObj: SIEMPRE devuelve un objeto (truncando valores internos)
// para no romper consumidores que esperan estructura.
function safeTruncateObj(obj, maxChars) {
  if (obj == null || typeof obj !== "object") {
    return { value: truncateString(safeJson(obj), maxChars) };
  }
  try {
    const s = safeJson(obj);
    if (s.length <= maxChars) return obj;
  } catch {
    return { value: truncateString(String(obj), maxChars) };
  }
  // Truncar por campo manteniendo estructura.
  const out = Array.isArray(obj) ? [] : {};
  const perField = Math.max(200, Math.floor(maxChars / Math.max(1, Object.keys(obj).length || 1)));
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || typeof v !== "object") {
      const s = typeof v === "string" ? v : safeJson(v);
      out[k] = truncateString(s, perField);
    } else {
      out[k] = truncateString(safeJson(v), perField);
    }
  }
  out.__truncated = true;
  return out;
}

function prettyLine(rec) {
  const t = (rec.ts || "").slice(11, 19) || ts().slice(11, 19);
  const level = String(rec.level || "info").toUpperCase().padEnd(5, " ");
  const type = rec.type || "-";
  const skip = new Set([
    "ts",
    "severity",
    "service",
    "env",
    "pid",
    "level",
    "type",
  ]);
  const parts = [];
  // Aliases cortos
  const alias = {
    correlationId: "corr",
    jobId: "job",
    botId: "bot",
    durMs: "dur",
    status: "status",
    method: "method",
    path: "path",
  };
  for (const [k, v] of Object.entries(rec)) {
    if (skip.has(k)) continue;
    if (v == null) continue;
    const key = alias[k] || k;
    let val;
    if (typeof v === "object") val = safeJson(v);
    else val = String(v);
    if (val.length > 200) val = val.slice(0, 200) + "…";
    parts.push(`${key}=${val}`);
  }
  return `${t} ${level} ${type} ${parts.join(" ")}`.trimEnd();
}

function emit(obj, lvl = "info") {
  const ctx = getContext() || {};
  const rec = { ...base(lvl), level: lvl, ...ctx, ...obj };

  // Auditoría siempre (stub por ahora)
  forwardToAudit(rec);
  if (!enabled(lvl)) return;

  const line = LOG_FORMAT === "pretty" ? prettyLine(rec) : safeJson(rec);
  // Único punto de stdout/stderr permitido en el codebase (eslint override en .eslintrc).
  if (lvl === "error" || lvl === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

function event(obj, lvl = "info") {
  const rec = { ...obj };

  if (rec.meta != null) rec.meta = safeTruncateObj(rec.meta, MAX_META_CHARS);
  if (rec.details != null)
    rec.details = safeTruncateObj(rec.details, MAX_META_CHARS);

  if (rec.error && (rec.error.stack || typeof rec.error === "object")) {
    rec.error = normalizeError(rec.error);
  }

  emit(rec, lvl);
}

module.exports = {
  event,
  debug: (o) => event(o, "debug"),
  info: (o) => event(o, "info"),
  warn: (o) => event(o, "warn"),
  error: (o) => event(o, "error"),
  normalizeError,
  flushAudit,
};

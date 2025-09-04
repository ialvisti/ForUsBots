// src/engine/logger.js
// Logger minimalista, sin dependencias, con formato JSON line-oriented.
// Tipos de evento esperados: job.accepted, job.started, job.succeeded, job.failed,
// stage.start, stage.succeed, stage.fail, job.summary

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const LOG_LEVEL = String(process.env.LOG_LEVEL || "info").toLowerCase();
const LOG_FORMAT = String(process.env.LOG_FORMAT || "json").toLowerCase(); // 'json' | 'pretty'
const SERVICE_NAME = process.env.SERVICE_NAME || "forusbots";
const ENV = process.env.NODE_ENV || "development";
const AUDIT_ENABLED = /^(1|true|yes|on)$/i.test(
  String(process.env.AUDIT_DB || "0")
);

// límites suaves para evitar payloads gigantes
const MAX_META_CHARS = Math.max(
  2000,
  parseInt(process.env.LOG_MAX_META_CHARS || "4000", 10)
);
const MAX_ERR_STACK_CHARS = Math.max(
  1000,
  parseInt(process.env.LOG_MAX_ERR_STACK_CHARS || "4000", 10)
);

// Carga perezosa/segura del audit (no rompe si el archivo no existe)
let audit = null;
try {
  // Ruta relativa a este archivo
  audit = require("./audit");
} catch {
  audit = null;
}

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

function base() {
  return { ts: ts(), service: SERVICE_NAME, env: ENV, pid: process.pid };
}

// Intenta despachar al módulo de auditoría (si existe y está habilitado)
function forwardToAudit(rec) {
  if (!AUDIT_ENABLED || !audit) return;
  try {
    // Acepta varias firmas posibles para no romper compat:
    const fn =
      audit.onLogEvent ||
      audit.capture ||
      audit.record ||
      audit.logEvent ||
      audit.write ||
      audit.event ||
      audit.emit;

    if (typeof fn === "function") {
      fn.call(audit, rec);
    }
  } catch {
    // Nunca interrumpir el flujo de logging por fallos de auditoría
  }
}

function emit(obj, lvl = "info") {
  const rec = { ...base(), level: lvl, ...obj };
  if (!enabled(lvl)) return;

  if (LOG_FORMAT === "pretty") {
    const head = `[${rec.ts}] ${String(rec.level || "").toUpperCase()} ${
      rec.type || ""
    }`;
    try {
      // eslint-disable-next-line no-console
      console.log(`${head} ${safeJson(rec)}`);
    } catch {
      // eslint-disable-next-line no-console
      console.log(safeJson(rec));
    }
  } else {
    // JSON line estricto (ideal para ingesta)
    // eslint-disable-next-line no-console
    console.log(safeJson(rec));
  }

  // Enviar a auditoría (si procede) exactamente lo que emitimos
  forwardToAudit(rec);
}

function safeTruncateObj(obj, maxChars) {
  // Devuelve el objeto original si serializa chico;
  // si no, devuelve un string truncado (para no romper JSON.parse).
  try {
    const s = safeJson(obj);
    if (s.length <= maxChars) return obj;
    return truncateString(s, maxChars);
  } catch {
    return truncateString(String(obj), maxChars);
  }
}

function event(obj, lvl = "info") {
  // Truncado suave de meta/details si fueran enormes
  const rec = { ...obj };

  if (rec.meta != null) {
    const t = safeTruncateObj(rec.meta, MAX_META_CHARS);
    // Si es string (truncado), lo dejamos como string; si es objeto, lo dejamos objeto.
    rec.meta = t;
  }
  if (rec.details != null) {
    const t = safeTruncateObj(rec.details, MAX_META_CHARS);
    rec.details = t;
  }

  // Normalización de error si viniera crudo
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
};

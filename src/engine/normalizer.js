// src/engine/normalizer.js
//
// Produce un envelope canónico para TODOS los bots:
//
// {
//   ok: boolean,
//   code: string,             // ENUM estable (SNAKE_CASE)
//   message: string | null,   // resumen humano
//   data: object | null,      // payload normalizado por bot
//   warnings: array,
//   errors: array
// }
//
// Reglas:
// - No lanza: ante inputs raros, cae a un envelope genérico.
//
// Bots soportados explícitos:
// - forusall-search-participants
// - forusall-scrape-participant
// - forusall-emailtrigger
// - forusall-upload
// - forusall-mfa-reset
//
// Uso:
//   normalizeResultEnvelope(botId, okBoolean, rawResult, { error?: string }?)
//
function asArray(a) {
  if (!a) return [];
  return Array.isArray(a) ? a : [a];
}
function tidy(s) {
  if (s == null) return null;
  return String(s).trim();
}
function snake(s) {
  return String(s || "")
    .replace(/[^\w]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
}
function shallowClone(obj) {
  if (!obj || typeof obj !== "object") return obj ?? null;
  return { ...obj };
}

function normSearchParticipants(ok, raw, errCtx) {
  const r = raw || {};
  return {
    ok: !!(ok && r.ok !== false),
    code: ok && r.ok !== false ? "SEARCH_OK" : "SEARCH_ERROR",
    message: null,
    data: {
      targetUrl: r.targetUrl || r.url || null,
      criteria: r.criteriaEcho || null,
      pagination: r.pagination || null,
      count: typeof r.count === "number" ? r.count : (Array.isArray(r.rows) ? r.rows.length : null),
      rows: Array.isArray(r.rows) ? r.rows : [],
      evidencePath: r.evidencePath || null,
    },
    warnings: asArray(r.warnings),
    errors: asArray(r.errors || (errCtx && errCtx.error ? [errCtx.error] : [])),
  };
}

function normScrape(ok, raw, _errCtx) {
  const r = raw || {};
  return {
    ok: !!(ok && r.ok !== false),
    code: ok && r.ok !== false ? "SCRAPE_OK" : "SCRAPE_ERROR",
    message: null,
    data: {
      participantId: r.participantId || null,
      url: r.url || r.targetUrl || null,
      modulesRequested: r.modulesRequested || null,
      modules: Array.isArray(r.modules) ? r.modules : [],
      full: r.full || null,
    },
    warnings: asArray(r.warnings),
    errors: asArray(r.errors),
  };
}

function normEmailTrigger(ok, raw, _errCtx) {
  const r = raw || {};
  const result = String(r.result || (ok ? "Succeeded" : "Failed"));
  const lc = result.toLowerCase();
  let code = "EMAILTRIGGER_FAILED";
  let okFinal = false;
  if (lc.includes("succeed")) {
    code = "EMAILTRIGGER_OK";
    okFinal = true;
  } else if (lc.includes("empty")) {
    code = "EMAILTRIGGER_EMPTY_PLAN";
    okFinal = false;
  }
  return {
    ok: okFinal,
    code,
    message: tidy(r.reason) || null,
    data: r.details ? shallowClone(r.details) : null,
    warnings: [],
    errors: okFinal ? [] : (r.details ? [r.details] : []),
  };
}

function normUpload(ok, raw, errCtx) {
  const r = raw || {};
  const okFinal = !!(ok && r.ok !== false);
  return {
    ok: okFinal,
    code: okFinal ? "UPLOAD_OK" : "UPLOAD_ERROR",
    message: tidy(r.message) || (okFinal ? null : tidy(errCtx && errCtx.error) || "Upload failed"),
    data: okFinal
      ? {
          postSubmitResult: r.postSubmitResult || null,
          clearedSnapshot: r.clearedSnapshot || null,
          evidence: r.evidence || null,
        }
      : null,
    warnings: asArray(r.warnings),
    errors: okFinal ? [] : asArray(errCtx && errCtx.error),
  };
}

function normMfaReset(ok, raw, errCtx) {
  const r = raw || {};
  // Casuística:
  // - ok:true, mfa:true, reason ~ "successful"   -> MFA_RESET_OK
  // - ok:true, mfa:false                         -> MFA_NOT_ENROLLED
  // - ok:false / u otros                         -> MFA_RESET_ERROR
  let code = "MFA_RESET_ERROR";
  let okFinal = false;

  const reason = tidy(r.reason);
  const mfa = !!r.mfa;

  if (ok && mfa && reason && /success/i.test(reason)) {
    code = "MFA_RESET_OK";
    okFinal = true;
  } else if (ok && !mfa) {
    code = "MFA_NOT_ENROLLED";
    okFinal = true; // es un “ok” del flujo (no había nada que resetear)
  }

  return {
    ok: okFinal,
    code,
    message: reason || (okFinal ? null : tidy(errCtx && errCtx.error) || null),
    data: {
      participantId: r.participantId || null,
      confirmMessage: r.confirmMessage || null,
      alertMessage: r.alertMessage || null,
      evidencePath: r.evidencePath || null,
    },
    warnings: [],
    errors: okFinal ? [] : asArray(errCtx && errCtx.error),
  };
}

function normGeneric(ok, raw, errCtx) {
  // Intenta leer formas comunes
  if (raw && typeof raw === "object") {
    if (typeof raw.ok === "boolean") {
      const d = { ...raw };
      delete d.ok;
      const msg = typeof raw.message === "string" ? raw.message : null;
      delete d.message;
      const warnings = asArray(raw.warnings);
      delete d.warnings;
      const errors = asArray(raw.errors);
      delete d.errors;

      return {
        ok: ok && raw.ok !== false,
        code: ok && raw.ok !== false ? "OK" : "ERROR",
        message: msg,
        data: Object.keys(d).length ? d : null,
        warnings,
        errors: ok ? errors : (errors.length ? errors : (errCtx && errCtx.error ? [errCtx.error] : [])),
      };
    }
    if (typeof raw.result === "string") {
      const res = snake(raw.result);
      const okGuess = /SUCCEED|SUCCESS|OK/.test(res);
      return {
        ok: okGuess,
        code: res || (ok ? "OK" : "ERROR"),
        message: tidy(raw.reason) || null,
        data: raw.details ? shallowClone(raw.details) : shallowClone(raw),
        warnings: asArray(raw.warnings),
        errors: okGuess ? asArray(raw.errors) : asArray(raw.errors || (errCtx && errCtx.error)),
      };
    }
  }
  // Último recurso
  return {
    ok: !!ok,
    code: ok ? "OK" : "ERROR",
    message: tidy(errCtx && errCtx.error) || null,
    data: raw ?? null,
    warnings: [],
    errors: ok ? [] : asArray(errCtx && errCtx.error),
  };
}

function normalizeResultEnvelope(botId, ok, rawResult, errCtx) {
  const id = String(botId || "").toLowerCase();

  if (id === "forusall-search-participants")
    return normSearchParticipants(ok, rawResult, errCtx);

  if (id === "forusall-scrape-participant")
    return normScrape(ok, rawResult, errCtx);

  if (id === "forusall-emailtrigger")
    return normEmailTrigger(ok, rawResult, errCtx);

  if (id === "forusall-upload")
    return normUpload(ok, rawResult, errCtx);

  if (id === "forusall-mfa-reset")
    return normMfaReset(ok, rawResult, errCtx);

  // Fallback genérico para bots desconocidos
  return normGeneric(ok, rawResult, errCtx);
}

module.exports = { normalizeResultEnvelope };

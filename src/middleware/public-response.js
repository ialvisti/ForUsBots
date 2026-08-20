// src/middleware/public-response.js
//
// Convierte un job record interno (con stages, meta, createdBy, métricas, etc.)
// al shape público minimalista expuesto por GET /forusbot/jobs y /jobs/:id.
//
// Para el shape verbose (forensics, admin) ver /forusbot/admin/jobs-db/:id.

const { getFormatter } = require("./public-formatters");

function toPublicJob(record) {
  if (!record || typeof record !== "object") return record;

  const state = record.state;

  if (state === "queued" || state === "running" || state === "canceled") {
    return { state };
  }

  if (state === "failed") {
    const result = record.result || null;
    const shouldPreserveResultCode =
      result &&
      result.ok === false &&
      result.code &&
      (result.code === "DURABLE_STATE_FAILED" ||
        record.botId === "forusall-emailtrigger");
    const resultError =
      shouldPreserveResultCode
        ? {
            code: result.code,
            message: result.message || "Job failed",
          }
        : null;
    return {
      state,
      error: normalizePublicError(
        resultError ||
          record.error ||
          (result && result.errors && result.errors[0]) ||
          null
      ),
    };
  }

  if (state === "succeeded") {
    const result = record.result || null;
    const formatter = getFormatter(record.botId);
    const data = formatter
      ? formatter(result, record)
      : (result && result.data) || null;

    return {
      state,
      data,
      warnings: (result && result.warnings) || [],
      errors: (result && result.errors) || [],
    };
  }

  return { state: state || null };
}

function normalizePublicError(err) {
  if (!err) return { code: "UNKNOWN", message: "Job failed" };
  if (typeof err === "string") {
    return { code: "ERROR", message: err };
  }
  return {
    code: err.code || err.name || "ERROR",
    message: err.message || String(err),
  };
}

module.exports = { toPublicJob };

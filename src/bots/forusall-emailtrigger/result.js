"use strict";

const FAILED_CODE = "EMAILTRIGGER_FAILED";
const EMPTY_PLAN_CODE = "EMAILTRIGGER_EMPTY_PLAN";
const UNKNOWN_OUTCOME_CODE = "EMAILTRIGGER_UNKNOWN_OUTCOME";
const PUBLIC_SAR_FAILURE_MESSAGE =
  "SAR preview document verification failed";
const PUBLIC_SAR_FAILURE_CODES = Object.freeze([
  "SAR_DOCUMENT_EXPECTATION_INVALID",
  "SAR_DOCUMENT_GATE_FAILED",
  "SAR_DOCUMENT_GATE_NETWORK_FAILED",
  "SAR_DOCUMENT_VERIFIER_AUTH_FAILED",
  "SAR_DOCUMENT_VERIFIER_NOT_CONFIGURED",
  "SAR_DOCUMENT_VERIFIER_REJECTED",
  "SAR_DOCUMENT_VERIFIER_RESPONSE_INVALID",
  "SAR_PLAN_IDENTITY_FAILED",
  "SAR_PREVIEW_CONTEXT_MISMATCH",
  "SAR_PREVIEW_DOWNLOAD_FAILED",
  "SAR_PREVIEW_MANIFEST_CHANGED",
  "SAR_PREVIEW_MANIFEST_INVALID",
  "SAR_PREVIEW_MANIFEST_TOO_LARGE",
  "SAR_PREVIEW_OBJECT_CHANGED",
  "SAR_PREVIEW_OBJECT_METADATA_INVALID",
  "SAR_PREVIEW_PDF_INVALID",
  "SAR_PREVIEW_PDF_TOO_LARGE",
  "SAR_PREVIEW_REFERENCE_REJECTED",
  "SAR_PREVIEW_SELECTION_CHANGED",
  "SAR_PREVIEW_SELECTION_INVALID",
]);
const publicSarFailureCodeSet = new Set(PUBLIC_SAR_FAILURE_CODES);

function isPublicSarFailureCode(value) {
  return typeof value === "string" && publicSarFailureCodeSet.has(value);
}

function sanitizedSarFailure(error) {
  if (!isPublicSarFailureCode(error?.code)) return null;
  const sanitized = new Error(PUBLIC_SAR_FAILURE_MESSAGE);
  sanitized.name = "EmailTriggerFlowError";
  sanitized.code = error.code;
  return sanitized;
}

function createFlowError(result) {
  const status = String(result?.result || "Failed");
  const error = new Error(
    result?.reason ||
      (status === "Empty Plan"
        ? "No participants were found for the selected plan"
        : "Email trigger failed")
  );
  error.name = "EmailTriggerFlowError";
  error.code =
    status === "Empty Plan"
      ? EMPTY_PLAN_CODE
      : status === "Unknown Outcome"
      ? UNKNOWN_OUTCOME_CODE
      : FAILED_CODE;
  error.flowResult = status;
  if (result?.details !== undefined) error.details = result.details;
  return error;
}

function assertFlowSucceeded(result) {
  if (String(result?.result || "") === "Succeeded") return result;
  throw createFlowError(result);
}

function normalizeFlowError(error) {
  if (
    error &&
    (error.code === FAILED_CODE ||
      error.code === EMPTY_PLAN_CODE ||
      error.code === UNKNOWN_OUTCOME_CODE)
  ) {
    return error;
  }
  const safeSarFailure = sanitizedSarFailure(error);
  if (safeSarFailure) return safeSarFailure;
  return createFlowError({
    result: "Failed",
    reason: error?.message || String(error || "Email trigger failed"),
  });
}

module.exports = {
  EMPTY_PLAN_CODE,
  FAILED_CODE,
  PUBLIC_SAR_FAILURE_CODES,
  PUBLIC_SAR_FAILURE_MESSAGE,
  UNKNOWN_OUTCOME_CODE,
  assertFlowSucceeded,
  createFlowError,
  isPublicSarFailureCode,
  normalizeFlowError,
};

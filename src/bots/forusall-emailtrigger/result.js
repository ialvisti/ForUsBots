"use strict";

const FAILED_CODE = "EMAILTRIGGER_FAILED";
const EMPTY_PLAN_CODE = "EMAILTRIGGER_EMPTY_PLAN";
const UNKNOWN_OUTCOME_CODE = "EMAILTRIGGER_UNKNOWN_OUTCOME";
const PUBLIC_GENERIC_FAILURE_MESSAGE =
  "Email trigger failed before a confirmed send";
const PUBLIC_EMPTY_PLAN_MESSAGE =
  "No participants were found for the selected plan";
const PUBLIC_UNKNOWN_OUTCOME_MESSAGE =
  "Email trigger outcome could not be confirmed";
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
  "SAR_PLAN_NOT_AVAILABLE",
  "SAR_PLAN_IDENTITY_FAILED",
  "SAR_PORTAL_TRIGGER_REJECTED",
  "SAR_PREVIEW_CONTEXT_MISMATCH",
  "SAR_PREVIEW_DOWNLOAD_FAILED",
  "SAR_PREVIEW_FILENAME_MISMATCH",
  "SAR_PREVIEW_LOAD_TIMEOUT",
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
  "SAR_PREVIEW_TABLE_TIMEOUT",
  "SAR_TRIGGER_CONTRACT_MISMATCH",
  "SAR_TRIGGER_JAVASCRIPT_CONTRACT_MISMATCH",
]);
const publicSarFailureCodeSet = new Set(PUBLIC_SAR_FAILURE_CODES);
const PUBLIC_SAR_FAILURE_MESSAGES = Object.freeze({
  SAR_PLAN_NOT_AVAILABLE:
    "The plan ID is not available in the ForUsAll plan selector",
  SAR_PORTAL_TRIGGER_REJECTED:
    "ForUsAll returned an error instead of confirming the SAR email trigger",
  SAR_PREVIEW_FILENAME_MISMATCH:
    "A Preview filename does not match the expected SAR plan ID and report year",
  SAR_PREVIEW_LOAD_TIMEOUT:
    "The ForUsAll Preview page did not load before the timeout",
  SAR_PREVIEW_MANIFEST_CHANGED:
    "The Preview document set changed during validation",
  SAR_PREVIEW_MANIFEST_INVALID:
    "The Preview document list is incomplete or invalid",
  SAR_PREVIEW_SELECTION_CHANGED:
    "The Preview participant selection changed during validation",
  SAR_PREVIEW_SELECTION_INVALID:
    "The Preview participant selection is incomplete or ambiguous",
  SAR_PREVIEW_TABLE_TIMEOUT:
    "The Preview participant table did not finish loading before the timeout",
  SAR_TRIGGER_CONTRACT_MISMATCH:
    "The Trigger Email control does not match the approved portal contract",
  SAR_TRIGGER_JAVASCRIPT_CONTRACT_MISMATCH:
    "The Trigger Email JavaScript does not match the approved portal contract",
});

function isPublicSarFailureCode(value) {
  return typeof value === "string" && publicSarFailureCodeSet.has(value);
}

function publicSarFailureMessage(code) {
  return PUBLIC_SAR_FAILURE_MESSAGES[code] || PUBLIC_SAR_FAILURE_MESSAGE;
}

function sanitizedSarFailure(error) {
  if (!isPublicSarFailureCode(error?.code)) return null;
  const sanitized = new Error(publicSarFailureMessage(error.code));
  sanitized.name = "EmailTriggerFlowError";
  sanitized.code = error.code;
  return sanitized;
}

function createFlowError(result) {
  const status = String(result?.result || "Failed");
  const requestedCode =
    status === "Failed" && isPublicSarFailureCode(result?.code)
      ? result.code
      : null;
  const code =
    status === "Empty Plan"
      ? EMPTY_PLAN_CODE
      : status === "Unknown Outcome"
      ? UNKNOWN_OUTCOME_CODE
      : requestedCode || FAILED_CODE;
  const message =
    code === EMPTY_PLAN_CODE
      ? PUBLIC_EMPTY_PLAN_MESSAGE
      : code === UNKNOWN_OUTCOME_CODE
      ? PUBLIC_UNKNOWN_OUTCOME_MESSAGE
      : requestedCode
      ? publicSarFailureMessage(requestedCode)
      : PUBLIC_GENERIC_FAILURE_MESSAGE;
  const error = new Error(message);
  error.name = "EmailTriggerFlowError";
  error.code = code;
  error.flowResult = status;
  if (result?.details !== undefined) error.details = result.details;
  return error;
}

function assertFlowSucceeded(result) {
  if (String(result?.result || "") === "Succeeded") return result;
  throw createFlowError(result);
}

function normalizeFlowError(error) {
  const statusByCode = {
    [FAILED_CODE]: "Failed",
    [EMPTY_PLAN_CODE]: "Empty Plan",
    [UNKNOWN_OUTCOME_CODE]: "Unknown Outcome",
  };
  const knownStatus = error && statusByCode[error.code];
  if (knownStatus) {
    return createFlowError({
      result: knownStatus,
      details: error.details,
    });
  }
  const safeSarFailure = sanitizedSarFailure(error);
  if (safeSarFailure) return safeSarFailure;
  return createFlowError({
    result: "Failed",
  });
}

module.exports = {
  EMPTY_PLAN_CODE,
  FAILED_CODE,
  PUBLIC_EMPTY_PLAN_MESSAGE,
  PUBLIC_GENERIC_FAILURE_MESSAGE,
  PUBLIC_SAR_FAILURE_CODES,
  PUBLIC_SAR_FAILURE_MESSAGE,
  PUBLIC_SAR_FAILURE_MESSAGES,
  PUBLIC_UNKNOWN_OUTCOME_MESSAGE,
  UNKNOWN_OUTCOME_CODE,
  assertFlowSucceeded,
  createFlowError,
  isPublicSarFailureCode,
  normalizeFlowError,
  publicSarFailureMessage,
};

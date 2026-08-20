"use strict";

const FAILED_CODE = "EMAILTRIGGER_FAILED";
const EMPTY_PLAN_CODE = "EMAILTRIGGER_EMPTY_PLAN";
const UNKNOWN_OUTCOME_CODE = "EMAILTRIGGER_UNKNOWN_OUTCOME";

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
  return createFlowError({
    result: "Failed",
    reason: error?.message || String(error || "Email trigger failed"),
  });
}

module.exports = {
  EMPTY_PLAN_CODE,
  FAILED_CODE,
  UNKNOWN_OUTCOME_CODE,
  assertFlowSucceeded,
  createFlowError,
  normalizeFlowError,
};

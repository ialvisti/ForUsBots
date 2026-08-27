"use strict";

const MIN_REPORT_YEAR = 1900;
const MAX_REPORT_YEAR = 9999;
const SUMMARY_DOCUMENT_KIND = "summary_annual_report";
const FORUSALL_IDENTITY_SOURCE = "forusall_plan";
const EMAIL_TRIGGER_MODES = new Set(["send", "verify_only"]);

function previousUtcYear(now = new Date()) {
  const year = now instanceof Date ? now.getUTCFullYear() : NaN;
  if (!Number.isInteger(year)) {
    throw new TypeError("now must be a valid Date");
  }
  return year - 1;
}

function normalizeReportYear(value, { now = new Date() } = {}) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return previousUtcYear(now);
  }

  const text = String(value).trim();
  if (!/^\d{4}$/.test(text)) return null;

  const year = Number(text);
  if (
    !Number.isSafeInteger(year) ||
    year < MIN_REPORT_YEAR ||
    year > MAX_REPORT_YEAR
  ) {
    return null;
  }
  return year;
}

function buildEmailFingerprintPayload({
  planId,
  emailType,
  reportYear = null,
  participants = "all",
  mode = "send",
  expectedDocument = null,
  statement,
  sponsorQuarterly,
  onboardOrNewHire,
  genericEmail,
}) {
  const payload = {
    planId,
    emailType,
    reportYear,
    participants,
    mode,
  };

  if (expectedDocument) payload.expectedDocument = expectedDocument;

  if (emailType === "statement_notice") payload.statement = statement;
  if (emailType === "sponsor_quarterly_email") {
    payload.sponsorQuarterly = sponsorQuarterly;
  }
  if (
    emailType === "onboard_communications" ||
    emailType === "new_hire_communications"
  ) {
    payload.onboardOrNewHire = onboardOrNewHire;
  }
  if (emailType === "generic_email") payload.genericEmail = genericEmail;

  return payload;
}

function normalizeEmailTriggerMode(value) {
  const mode = String(value == null ? "send" : value)
    .trim()
    .toLowerCase();
  return EMAIL_TRIGGER_MODES.has(mode) ? mode : null;
}

function normalizeExpectedDocument(value, { planId, planYear } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const allowed = new Set([
    "schemaVersion",
    "kind",
    "planId",
    "planYear",
    "identitySource",
  ]);
  const keys = Object.keys(value);
  if (keys.length !== allowed.size || keys.some((key) => !allowed.has(key))) {
    return null;
  }

  const normalized = {
    schemaVersion: Number(value.schemaVersion),
    kind: String(value.kind || "").trim(),
    planId: Number(value.planId),
    planYear: Number(value.planYear),
    identitySource: String(value.identitySource || "").trim(),
  };
  if (
    normalized.schemaVersion !== 1 ||
    normalized.kind !== SUMMARY_DOCUMENT_KIND ||
    !Number.isSafeInteger(normalized.planId) ||
    normalized.planId <= 0 ||
    !Number.isSafeInteger(normalized.planYear) ||
    normalized.planYear < MIN_REPORT_YEAR ||
    normalized.planYear > MAX_REPORT_YEAR ||
    normalized.identitySource !== FORUSALL_IDENTITY_SOURCE ||
    normalized.planId !== Number(planId) ||
    normalized.planYear !== Number(planYear)
  ) {
    return null;
  }
  return normalized;
}

function assertSummaryPreviewUrl(value, { planId } = {}) {
  try {
    const url = new URL(String(value || ""));
    const planValues = url.searchParams.getAll("plan");
    const typeValues = url.searchParams.getAll("email_type");
    const participantValues = url.searchParams.getAll("participant_id");
    const userValues = url.searchParams.getAll("user_id");
    if (
      url.origin !== "https://employer.forusall.com" ||
      url.pathname !== "/preview" ||
      planValues.length !== 1 ||
      planValues[0] !== String(planId) ||
      typeValues.length !== 1 ||
      typeValues[0] !== "summary_annual_notice" ||
      participantValues.length !== 1 ||
      participantValues[0] !== "0" ||
      userValues.length !== 1 ||
      userValues[0] !== "0"
    ) {
      throw new Error("invalid preview context");
    }
    return true;
  } catch {
    const error = new Error("Preview page context did not match the selected SAR job");
    error.code = "SAR_PREVIEW_CONTEXT_MISMATCH";
    throw error;
  }
}

function getSearchParamMultimap(url) {
  const values = new Map();
  for (const [key, value] of url.searchParams) {
    const entries = values.get(key) || [];
    entries.push(value);
    values.set(key, entries);
  }
  return values;
}

function searchParamValuesMatch(expected, actual) {
  return (
    Array.isArray(expected) &&
    Array.isArray(actual) &&
    expected.length === actual.length &&
    expected.every((value, index) => value === actual[index])
  );
}

function assertSummaryTriggerUrl(previewValue, triggerValue, { planId } = {}) {
  try {
    assertSummaryPreviewUrl(previewValue, { planId });

    const previewUrl = new URL(String(previewValue || ""));
    const triggerUrl = new URL(String(triggerValue || ""), previewUrl);
    if (
      previewUrl.username ||
      previewUrl.password ||
      triggerUrl.username ||
      triggerUrl.password ||
      triggerUrl.origin !== previewUrl.origin ||
      triggerUrl.pathname !== previewUrl.pathname ||
      triggerUrl.hash !== previewUrl.hash
    ) {
      throw new Error("trigger URL location changed");
    }

    const previewParams = getSearchParamMultimap(previewUrl);
    const triggerParams = getSearchParamMultimap(triggerUrl);
    const previewForceSend = previewParams.get("force_send");
    const triggerForceSend = triggerParams.get("force_send");
    if (
      previewForceSend?.length !== 1 ||
      previewForceSend[0] !== "false" ||
      triggerForceSend?.length !== 1 ||
      triggerForceSend[0] !== "true" ||
      triggerParams.size !== previewParams.size
    ) {
      throw new Error("force_send mutation did not match");
    }

    for (const [key, expectedValues] of previewParams) {
      if (key === "force_send") continue;
      if (
        !searchParamValuesMatch(expectedValues, triggerParams.get(key))
      ) {
        throw new Error("trigger URL query changed");
      }
    }

    return true;
  } catch {
    const error = new Error(
      "Trigger Email URL did not match the verified SAR Preview context"
    );
    error.code = "SAR_TRIGGER_CONTRACT_MISMATCH";
    throw error;
  }
}

function validateSummaryAnnualFileName(fileName, reportYear, planId) {
  const value = String(fileName || "");
  const year = String(reportYear || "");
  const normalizedPlanId = Number(planId);
  const plan = String(normalizedPlanId);
  const hasSar = /(^|[^a-z0-9])sar([^a-z0-9]|$)/i.test(value);
  const hasReportYear =
    /^\d{4}$/.test(year) &&
    new RegExp(`(^|\\D)${year}(\\D|$)`).test(value);
  const hasPlanId =
    Number.isSafeInteger(normalizedPlanId) &&
    normalizedPlanId > 0 &&
    new RegExp(`(^|\\D)${plan}(\\D|$)`).test(value);

  return { hasSar, hasReportYear, hasPlanId };
}

module.exports = {
  FORUSALL_IDENTITY_SOURCE,
  SUMMARY_DOCUMENT_KIND,
  buildEmailFingerprintPayload,
  assertSummaryPreviewUrl,
  assertSummaryTriggerUrl,
  normalizeEmailTriggerMode,
  normalizeExpectedDocument,
  normalizeReportYear,
  previousUtcYear,
  validateSummaryAnnualFileName,
};

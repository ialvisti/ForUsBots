"use strict";

const MIN_REPORT_YEAR = 1900;
const MAX_REPORT_YEAR = 9999;
const SUMMARY_DOCUMENT_KIND = "summary_annual_report";
const FORUSALL_IDENTITY_SOURCE = "forusall_plan";
const EMAIL_TRIGGER_MODES = new Set(["send", "verify_only"]);
const SAFE_SUMMARY_QUERY_KEYS = new Set([
  "plan",
  "email_type",
  "participant_id",
  "user_id",
  "conversation_id",
  "attachments",
  "year",
  "quarter",
  "season",
  "divisions",
  "sponsor_qe_year",
  "sponsor_qe_quarter",
  "ca_note_subject",
  "ca_note_details",
  "ca_url",
  "quarterly_investment_review_url",
  "next_quarterly_investment_review_date",
  "next_quarterly_investment_review_time",
  "plan_snapshot",
  "enrolled",
  "not_enrolled",
  "ineligible",
  "terminated",
  "terminated_participants",
  "generic_comm_type",
  "force_send",
]);

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

function safeSummaryQueryDiff(previewParams, triggerParams) {
  const missingKeys = [];
  const extraKeys = [];
  const changedKeys = [];
  for (const key of SAFE_SUMMARY_QUERY_KEYS) {
    const previewValues = previewParams.get(key);
    const triggerValues = triggerParams.get(key);
    if (previewValues && !triggerValues) missingKeys.push(key);
    else if (!previewValues && triggerValues) extraKeys.push(key);
    else if (
      key !== "force_send" &&
      previewValues &&
      triggerValues &&
      !searchParamValuesMatch(previewValues, triggerValues)
    ) {
      changedKeys.push(key);
    }
  }
  return {
    previewParameterCount: previewParams.size,
    triggerParameterCount: triggerParams.size,
    missingKeys,
    extraKeys,
    changedKeys,
  };
}

function inspectSummaryTriggerUrl(previewValue, triggerValue, { planId } = {}) {
  let previewUrl;
  let triggerUrl;
  try {
    assertSummaryPreviewUrl(previewValue, { planId });
    previewUrl = new URL(String(previewValue || ""));
  } catch {
    return { matched: false, failureCode: "preview_context_invalid" };
  }
  try {
    if (
      !(
        triggerValue instanceof URL ||
        (typeof triggerValue === "string" && triggerValue.trim())
      )
    ) {
      throw new Error("missing trigger URL");
    }
    triggerUrl = new URL(String(triggerValue), previewUrl);
  } catch {
    return { matched: false, failureCode: "trigger_url_invalid" };
  }
  if (
    previewUrl.username ||
    previewUrl.password ||
    triggerUrl.username ||
    triggerUrl.password ||
    triggerUrl.origin !== previewUrl.origin ||
    triggerUrl.pathname !== previewUrl.pathname ||
    triggerUrl.hash !== previewUrl.hash
  ) {
    return { matched: false, failureCode: "trigger_location_changed" };
  }

  const previewParams = getSearchParamMultimap(previewUrl);
  const triggerParams = getSearchParamMultimap(triggerUrl);
  const safeDiff = safeSummaryQueryDiff(previewParams, triggerParams);
  const previewForceSend = previewParams.get("force_send");
  const triggerForceSend = triggerParams.get("force_send");
  if (
    previewForceSend?.length !== 1 ||
    previewForceSend[0] !== "false" ||
    triggerForceSend?.length !== 1 ||
    triggerForceSend[0] !== "true"
  ) {
    return {
      matched: false,
      failureCode: "force_send_mismatch",
      ...safeDiff,
    };
  }
  if (triggerParams.size !== previewParams.size) {
    return {
      matched: false,
      failureCode: "query_shape_changed",
      ...safeDiff,
    };
  }
  for (const [key, expectedValues] of previewParams) {
    if (key === "force_send") continue;
    if (!searchParamValuesMatch(expectedValues, triggerParams.get(key))) {
      return {
        matched: false,
        failureCode: "query_value_changed",
        ...safeDiff,
      };
    }
  }
  return { matched: true, failureCode: null };
}

function assertSummaryTriggerUrl(previewValue, triggerValue, options = {}) {
  const diagnostic = inspectSummaryTriggerUrl(
    previewValue,
    triggerValue,
    options
  );
  if (diagnostic.matched) return true;
  const error = new Error(
    "Trigger Email URL did not match the verified SAR Preview context"
  );
  error.code = "SAR_TRIGGER_CONTRACT_MISMATCH";
  error.safeDiagnostic = diagnostic;
  throw error;
}

function assertSummaryJavascriptTriggerUrl(
  previewValue,
  triggerValue,
  { planId } = {}
) {
  try {
    assertSummaryPreviewUrl(previewValue, { planId });
    const previewUrl = new URL(String(previewValue || ""));
    if (typeof triggerValue !== "string" || !triggerValue.trim()) {
      throw new Error("missing trigger URL");
    }
    const triggerUrl = new URL(triggerValue, previewUrl);
    if (
      previewUrl.username ||
      previewUrl.password ||
      triggerUrl.username ||
      triggerUrl.password ||
      triggerUrl.origin !== previewUrl.origin ||
      triggerUrl.pathname !== previewUrl.pathname ||
      triggerUrl.search !== "" ||
      triggerUrl.hash !== ""
    ) {
      throw new Error("JavaScript trigger anchor location changed");
    }
    return true;
  } catch {
    const error = new Error(
      "Trigger Email JavaScript anchor did not match the verified SAR Preview context"
    );
    error.code = "SAR_TRIGGER_JAVASCRIPT_CONTRACT_MISMATCH";
    throw error;
  }
}

function validateSummaryAnnualFileName(fileName, reportYear, planId) {
  const value = String(fileName || "");
  const year = String(reportYear || "");
  const normalizedPlanId = Number(planId);
  const plan = String(normalizedPlanId);
  const hasSar =
    /(^|[^a-z0-9])sar([^a-z0-9]|$)/i.test(value) ||
    /(^|[^a-z0-9])summary[^a-z0-9]+annual[^a-z0-9]+report([^a-z0-9]|$)/i.test(
      value
    );
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
  assertSummaryJavascriptTriggerUrl,
  assertSummaryTriggerUrl,
  inspectSummaryTriggerUrl,
  normalizeEmailTriggerMode,
  normalizeExpectedDocument,
  normalizeReportYear,
  previousUtcYear,
  validateSummaryAnnualFileName,
};

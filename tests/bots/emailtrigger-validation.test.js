const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildEmailFingerprintPayload,
  assertSummaryPreviewUrl,
  normalizeEmailTriggerMode,
  normalizeExpectedDocument,
  normalizeReportYear,
  validateSummaryAnnualFileName,
} = require("../../src/bots/forusall-emailtrigger/validation");

test("summary annual reportYear defaults to the previous UTC year", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(normalizeReportYear(undefined, { now }), 2025);
  assert.equal(normalizeReportYear("", { now }), 2025);
  assert.equal(normalizeReportYear("2024", { now }), 2024);
});

test("Preview URL is bound to plan, email type and All participant/user context", () => {
  assert.equal(
    assertSummaryPreviewUrl(
      "https://employer.forusall.com/preview?plan=627&email_type=summary_annual_notice&participant_id=0&user_id=0&year=2026",
      { planId: 627 }
    ),
    true
  );
  for (const value of [
    "https://employer.forusall.com/preview?plan=628&email_type=summary_annual_notice&participant_id=0&user_id=0",
    "https://employer.forusall.com/preview?plan=627&email_type=year_end_notice&participant_id=0&user_id=0",
    "https://employer.forusall.com/preview?plan=627&email_type=summary_annual_notice&participant_id=1&user_id=0",
    "https://evil.example/preview?plan=627&email_type=summary_annual_notice&participant_id=0&user_id=0",
  ]) {
    assert.throws(
      () => assertSummaryPreviewUrl(value, { planId: 627 }),
      { code: "SAR_PREVIEW_CONTEXT_MISMATCH" }
    );
  }
});

test("summary annual reportYear rejects malformed years", () => {
  for (const value of ["24", "2025.5", "year-2025", 0, 10000]) {
    assert.equal(normalizeReportYear(value), null);
  }
});

test("SAR filename validation binds numeric plan id and report year tokens", () => {
  assert.deepEqual(
    validateSummaryAnnualFileName("Acme_627_401k_SAR_2025.pdf", 2025, 627),
    { hasSar: true, hasReportYear: true, hasPlanId: true }
  );
  assert.deepEqual(
    validateSummaryAnnualFileName("Acme_627_SARAH_2025.pdf", 2025, 627),
    { hasSar: false, hasReportYear: true, hasPlanId: true }
  );
  assert.deepEqual(
    validateSummaryAnnualFileName("Acme_627_SAR_2024.pdf", 2025, 627),
    { hasSar: true, hasReportYear: false, hasPlanId: true }
  );
  assert.deepEqual(
    validateSummaryAnnualFileName("Acme_1627_SAR_2025.pdf", 2025, 627),
    { hasSar: true, hasReportYear: true, hasPlanId: false }
  );
});

test("fingerprint includes normalized common and only relevant conditional payload", () => {
  const statement = { year: 2025, quarter: 1, season: "Q1" };
  assert.deepEqual(
    buildEmailFingerprintPayload({
      planId: 627,
      emailType: "statement_notice",
      reportYear: null,
      participants: "all",
      mode: "send",
      statement,
      sponsorQuarterly: { ignored: true },
      genericEmail: { ignored: true },
    }),
    {
      planId: 627,
      emailType: "statement_notice",
      reportYear: null,
      participants: "all",
      mode: "send",
      statement,
    }
  );
});

test("email trigger mode is strict and defaults to send", () => {
  assert.equal(normalizeEmailTriggerMode(undefined), "send");
  assert.equal(normalizeEmailTriggerMode("verify_only"), "verify_only");
  assert.equal(normalizeEmailTriggerMode("dry-run"), null);
});

test("expected SAR document descriptor must match top-level plan and year", () => {
  const value = {
    schemaVersion: 1,
    kind: "summary_annual_report",
    planId: 627,
    planYear: 2025,
    identitySource: "forusall_plan",
  };
  assert.deepEqual(
    normalizeExpectedDocument(value, { planId: 627, planYear: 2025 }),
    value
  );
  assert.equal(
    normalizeExpectedDocument(
      { ...value, planId: 628 },
      { planId: 627, planYear: 2025 }
    ),
    null
  );
  assert.equal(
    normalizeExpectedDocument(
      { ...value, planNames: ["Caller or Jira alias"] },
      { planId: 627, planYear: 2025 }
    ),
    null
  );
});

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildEmailFingerprintPayload,
  assertSummaryPreviewUrl,
  assertSummaryJavascriptTriggerUrl,
  assertSummaryTriggerUrl,
  inspectSummaryTriggerUrl,
  normalizeEmailTriggerMode,
  normalizeExpectedDocument,
  normalizeReportYear,
  validateSummaryAnnualFileName,
} = require("../../src/bots/forusall-emailtrigger/validation");

const SUMMARY_PREVIEW_URL =
  "https://employer.forusall.com/preview?plan=627&email_type=summary_annual_notice&participant_id=0&user_id=0&conversation_id=&attachments=null&year=2026&divisions=0&force_send=false";

function summaryTriggerUrl(mutator = () => {}) {
  const url = new URL(SUMMARY_PREVIEW_URL);
  url.searchParams.set("force_send", "true");
  mutator(url);
  return url.toString();
}

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

test("Trigger URL is the canonical Preview query with only force_send enabled", () => {
  const trigger = new URL(summaryTriggerUrl());
  trigger.search = new URLSearchParams(
    [...trigger.searchParams.entries()].reverse()
  ).toString();

  assert.equal(
    assertSummaryTriggerUrl(SUMMARY_PREVIEW_URL, trigger.toString(), {
      planId: 627,
    }),
    true
  );
  assert.equal(
    assertSummaryTriggerUrl(
      SUMMARY_PREVIEW_URL,
      `${trigger.pathname}?${trigger.searchParams.toString()}`,
      { planId: 627 }
    ),
    true
  );
  assert.equal(
    assertSummaryTriggerUrl(
      SUMMARY_PREVIEW_URL,
      `//employer.forusall.com:443${trigger.pathname}?${trigger.searchParams.toString()}`,
      { planId: 627 }
    ),
    true
  );
});

test("Trigger URL compares decoded multimaps while preserving duplicate value order", () => {
  const preview =
    "https://employer.forusall.com/preview?plan=627&email_type=summary_annual_notice&participant_id=0&user_id=0&division=west&division=east&note=Acme+Plan&object=a%2Fb&force_send=false#review";
  const equivalentRelativeTrigger =
    "/preview?division=west&division=east&object=a%2fb&%66orce_send=%74rue&user_id=0&participant_id=0&email_type=summary_annual_notice&plan=627&note=Acme%20Plan#review";

  assert.equal(
    assertSummaryTriggerUrl(preview, equivalentRelativeTrigger, {
      planId: 627,
    }),
    true
  );

  const reorderedDuplicateValues = equivalentRelativeTrigger.replace(
    "division=west&division=east",
    "division=east&division=west"
  );
  assert.throws(
    () =>
      assertSummaryTriggerUrl(preview, reorderedDuplicateValues, {
        planId: 627,
      }),
    { code: "SAR_TRIGGER_CONTRACT_MISMATCH" }
  );
});

test("JavaScript trigger anchor is a no-query link on the exact verified Preview", () => {
  assert.equal(
    assertSummaryJavascriptTriggerUrl(SUMMARY_PREVIEW_URL, "/preview", {
      planId: 627,
    }),
    true
  );
  for (const value of [
    "/preview?force_send=true",
    "/trigger_email_process",
    "https://evil.example/preview",
    "https://employer.forusall.com:444/preview",
    "/preview#changed",
    null,
    "",
  ]) {
    assert.throws(
      () =>
        assertSummaryJavascriptTriggerUrl(SUMMARY_PREVIEW_URL, value, {
          planId: 627,
        }),
      { code: "SAR_TRIGGER_JAVASCRIPT_CONTRACT_MISMATCH" }
    );
  }
});

test("Trigger URL rejects context drift, missing, extra and duplicate parameters", () => {
  const invalidTriggers = [
    summaryTriggerUrl((url) => url.searchParams.set("plan", "628")),
    summaryTriggerUrl((url) =>
      url.searchParams.set("email_type", "year_end_notice")
    ),
    summaryTriggerUrl((url) => url.searchParams.set("participant_id", "1")),
    summaryTriggerUrl((url) => url.searchParams.set("user_id", "1")),
    summaryTriggerUrl((url) => url.searchParams.delete("year")),
    summaryTriggerUrl((url) => url.searchParams.set("unexpected", "value")),
    `${summaryTriggerUrl()}&plan=627`,
    `${summaryTriggerUrl()}&year=2026`,
    summaryTriggerUrl((url) => url.searchParams.set("conversation_id", "changed")),
    summaryTriggerUrl((url) => url.searchParams.set("force_send", "false")),
    summaryTriggerUrl((url) => url.searchParams.set("force_send", "TRUE")),
    summaryTriggerUrl((url) => {
      url.searchParams.delete("force_send");
      url.searchParams.set("Force_Send", "true");
    }),
    summaryTriggerUrl((url) => {
      url.searchParams.delete("plan");
      url.searchParams.set("Plan", "627");
    }),
    summaryTriggerUrl((url) => url.searchParams.delete("force_send")),
    `${summaryTriggerUrl()}&force_send=true`,
    summaryTriggerUrl((url) => {
      url.hostname = "evil.example";
    }),
    summaryTriggerUrl((url) => {
      url.protocol = "http:";
    }),
    summaryTriggerUrl((url) => {
      url.port = "444";
    }),
    summaryTriggerUrl((url) => {
      url.pathname = "/trigger_emails";
    }),
    summaryTriggerUrl((url) => {
      url.username = "attacker";
    }),
    summaryTriggerUrl().replace(
      "https://employer.forusall.com",
      "//evil.example"
    ),
    `${summaryTriggerUrl()}#changed`,
    null,
    "",
    "javascript:alert(1)",
  ];

  for (const trigger of invalidTriggers) {
    assert.throws(
      () =>
        assertSummaryTriggerUrl(SUMMARY_PREVIEW_URL, trigger, { planId: 627 }),
      { code: "SAR_TRIGGER_CONTRACT_MISMATCH" }
    );
  }
});

test("Trigger URL rejects an ambiguous or already-enabled Preview context", () => {
  for (const preview of [
    SUMMARY_PREVIEW_URL.replace("&force_send=false", ""),
    SUMMARY_PREVIEW_URL.replace("force_send=false", "force_send=true"),
    `${SUMMARY_PREVIEW_URL}&force_send=false`,
    `${SUMMARY_PREVIEW_URL}&year=2026`,
  ]) {
    assert.throws(
      () => assertSummaryTriggerUrl(preview, summaryTriggerUrl(), { planId: 627 }),
      { code: "SAR_TRIGGER_CONTRACT_MISMATCH" }
    );
  }
});

test("Trigger URL diagnostics expose only fixed codes, counts and allowlisted keys", () => {
  const trigger = summaryTriggerUrl((url) => {
    url.searchParams.delete("conversation_id");
    url.searchParams.set("ca_note_subject", "sensitive value must not escape");
    url.searchParams.set("unexpected_secret_name", "secret value");
  });
  const diagnostic = inspectSummaryTriggerUrl(SUMMARY_PREVIEW_URL, trigger, {
    planId: 627,
  });

  assert.equal(diagnostic.matched, false);
  assert.equal(diagnostic.failureCode, "query_shape_changed");
  assert.deepEqual(diagnostic.missingKeys, ["conversation_id"]);
  assert.deepEqual(diagnostic.changedKeys, []);
  assert.equal(diagnostic.extraKeys.includes("unexpected_secret_name"), false);
  assert.doesNotMatch(JSON.stringify(diagnostic), /sensitive|secret value/);
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
  assert.deepEqual(
    validateSummaryAnnualFileName(
      "Summary_Annual_Report_Acme_2025.pdf",
      2025,
      627
    ),
    { hasSar: true, hasReportYear: true, hasPlanId: false }
  );
  assert.deepEqual(
    validateSummaryAnnualFileName("Annual_Report_Acme_2025.pdf", 2025, 627),
    { hasSar: false, hasReportYear: true, hasPlanId: false }
  );
  for (const fileName of [
    "Summary_Annual_Reporting_Acme_627_2025.pdf",
    "Summary_X_Annual_Report_Acme_627_2025.pdf",
    "Annual_Summary_Report_Acme_627_2025.pdf",
  ]) {
    assert.deepEqual(validateSummaryAnnualFileName(fileName, 2025, 627), {
      hasSar: false,
      hasReportYear: true,
      hasPlanId: true,
    });
  }
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

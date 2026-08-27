const test = require("node:test");
const assert = require("node:assert/strict");

const idempotencyPath = require.resolve("../../src/engine/idempotency");
const submissions = [];
let nextError = null;
let nextResult = null;

require.cache[idempotencyPath] = {
  id: idempotencyPath,
  filename: idempotencyPath,
  loaded: true,
  exports: {
    submitIdempotently: async (input) => {
      submissions.push(input);
      if (nextError) throw nextError;
      return nextResult;
    },
    toIdempotencyHttpError: (error) => error.httpError || null,
  },
};

const controller = require("../../src/bots/forusall-emailtrigger/controller");

const EXPECTED_DOCUMENT = Object.freeze({
  schemaVersion: 1,
  kind: "summary_annual_report",
  planId: 627,
  planYear: 2025,
  identitySource: "forusall_plan",
});

function request(body, idempotencyKey, { replayOnly } = {}) {
  return {
    body,
    auth: {
      principalId: "a".repeat(64),
      account: {
        alias: "sar-service",
        siteUser: "sar@example.test",
        sitePass: "secret",
        totpSecret: "AAAA",
      },
    },
    get(name) {
      if (name.toLowerCase() === "idempotency-key") return idempotencyKey;
      if (name.toLowerCase() === "idempotency-replay-only") return replayOnly;
      return undefined;
    },
  };
}

function response() {
  const output = { status: null, body: null, headers: {} };
  return {
    output,
    status(code) {
      output.status = code;
      return this;
    },
    set(name, value) {
      output.headers[name] = value;
      return this;
    },
    json(body) {
      output.body = body;
      return this;
    },
  };
}

test.beforeEach(() => {
  process.env.SAR_DOCUMENT_GATE_ENABLED = "true";
  process.env.SAR_DOCUMENT_VERIFIER_URL =
    "https://sar-verifier-example.run.app";
  delete process.env.SAR_DOCUMENT_VERIFIER_AUDIENCE;
  submissions.length = 0;
  nextError = null;
  nextResult = {
    ok: true,
    jobId: "00000000-0000-4000-8000-000000000200",
    acceptedAt: "2026-08-19T12:00:00.000Z",
    queuePosition: 1,
    estimate: null,
    capacitySnapshot: null,
    replayed: false,
  };
});

test("email-trigger passes normalized SAR input to durable idempotency", async () => {
  const res = response();
  await controller(
    request(
      {
        planId: "627",
        emailType: "summary_annual_notice",
        reportYear: "2025",
        expectedDocument: EXPECTED_DOCUMENT,
      },
      "jira-sar-key-2025"
    ),
    res
  );

  assert.equal(res.output.status, 202);
  assert.equal(res.output.headers["Idempotency-Replayed"], "false");
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].idempotencyKey, "jira-sar-key-2025");
  assert.equal(submissions[0].principalId, "a".repeat(64));
  assert.equal(submissions[0].botId, "forusall-emailtrigger");
  assert.deepEqual(submissions[0].fingerprintPayload, {
    planId: 627,
    emailType: "summary_annual_notice",
    reportYear: 2025,
    participants: "all",
    mode: "send",
    expectedDocument: EXPECTED_DOCUMENT,
  });
  assert.equal(submissions[0].meta.reportYear, 2025);
});

test("email-trigger reports durable replay without a second identity", async () => {
  nextResult = {
    ...nextResult,
    replayed: true,
    queuePosition: null,
    estimate: null,
    capacitySnapshot: null,
  };
  const res = response();
  await controller(
    request(
      {
        planId: 627,
        emailType: "summary_annual_notice",
        reportYear: 2025,
        expectedDocument: EXPECTED_DOCUMENT,
      },
      "jira-sar-replay-2025"
    ),
    res
  );

  assert.equal(res.output.status, 202);
  assert.equal(res.output.headers["Idempotency-Replayed"], "true");
  assert.equal(
    res.output.headers.Location,
    "/forusbot/jobs/00000000-0000-4000-8000-000000000200"
  );
  assert.equal(res.output.body.queuePosition, null);
});

test("SAR recovery passes replay-only into the atomic durable reservation", async () => {
  nextResult = {
    ...nextResult,
    replayed: true,
    queuePosition: null,
    estimate: null,
    capacitySnapshot: null,
  };
  const res = response();
  await controller(
    request(
      {
        planId: 627,
        emailType: "summary_annual_notice",
        reportYear: 2025,
        expectedDocument: EXPECTED_DOCUMENT,
      },
      "jira-sar-replay-only-2025",
      { replayOnly: "true" }
    ),
    res
  );

  assert.equal(res.output.status, 202);
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].replayOnly, true);
  assert.equal(res.output.headers["Idempotency-Replayed"], "true");
});

test("malformed replay-only header is rejected before durable reservation", async () => {
  const res = response();
  await controller(
    request(
      {
        planId: 627,
        emailType: "summary_annual_notice",
        reportYear: 2025,
        expectedDocument: EXPECTED_DOCUMENT,
      },
      "jira-sar-bad-replay-only",
      { replayOnly: "yes" }
    ),
    res
  );

  assert.equal(res.output.status, 400);
  assert.equal(submissions.length, 0);
});

test("email-trigger maps a durable conflict to 409", async () => {
  nextError = {
    httpError: {
      status: 409,
      body: { ok: false, error: "idempotency_conflict" },
    },
  };
  const res = response();
  await controller(
    request(
      {
        planId: 627,
        emailType: "summary_annual_notice",
        reportYear: 2025,
        expectedDocument: EXPECTED_DOCUMENT,
      },
      "jira-sar-conflict"
    ),
    res
  );

  assert.equal(res.output.status, 409);
  assert.deepEqual(res.output.body, {
    ok: false,
    error: "idempotency_conflict",
  });
});

test("summary annual defaults reportYear before fingerprinting", async () => {
  const res = response();
  await controller(
    request(
      {
        planId: 627,
        emailType: "summary_annual_notice",
        expectedDocument: EXPECTED_DOCUMENT,
      },
      "jira-sar-default-year"
    ),
    res
  );

  const expected = new Date().getUTCFullYear() - 1;
  assert.equal(submissions[0].fingerprintPayload.reportYear, expected);
  assert.equal(submissions[0].meta.reportYear, expected);
});

test("conditional email payload is normalized before fingerprinting", async () => {
  const res = response();
  await controller(
    request(
      {
        planId: "627",
        emailType: "statement_notice",
        statement: { year: "2025", quarter: "1", season: "Q1" },
      },
      "statement-notice-key"
    ),
    res
  );

  assert.deepEqual(submissions[0].fingerprintPayload, {
    planId: 627,
    emailType: "statement_notice",
    reportYear: null,
    participants: "all",
    mode: "send",
    statement: { year: 2025, quarter: 1, season: "Q1" },
  });
});

test("summary annual rejects a missing expectedDocument before reservation", async () => {
  const res = response();
  await controller(
    request(
      { planId: 627, emailType: "summary_annual_notice", reportYear: 2025 },
      "missing-document-expectation"
    ),
    res
  );

  assert.equal(res.output.status, 400);
  assert.match(res.output.body.error, /expectedDocument/);
  assert.equal(submissions.length, 0);
});

test("summary annual rejects work when the document gate is disabled", async () => {
  process.env.SAR_DOCUMENT_GATE_ENABLED = "false";
  const res = response();
  await controller(
    request(
      {
        planId: 627,
        emailType: "summary_annual_notice",
        reportYear: 2025,
        expectedDocument: EXPECTED_DOCUMENT,
      },
      "disabled-document-gate"
    ),
    res
  );

  assert.equal(res.output.status, 503);
  assert.equal(submissions.length, 0);
});

test("verify_only and expectedDocument are part of the durable fingerprint", async () => {
  const res = response();
  await controller(
    request(
      {
        planId: 627,
        emailType: "summary_annual_notice",
        reportYear: 2025,
        mode: "verify_only",
        expectedDocument: EXPECTED_DOCUMENT,
      },
      "verify-only-document-gate"
    ),
    res
  );

  assert.equal(res.output.status, 202);
  assert.equal(submissions[0].fingerprintPayload.mode, "verify_only");
  assert.deepEqual(
    submissions[0].fingerprintPayload.expectedDocument,
    EXPECTED_DOCUMENT
  );
  assert.equal(submissions[0].meta.mode, "verify_only");
});

test("a verify-only token cannot submit a send job", async () => {
  const req = request(
    {
      planId: 627,
      emailType: "summary_annual_notice",
      reportYear: 2025,
      mode: "send",
      expectedDocument: EXPECTED_DOCUMENT,
    },
    "verify-only-token-send"
  );
  req.auth.tokenMeta = { allowedEmailTriggerModes: ["verify_only"] };
  const res = response();
  await controller(req, res);

  assert.equal(res.output.status, 403);
  assert.equal(submissions.length, 0);
});

test("absence of a token mode allowlist keeps backward compatibility", async () => {
  const res = response();
  await controller(
    request(
      {
        planId: 627,
        emailType: "summary_annual_notice",
        reportYear: 2025,
        mode: "send",
        expectedDocument: EXPECTED_DOCUMENT,
      },
      "legacy-token-send-mode"
    ),
    res
  );

  assert.equal(res.output.status, 202);
  assert.equal(submissions.length, 1);
});

test("invalid summary annual reportYear is rejected before reservation", async () => {
  const res = response();
  await controller(
    request(
      {
        planId: 627,
        emailType: "summary_annual_notice",
        reportYear: "20x5",
      },
      "invalid-report-year"
    ),
    res
  );

  assert.equal(res.output.status, 400);
  assert.match(res.output.body.error, /reportYear/);
  assert.equal(submissions.length, 0);
});

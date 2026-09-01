const test = require("node:test");
const assert = require("node:assert/strict");

const log = require("../../src/engine/logger");
const originalEvent = log.event;
const originalError = log.error;
log.event = () => {};
log.error = () => {};

const queue = require("../../src/engine/queue");
const { toPublicJob } = require("../../src/middleware/public-response");
const {
  assertFlowSucceeded,
  normalizeFlowError,
} = require("../../src/bots/forusall-emailtrigger/result");

const ACCOUNT = Object.freeze({
  alias: "email-semantics-test",
  siteUser: "email@example.test",
  sitePass: "secret",
  totpSecret: "AAAA",
});

test.after(() => {
  log.event = originalEvent;
  log.error = originalError;
});

async function waitForJob(jobId) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const job = queue.getJob(jobId);
    if (job && ["succeeded", "failed"].includes(job.state)) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("email-trigger job did not reach a terminal state");
}

test("SAR gate failures expose only an allowlisted code and fixed message", async () => {
  const source = new Error("FORUS 401(K), EIN 12-3456789, OCR text");
  source.code = "SAR_DOCUMENT_VERIFIER_REJECTED";
  source.details = {
    planName: "FORUS 401(K)",
    ein: "12-3456789",
    ocrText: "private OCR text",
  };

  const accepted = queue.submit({
    botId: "forusall-emailtrigger",
    meta: {
      planId: 74,
      emailType: "summary_annual_notice",
      reportYear: 2025,
    },
    account: ACCOUNT,
    run: async () => {
      throw normalizeFlowError(source);
    },
  });

  const job = await waitForJob(accepted.jobId);
  assert.equal(job.state, "failed");
  assert.equal(job.result.code, "SAR_DOCUMENT_VERIFIER_REJECTED");
  assert.equal(job.result.data, null);
  assert.deepEqual(job.result.errors, [
    "SAR preview document verification failed",
  ]);
  const publicJob = toPublicJob(job);
  assert.deepEqual(publicJob, {
    state: "failed",
    error: {
      code: "SAR_DOCUMENT_VERIFIER_REJECTED",
      message: "SAR preview document verification failed",
    },
  });
  assert.doesNotMatch(
    JSON.stringify({ result: job.result, publicJob }),
    /FORUS|123456789|private OCR/
  );
});

test("unknown SAR-like codes are not promoted into the public code contract", () => {
  const source = new Error("Plan name, EIN 12-3456789 and private stack");
  source.code = "SAR_NEW_UNREVIEWED_FAILURE";
  const normalized = normalizeFlowError(source);
  assert.equal(normalized.code, "EMAILTRIGGER_FAILED");
  assert.equal(
    normalized.message,
    "Email trigger failed before a confirmed send"
  );
  assert.doesNotMatch(normalized.message, /Plan name|123456789|stack/);
});

for (const scenario of [
  {
    code: "SAR_PLAN_NOT_AVAILABLE",
    message: "The plan ID is not available in the ForUsAll plan selector",
  },
  {
    code: "SAR_PREVIEW_FILENAME_MISMATCH",
    message:
      "A Preview filename does not match the expected SAR plan ID and report year",
  },
  {
    code: "SAR_PREVIEW_TABLE_TIMEOUT",
    message:
      "The Preview participant table did not finish loading before the timeout",
  },
]) {
  test(`${scenario.code} exposes a distinct fixed message without raw details`, () => {
    const normalized = normalizeFlowError(
      Object.assign(new Error("private plan name, filename and OCR text"), {
        code: scenario.code,
        details: { private: "must not escape" },
      })
    );
    assert.equal(normalized.code, scenario.code);
    assert.equal(normalized.message, scenario.message);
    assert.equal(normalized.details, undefined);
    assert.doesNotMatch(normalized.message, /private|filename and OCR/);
  });
}

test("structured flow results preserve only an allowlisted SAR cause", () => {
  assert.throws(
    () =>
      assertFlowSucceeded({
        result: "Failed",
        code: "SAR_PREVIEW_FILENAME_MISMATCH",
        reason: "private filename and plan name",
        details: { invalidFiles: [{ rowNumber: 1 }] },
      }),
    (error) => {
      assert.equal(error.code, "SAR_PREVIEW_FILENAME_MISMATCH");
      assert.equal(
        error.message,
        "A Preview filename does not match the expected SAR plan ID and report year"
      );
      assert.deepEqual(error.details, { invalidFiles: [{ rowNumber: 1 }] });
      assert.doesNotMatch(error.message, /private filename|plan name/);
      return true;
    }
  );
});

test("structured generic failures never expose a raw reason", () => {
  assert.throws(
    () =>
      assertFlowSucceeded({
        result: "Failed",
        code: "SAR_NEW_UNREVIEWED_FAILURE",
        reason: "Plan name, EIN 12-3456789 and private portal response",
        details: { diagnostic: "retained internally" },
      }),
    (error) => {
      assert.equal(error.code, "EMAILTRIGGER_FAILED");
      assert.equal(
        error.message,
        "Email trigger failed before a confirmed send"
      );
      assert.deepEqual(error.details, { diagnostic: "retained internally" });
      assert.doesNotMatch(error.message, /Plan name|123456789|portal response/);
      return true;
    }
  );
});

test("an allowlisted failure code cannot downgrade an unknown outcome", () => {
  assert.throws(
    () =>
      assertFlowSucceeded({
        result: "Unknown Outcome",
        code: "SAR_PLAN_NOT_AVAILABLE",
        reason: "private response after the trigger click",
      }),
    (error) => {
      assert.equal(error.code, "EMAILTRIGGER_UNKNOWN_OUTCOME");
      assert.equal(error.message, "Email trigger outcome could not be confirmed");
      assert.doesNotMatch(error.message, /private response|trigger click/);
      return true;
    }
  );
});

test("pre-coded generic errors are re-sanitized", () => {
  const normalized = normalizeFlowError(
    Object.assign(new Error("private plan and stack"), {
      code: "EMAILTRIGGER_FAILED",
      details: { diagnostic: "retained internally" },
    })
  );
  assert.equal(normalized.code, "EMAILTRIGGER_FAILED");
  assert.equal(normalized.message, "Email trigger failed before a confirmed send");
  assert.deepEqual(normalized.details, { diagnostic: "retained internally" });
  assert.doesNotMatch(normalized.message, /private plan|stack/);
});

for (const scenario of [
  {
    flowResult: "Failed",
    reason: "SAR filename mismatch",
    code: "EMAILTRIGGER_FAILED",
    message: "Email trigger failed before a confirmed send",
  },
  {
    flowResult: "Empty Plan",
    reason: "No Participants were found in such plan.",
    code: "EMAILTRIGGER_EMPTY_PLAN",
    message: "No participants were found for the selected plan",
  },
  {
    flowResult: "Unknown Outcome",
    reason: "No success confirmation after click",
    code: "EMAILTRIGGER_UNKNOWN_OUTCOME",
    message: "Email trigger outcome could not be confirmed",
  },
]) {
  test(`${scenario.flowResult} becomes a failed job with a public code`, async () => {
    const accepted = queue.submit({
      botId: "forusall-emailtrigger",
      meta: {
        planId: 627,
        emailType: "summary_annual_notice",
        reportYear: 2025,
      },
      account: ACCOUNT,
      run: async () =>
        assertFlowSucceeded({
          result: scenario.flowResult,
          reason: scenario.reason,
          details: {
            reportYear: 2025,
            invalidRows: [2],
          },
        }),
    });

    const job = await waitForJob(accepted.jobId);
    assert.equal(job.state, "failed");
    assert.equal(job.result.code, scenario.code);
    assert.deepEqual(job.result.data, {
      reportYear: 2025,
      invalidRows: [2],
    });
    assert.deepEqual(job.result.errors, [
      {
        reportYear: 2025,
        invalidRows: [2],
      },
    ]);
    assert.deepEqual(toPublicJob(job), {
      state: "failed",
      error: {
        code: scenario.code,
        message: scenario.message,
      },
    });
  });
}

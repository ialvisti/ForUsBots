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

for (const scenario of [
  {
    flowResult: "Failed",
    reason: "SAR filename mismatch",
    code: "EMAILTRIGGER_FAILED",
  },
  {
    flowResult: "Empty Plan",
    reason: "No Participants were found in such plan.",
    code: "EMAILTRIGGER_EMPTY_PLAN",
  },
  {
    flowResult: "Unknown Outcome",
    reason: "No success confirmation after click",
    code: "EMAILTRIGGER_UNKNOWN_OUTCOME",
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
        message: scenario.reason,
      },
    });
  });
}

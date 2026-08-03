const test = require("node:test");
const assert = require("node:assert/strict");

process.env.AUDIT_DB = "1";

const firestorePath = require.resolve("../../src/db/firestore");
const persisted = new Map();

require.cache[firestorePath] = {
  id: firestorePath,
  filename: firestorePath,
  loaded: true,
  exports: {
    jobsCol: () => ({
      doc: (jobId) => ({
        set: async (value) => {
          if (value.state === "queued") {
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
          persisted.set(jobId, { ...(persisted.get(jobId) || {}), ...value });
        },
      }),
    }),
    eventsCol: () => ({ add: async () => {} }),
    stagesCol: () => ({ add: async () => {} }),
    FieldValue: { serverTimestamp: () => "server-time" },
    Timestamp: { fromDate: (date) => date },
  },
};

const audit = require("../../src/engine/audit");

test("serializa eventos por job para que queued nunca sobrescriba un terminal", async () => {
  const jobId = "ordering-job";
  await Promise.all([
    audit.trackEvent({
      type: "job.accepted",
      jobId,
      bot: "scrape-participant",
      ts: "2026-08-03T18:00:00.000Z",
    }),
    audit.trackEvent({
      type: "job.started",
      jobId,
      bot: "scrape-participant",
      ts: "2026-08-03T18:00:01.000Z",
    }),
    audit.trackEvent({
      type: "job.succeeded",
      jobId,
      bot: "scrape-participant",
      ts: "2026-08-03T18:00:02.000Z",
      result: { ok: true, data: {} },
    }),
  ]);

  assert.equal(persisted.get(jobId).state, "succeeded");
});

test("audit tardío no sobrescribe lifecycle durable", async () => {
  const jobId = "durable-ordering-job";
  persisted.set(jobId, {
    state: "failed",
    error: { code: "INTERRUPTED", message: "Job interrupted before completion" },
  });

  await audit.trackEvent({
    type: "job.started",
    jobId,
    bot: "scrape-participant",
    durableLifecycle: true,
    ts: "2026-08-03T18:00:01.000Z",
  });

  assert.equal(persisted.get(jobId).state, "failed");
  assert.equal(persisted.get(jobId).error.code, "INTERRUPTED");
});

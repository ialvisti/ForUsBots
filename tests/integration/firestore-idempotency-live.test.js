const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const {
  IdempotencyConflictError,
  createIdempotencyStore,
} = require("../../src/engine/idempotency");

test(
  "Firestore real conserva reserva, replay, conflicto y lifecycle",
  { skip: process.env.FORUSBOTS_FIRESTORE_LIVE !== "1" },
  async () => {
    assert.equal(process.env.GCP_PROJECT, "forusbots");
    const { db } = require("../../src/db/firestore");
    const firestore = db();
    const jobId = randomUUID();
    const key = `live-${randomUUID()}`;
    const ownerId = `owner-${randomUUID()}`;
    const submission = {
      key,
      botId: "scrape-participant",
      fingerprintPayload: {
        participantId: "synthetic-live-contract",
        modules: [{ key: "census", fields: [] }],
        includeScreens: false,
        timeoutMs: 30000,
        returnMode: "data",
        strict: true,
      },
      meta: { contractTest: true },
      createdBy: { name: "contract-test", role: "user" },
      accountAlias: "synthetic-live-contract",
      principalId: `principal-${randomUUID()}`,
      ownerId,
    };
    const firstStore = createIdempotencyStore({
      firestore,
      randomUUID: () => jobId,
    });
    const secondStore = createIdempotencyStore({
      firestore,
      randomUUID: () => jobId,
    });

    try {
      const [first, concurrentReplay] = await Promise.all([
        firstStore.reserveSubmission(submission),
        secondStore.reserveSubmission(submission),
      ]);
      assert.equal(first.jobId, jobId);
      assert.equal(concurrentReplay.jobId, jobId);
      assert.deepEqual(
        [first.replayed, concurrentReplay.replayed].sort(),
        [false, true]
      );

      await assert.rejects(
        firstStore.reserveSubmission({
          ...submission,
          fingerprintPayload: {
            ...submission.fingerprintPayload,
            timeoutMs: 45000,
          },
        }),
        IdempotencyConflictError
      );

      const execution = { ownerId, executionEpoch: 1 };
      await firstStore.markJobRunning(jobId, execution);
      await firstStore.markJobTerminal(jobId, {
        ...execution,
        state: "succeeded",
        result: { ok: true, data: { contractTest: true } },
        error: null,
      });
      const durable = await secondStore.getJob(jobId);
      assert.equal(durable.state, "succeeded");
      assert.equal(durable.result.data.contractTest, true);

      const receipts = await firestore
        .collection("idempotency_receipts")
        .where("job_id", "==", jobId)
        .get();
      assert.equal(receipts.size, 1);
      assert.equal(JSON.stringify(receipts.docs[0].data()).includes(key), false);
    } finally {
      const receipts = await firestore
        .collection("idempotency_receipts")
        .where("job_id", "==", jobId)
        .get();
      const batch = firestore.batch();
      for (const document of receipts.docs) batch.delete(document.ref);
      batch.delete(firestore.collection("jobs").doc(jobId));
      await batch.commit();
      await firestore.terminate();
    }
  }
);

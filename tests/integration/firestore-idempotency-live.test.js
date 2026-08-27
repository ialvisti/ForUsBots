const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { Firestore } = require("@google-cloud/firestore");

const {
  IdempotencyConflictError,
  IdempotencyReplayRequiredError,
  createIdempotencyStore,
} = require("../../src/engine/idempotency");

const TEST_DATABASE_ID = "forusbots-contract-test";

test(
  "Firestore real conserva reserva, replay-only, conflicto y lifecycle",
  { skip: process.env.FORUSBOTS_FIRESTORE_LIVE !== "1" },
  async () => {
    assert.equal(process.env.GCP_PROJECT, "forusbots");
    assert.equal(process.env.FORUSBOTS_FIRESTORE_DATABASE_ID, TEST_DATABASE_ID);
    assert.equal(process.env.FIRESTORE_EMULATOR_HOST, undefined);
    const firestore = new Firestore({
      projectId: "forusbots",
      databaseId: TEST_DATABASE_ID,
      ignoreUndefinedProperties: true,
    });
    assert.equal(firestore.databaseId, TEST_DATABASE_ID);
    const jobIds = new Set();
    const jobId = `live-contract-${randomUUID()}`;
    jobIds.add(jobId);
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

      const explicitReplay = await secondStore.reserveSubmission({
        ...submission,
        replayOnly: true,
      });
      assert.equal(explicitReplay.replayed, true);
      assert.equal(explicitReplay.jobId, jobId);

      const missingJobId = `live-contract-missing-${randomUUID()}`;
      jobIds.add(missingJobId);
      const missingStore = createIdempotencyStore({
        firestore,
        randomUUID: () => missingJobId,
      });
      await assert.rejects(
        missingStore.reserveSubmission({
          ...submission,
          key: `live-missing-${randomUUID()}`,
          replayOnly: true,
        }),
        IdempotencyReplayRequiredError
      );
      assert.equal(
        (await firestore.collection("jobs").doc(missingJobId).get()).exists,
        false
      );
      assert.equal(
        (
          await firestore
            .collection("idempotency_receipts")
            .where("job_id", "==", missingJobId)
            .get()
        ).size,
        0
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

      let leaseClock = new Date("2026-08-27T00:00:00.000Z");
      const interruptedJobId = `live-contract-interrupted-${randomUUID()}`;
      jobIds.add(interruptedJobId);
      const interruptedStore = createIdempotencyStore({
        firestore,
        randomUUID: () => interruptedJobId,
        now: () => new Date(leaseClock),
        claimLeaseMs: 1_000,
      });
      const interruptedSubmission = {
        ...submission,
        key: `live-interrupted-${randomUUID()}`,
        ownerId: `interrupted-owner-${randomUUID()}`,
      };
      await interruptedStore.reserveSubmission(interruptedSubmission);
      leaseClock = new Date(leaseClock.getTime() + 1_001);
      const interrupted = await interruptedStore.getJob(interruptedJobId);
      assert.equal(interrupted.state, "failed");
      assert.deepEqual(interrupted.error, {
        code: "INTERRUPTED",
        message: "Job interrupted before completion",
      });

      const receipts = await firestore
        .collection("idempotency_receipts")
        .where("job_id", "==", jobId)
        .get();
      assert.equal(receipts.size, 1);
      assert.equal(JSON.stringify(receipts.docs[0].data()).includes(key), false);
    } finally {
      try {
        const batch = firestore.batch();
        for (const cleanupJobId of jobIds) {
          const receipts = await firestore
            .collection("idempotency_receipts")
            .where("job_id", "==", cleanupJobId)
            .get();
          for (const document of receipts.docs) batch.delete(document.ref);
          batch.delete(firestore.collection("jobs").doc(cleanupJobId));
        }
        await batch.commit();

        for (const cleanupJobId of jobIds) {
          assert.equal(
            (
              await firestore.collection("jobs").doc(cleanupJobId).get()
            ).exists,
            false
          );
          assert.equal(
            (
              await firestore
                .collection("idempotency_receipts")
                .where("job_id", "==", cleanupJobId)
                .get()
            ).size,
            0
          );
        }
      } finally {
        await firestore.terminate();
      }
    }
  }
);

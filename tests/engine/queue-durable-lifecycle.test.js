const test = require("node:test");
const assert = require("node:assert/strict");

process.env.MAX_CONCURRENCY = "1";

const log = require("../../src/engine/logger");
const originalLogEvent = log.event;
const originalLogError = log.error;
log.event = () => {};
log.error = () => {};

const queue = require("../../src/engine/queue");

test.after(() => {
  log.event = originalLogEvent;
  log.error = originalLogError;
});

const ACCOUNT = Object.freeze({
  alias: "queue-test",
  siteUser: "queue@example.test",
  sitePass: "secret",
  totpSecret: "AAAA",
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate, message, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(message);
}

function submitDurable({ jobId, run, beforeRun, afterFinalize }) {
  return queue.submit({
    botId: `durable-${jobId}`,
    jobId,
    account: ACCOUNT,
    run,
    beforeRun,
    afterFinalize,
    durableLifecycle: true,
  });
}

test("beforeRun termina antes de que comience el efecto", async () => {
  const calls = [];
  const jobId = "queue-before-run-order";

  submitDurable({
    jobId,
    beforeRun: async () => {
      calls.push("beforeRun");
    },
    run: async () => {
      calls.push("effect");
      return { ok: true, value: 1 };
    },
    afterFinalize: async () => {
      calls.push("afterFinalize");
    },
  });

  await waitFor(
    () => queue.getJob(jobId)?.state === "succeeded",
    "el job durable no terminó"
  );
  assert.deepEqual(calls, ["beforeRun", "effect", "afterFinalize"]);
});

test("un fallo de beforeRun impide el efecto y permite avanzar la cola", async () => {
  let rejectedEffectCalls = 0;
  let nextEffectCalls = 0;
  const rejectedJobId = "queue-before-run-rejected";
  const nextJobId = "queue-after-before-run-rejected";

  submitDurable({
    jobId: rejectedJobId,
    beforeRun: async () => {
      throw new Error("durable running unavailable");
    },
    run: async () => {
      rejectedEffectCalls += 1;
      return { ok: true };
    },
    afterFinalize: async () => {},
  });
  submitDurable({
    jobId: nextJobId,
    beforeRun: async () => {},
    run: async () => {
      nextEffectCalls += 1;
      return { ok: true };
    },
    afterFinalize: async () => {},
  });

  await waitFor(
    () => queue.getJob(nextJobId)?.state === "succeeded",
    "la cola no avanzó después del fallo de beforeRun"
  );

  const rejected = queue.getJob(rejectedJobId);
  assert.equal(rejectedEffectCalls, 0);
  assert.equal(nextEffectCalls, 1);
  assert.equal(rejected.state, "failed");
  assert.match(rejected.error, /durable running unavailable/);
});

test("afterFinalize recibe el estado y resultado ya normalizados", async () => {
  const jobId = "queue-normalized-terminal";
  let terminal = null;

  submitDurable({
    jobId,
    beforeRun: async () => {},
    run: async () => ({
      ok: true,
      value: 42,
      warnings: ["normalized-warning"],
    }),
    afterFinalize: async (value) => {
      terminal = value;
    },
  });

  await waitFor(
    () => queue.getJob(jobId)?.state === "succeeded",
    "el job normalizado no terminó"
  );

  assert.deepEqual(terminal, {
    state: "succeeded",
    result: {
      ok: true,
      code: "OK",
      message: null,
      data: { value: 42 },
      warnings: ["normalized-warning"],
      errors: [],
    },
    error: null,
  });
});

test("un fallo de afterFinalize queda fail-closed sin liberar el slot antes de tiempo", async () => {
  const finalizeGate = deferred();
  const finalizeEntered = deferred();
  const unhandled = [];
  const firstJobId = "queue-after-finalize-rejected";
  const nextJobId = "queue-after-finalize-next";
  let nextEffectCalls = 0;
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);

  try {
    submitDurable({
      jobId: firstJobId,
      beforeRun: async () => {},
      run: async () => ({ ok: true, value: "effect-complete" }),
      afterFinalize: async () => {
        finalizeEntered.resolve();
        await finalizeGate.promise;
      },
    });

    await finalizeEntered.promise;

    submitDurable({
      jobId: nextJobId,
      beforeRun: async () => {},
      run: async () => {
        nextEffectCalls += 1;
        return { ok: true };
      },
      afterFinalize: async () => {},
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    const stateWhileDurabilityPending = queue.getJob(firstJobId)?.state;
    const effectsWhileDurabilityPending = nextEffectCalls;

    finalizeGate.reject(new Error("firestore terminal write failed"));

    await waitFor(
      () => queue.getJob(nextJobId)?.state === "succeeded",
      "la cola no avanzó después del fallo de afterFinalize"
    );
    await new Promise((resolve) => setImmediate(resolve));

    const failed = queue.getJob(firstJobId);
    assert.equal(stateWhileDurabilityPending, "running");
    assert.equal(effectsWhileDurabilityPending, 0);
    assert.equal(failed.state, "failed");
    assert.equal(failed.result.code, "DURABLE_STATE_FAILED");
    assert.match(failed.error, /Durable job state could not be persisted/);
    assert.equal(nextEffectCalls, 1);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
    finalizeGate.resolve();
  }
});

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  IdempotencyConflictError,
  IdempotencyReceiptInconsistentError,
  InvalidIdempotencyKeyError,
  createIdempotencyStore,
  createIdempotentSubmitter,
  getJobWithDurableFallback,
} = require("../../src/engine/idempotency");

class FakeFirestore {
  constructor() {
    this.documents = new Map();
    this.transactionTail = Promise.resolve();
  }

  collection(name) {
    return {
      doc: (id) => {
        const ref = {
          path: `${name}/${id}`,
          get: async () => {
            const value = this.documents.get(ref.path);
            return {
              exists: value !== undefined,
              data: () =>
                value === undefined ? undefined : structuredClone(value),
            };
          },
          set: async (value, options = {}) => {
            const previous = this.documents.get(ref.path) || {};
            this.documents.set(
              ref.path,
              structuredClone(options.merge ? { ...previous, ...value } : value)
            );
          },
        };
        return ref;
      },
    };
  }

  runTransaction(callback) {
    const operation = this.transactionTail.then(async () => {
      const writes = [];
      const transaction = {
        get: async (ref) => {
          const value = this.documents.get(ref.path);
          return {
            exists: value !== undefined,
            data: () => (value === undefined ? undefined : structuredClone(value)),
          };
        },
        create: (ref, value) => {
          if (this.documents.has(ref.path)) {
            throw new Error(`already exists: ${ref.path}`);
          }
          writes.push({ ref, value: structuredClone(value) });
        },
        update: (ref, value) => {
          if (!this.documents.has(ref.path)) {
            throw new Error(`does not exist: ${ref.path}`);
          }
          writes.push({ ref, value: structuredClone(value), merge: true });
        },
      };
      const result = await callback(transaction);
      for (const write of writes) {
        const previous = this.documents.get(write.ref.path) || {};
        this.documents.set(
          write.ref.path,
          write.merge ? { ...previous, ...write.value } : write.value
        );
      }
      return result;
    });
    this.transactionTail = operation.catch(() => {});
    return operation;
  }
}

function fixture() {
  const firestore = new FakeFirestore();
  let sequence = 0;
  let currentTime = new Date("2026-08-03T18:00:00.000Z");
  const store = createIdempotencyStore({
    firestore,
    now: () => new Date(currentTime),
    randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
  });
  return {
    firestore,
    store,
    advance(ms) {
      currentTime = new Date(currentTime.getTime() + ms);
    },
  };
}

const baseSubmission = {
  key: "rag:participant:ticket-123:operation-1",
  botId: "scrape-participant",
  fingerprintPayload: {
    participantId: "synthetic-participant",
    modules: [{ key: "census", fields: null }],
    includeScreens: false,
    timeoutMs: 30000,
    returnMode: "data",
    strict: true,
  },
  meta: {
    participantId: "synthetic-participant",
    modules: [{ key: "census", fields: null }],
  },
  createdBy: { name: "service", role: "user", at: "2026-08-03T18:00:00.000Z" },
  accountAlias: "rag-service",
  principalId: "token-hash-rag-service",
  ownerId: "boot-owner-a",
};

test("misma clave y payload devuelve el mismo jobId durable", async () => {
  const { firestore, store } = fixture();

  const first = await store.reserveSubmission(baseSubmission);
  const replay = await store.reserveSubmission(baseSubmission);

  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.jobId, first.jobId);
  assert.equal(replay.acceptedAt, first.acceptedAt);

  const receipts = [...firestore.documents.entries()].filter(([path]) =>
    path.startsWith("idempotency_receipts/")
  );
  const jobs = [...firestore.documents.entries()].filter(([path]) =>
    path.startsWith("jobs/")
  );
  assert.equal(receipts.length, 1);
  assert.equal(jobs.length, 1);
  assert.equal(JSON.stringify(receipts[0][1]).includes(baseSubmission.key), false);
});

test("misma clave con payload distinto falla con conflicto y no crea otro job", async () => {
  const { firestore, store } = fixture();
  await store.reserveSubmission(baseSubmission);

  await assert.rejects(
    store.reserveSubmission({
      ...baseSubmission,
      fingerprintPayload: {
        ...baseSubmission.fingerprintPayload,
        timeoutMs: 45000,
      },
    }),
    IdempotencyConflictError
  );

  const jobs = [...firestore.documents.keys()].filter((path) => path.startsWith("jobs/"));
  assert.equal(jobs.length, 1);
});

test("reservas concurrentes son atómicas y producen un solo job", async () => {
  const { firestore, store } = fixture();

  const [a, b] = await Promise.all([
    store.reserveSubmission(baseSubmission),
    store.reserveSubmission(baseSubmission),
  ]);

  assert.equal(a.jobId, b.jobId);
  assert.deepEqual([a.replayed, b.replayed].sort(), [false, true]);
  const jobs = [...firestore.documents.keys()].filter((path) => path.startsWith("jobs/"));
  assert.equal(jobs.length, 1);
});

test("rechaza claves vacías, demasiado largas o con caracteres inseguros", async () => {
  const { store } = fixture();
  for (const key of ["", "short", "x".repeat(201), "contains whitespace"]) {
    await assert.rejects(
      store.reserveSubmission({ ...baseSubmission, key }),
      InvalidIdempotencyKeyError
    );
  }
});

test("el submitter persiste antes de encolar y el replay no vuelve a encolar", async () => {
  const events = [];
  const reservation = {
    replayed: false,
    jobId: "00000000-0000-4000-8000-000000000001",
    acceptedAt: "2026-08-03T18:00:00.000Z",
  };
  const store = {
    reserveSubmission: async () => {
      events.push("reserved");
      return reservation;
    },
  };
  const queue = {
    submit: (input) => {
      events.push("queued");
      assert.equal(input.jobId, reservation.jobId);
      assert.equal(input.acceptedAt, reservation.acceptedAt);
      return { ...reservation, ok: true, queuePosition: 1 };
    },
  };
  const submit = createIdempotentSubmitter({ store, queue });

  const first = await submit({
    ...baseSubmission,
    idempotencyKey: baseSubmission.key,
    account: { siteUser: "u", sitePass: "p", totpSecret: "t" },
    run: async () => null,
  });
  assert.deepEqual(events, ["reserved", "queued"]);
  assert.equal(first.replayed, false);

  events.length = 0;
  store.reserveSubmission = async () => ({ ...reservation, replayed: true });
  const replay = await submit({
    ...baseSubmission,
    idempotencyKey: baseSubmission.key,
    account: { siteUser: "u", sitePass: "p", totpSecret: "t" },
    run: async () => null,
  });
  assert.deepEqual(events, []);
  assert.equal(replay.replayed, true);
  assert.equal(replay.jobId, reservation.jobId);
});

test("sin Idempotency-Key mantiene compatibilidad y usa submit legacy", async () => {
  let reserveCalls = 0;
  let submitCalls = 0;
  const submit = createIdempotentSubmitter({
    store: {
      reserveSubmission: async () => {
        reserveCalls += 1;
      },
    },
    queue: {
      submit: () => {
        submitCalls += 1;
        return { ok: true, jobId: "legacy", acceptedAt: "now" };
      },
    },
  });

  const result = await submit({
    ...baseSubmission,
    idempotencyKey: null,
    account: { siteUser: "u", sitePass: "p", totpSecret: "t" },
    run: async () => null,
  });

  assert.equal(result.jobId, "legacy");
  assert.equal(result.replayed, false);
  assert.equal(reserveCalls, 0);
  assert.equal(submitCalls, 1);
});

test("valida credenciales antes de crear el recibo durable", async () => {
  let reserveCalls = 0;
  const submit = createIdempotentSubmitter({
    store: {
      reserveSubmission: async () => {
        reserveCalls += 1;
        return { replayed: false, jobId: "should-not-exist", acceptedAt: "now" };
      },
    },
    queue: { submit: () => assert.fail("no debe encolar") },
  });

  await assert.rejects(
    submit({
      ...baseSubmission,
      idempotencyKey: baseSubmission.key,
      account: { siteUser: "", sitePass: "", totpSecret: "" },
      run: async () => null,
    }),
    /account requerido/
  );
  assert.equal(reserveCalls, 0);
});

test("una solicitud con clave exige principal autenticado estable", async () => {
  const { store } = fixture();
  const submit = createIdempotentSubmitter({
    store,
    queue: { submit: () => assert.fail("no debe encolar") },
    ownerId: "boot-owner-a",
  });

  await assert.rejects(
    submit({
      ...baseSubmission,
      principalId: null,
      idempotencyKey: baseSubmission.key,
      account: {
        alias: "legacy-shared",
        siteUser: "u",
        sitePass: "p",
        totpSecret: "t",
      },
      run: async () => null,
    }),
    /principal autenticado/
  );
});

test("la clave queda aislada por principal y endpoint", async () => {
  const { firestore, store } = fixture();
  const first = await store.reserveSubmission({
    ...baseSubmission,
    principalId: "service-a",
  });
  const otherPrincipal = await store.reserveSubmission({
    ...baseSubmission,
    principalId: "service-b",
  });
  const otherEndpoint = await store.reserveSubmission({
    ...baseSubmission,
    principalId: "service-a",
    botId: "scrape-plan",
  });

  assert.notEqual(first.jobId, otherPrincipal.jobId);
  assert.notEqual(first.jobId, otherEndpoint.jobId);
  const receipts = [...firestore.documents.keys()].filter((path) =>
    path.startsWith("idempotency_receipts/")
  );
  assert.equal(receipts.length, 3);
});

test("un recibo cuyo job durable falta falla cerrado", async () => {
  const { firestore, store } = fixture();
  const first = await store.reserveSubmission(baseSubmission);
  firestore.documents.delete(`jobs/${first.jobId}`);

  await assert.rejects(
    store.reserveSubmission(baseSubmission),
    IdempotencyReceiptInconsistentError
  );
});

test("GET terminaliza un job huérfano al vencer el lease sin reencolar", async () => {
  const { store, advance } = fixture();
  const first = await store.reserveSubmission(baseSubmission);

  advance(91_000);
  const job = await store.getJob(first.jobId);

  assert.equal(job.state, "failed");
  assert.deepEqual(job.error, {
    code: "INTERRUPTED",
    message: "Job interrupted before completion",
  });
});

test("el heartbeat conserva el lease de un job durable mientras sigue en cola", async () => {
  const { store, advance } = fixture();
  const first = await store.reserveSubmission(baseSubmission);
  const execution = {
    ownerId: baseSubmission.ownerId,
    executionEpoch: first.executionEpoch,
  };

  advance(80_000);
  await store.renewJobLease(first.jobId, execution);
  advance(80_000);
  assert.equal((await store.getJob(first.jobId)).state, "queued");

  advance(11_000);
  assert.equal((await store.getJob(first.jobId)).state, "failed");
});

test("transiciones awaited running y terminal conservan un resultado durable", async () => {
  const { store, advance } = fixture();
  const first = await store.reserveSubmission(baseSubmission);

  await store.markJobRunning(first.jobId, {
    ownerId: baseSubmission.ownerId,
    executionEpoch: first.executionEpoch,
  });
  await store.markJobTerminal(first.jobId, {
    ownerId: baseSubmission.ownerId,
    executionEpoch: first.executionEpoch,
    state: "succeeded",
    result: { ok: true, data: { safe: true } },
    error: null,
  });
  advance(91_000);

  const job = await store.getJob(first.jobId);
  assert.equal(job.state, "succeeded");
  assert.deepEqual(job.result, { ok: true, data: { safe: true } });
});

test("submit durable instala callbacks de lifecycle antes de ejecutar", async () => {
  const calls = [];
  let queuedInput = null;
  const store = {
    reserveSubmission: async () => ({
      replayed: false,
      jobId: "00000000-0000-4000-8000-000000000777",
      acceptedAt: "2026-08-03T18:00:00.000Z",
      executionEpoch: 1,
    }),
    markJobRunning: async () => calls.push("running"),
    renewJobLease: async () => calls.push("heartbeat"),
    markJobTerminal: async (_jobId, terminal) =>
      calls.push(`terminal:${terminal.state}`),
  };
  const submit = createIdempotentSubmitter({
    store,
    ownerId: "boot-owner-a",
    queue: {
      submit: (input) => {
        queuedInput = input;
        return { ok: true, jobId: input.jobId, acceptedAt: input.acceptedAt };
      },
    },
  });

  await submit({
    ...baseSubmission,
    idempotencyKey: baseSubmission.key,
    account: { siteUser: "u", sitePass: "p", totpSecret: "t" },
    run: async () => ({ raw: true }),
  });

  assert.equal(typeof queuedInput.beforeRun, "function");
  assert.equal(typeof queuedInput.afterFinalize, "function");
  await queuedInput.beforeRun();
  await queuedInput.afterFinalize({
    state: "succeeded",
    result: { ok: true },
    error: null,
  });
  assert.deepEqual(calls, ["running", "terminal:succeeded"]);
});

test("submit durable renueva el lease en cola y detiene el heartbeat al finalizar", async () => {
  const calls = [];
  let queuedInput = null;
  const store = {
    reserveSubmission: async () => ({
      replayed: false,
      jobId: "00000000-0000-4000-8000-000000000778",
      acceptedAt: "2026-08-03T18:00:00.000Z",
      executionEpoch: 1,
    }),
    markJobRunning: async () => calls.push("running"),
    renewJobLease: async () => calls.push("heartbeat"),
    markJobTerminal: async () => calls.push("terminal"),
  };
  const submit = createIdempotentSubmitter({
    store,
    ownerId: "boot-owner-a",
    heartbeatIntervalMs: 5,
    queue: {
      submit: (input) => {
        queuedInput = input;
        return { ok: true, jobId: input.jobId, acceptedAt: input.acceptedAt };
      },
    },
  });

  await submit({
    ...baseSubmission,
    idempotencyKey: baseSubmission.key,
    account: { siteUser: "u", sitePass: "p", totpSecret: "t" },
    run: async () => ({ raw: true }),
  });
  await new Promise((resolve) => setTimeout(resolve, 18));
  assert.ok(calls.filter((value) => value === "heartbeat").length >= 1);

  await queuedInput.beforeRun();
  await queuedInput.run({});
  await queuedInput.afterFinalize({
    state: "succeeded",
    result: { ok: true },
    error: null,
  });
  const heartbeatCount = calls.filter((value) => value === "heartbeat").length;
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(
    calls.filter((value) => value === "heartbeat").length,
    heartbeatCount
  );
  assert.equal(calls.at(-1), "terminal");
});

test("si el enqueue falla conserva el recibo y marca el job fallido", async () => {
  const marked = [];
  const store = {
    reserveSubmission: async () => ({
      replayed: false,
      jobId: "00000000-0000-4000-8000-000000000999",
      acceptedAt: "2026-08-03T18:00:00.000Z",
    }),
    markJobFailed: async (jobId, code) => marked.push({ jobId, code }),
  };
  const submit = createIdempotentSubmitter({
    store,
    queue: {
      submit: () => {
        throw new Error("queue rejected");
      },
    },
  });

  await assert.rejects(
    submit({
      ...baseSubmission,
      idempotencyKey: baseSubmission.key,
      account: { siteUser: "u", sitePass: "p", totpSecret: "t" },
      run: async () => null,
    }),
    /queue rejected/
  );
  assert.deepEqual(marked, [
    {
      jobId: "00000000-0000-4000-8000-000000000999",
      code: "ENQUEUE_FAILED",
    },
  ]);
});

test("GET de job usa memoria primero y Firestore tras un reinicio", async () => {
  const memoryJob = { jobId: "memory", state: "running" };
  const durableJob = { jobId: "durable", state: "succeeded", botId: "scrape-plan" };
  let durableReads = 0;
  const memoryQueue = {
    getJob: (jobId) => (jobId === "memory" ? memoryJob : null),
  };
  const durableStore = {
    getJob: async () => {
      durableReads += 1;
      return durableJob;
    },
  };

  assert.equal(
    await getJobWithDurableFallback("memory", { memoryQueue, durableStore }),
    memoryJob
  );
  assert.equal(durableReads, 0);
  assert.equal(
    await getJobWithDurableFallback("durable", { memoryQueue, durableStore }),
    durableJob
  );
  assert.equal(durableReads, 1);
});

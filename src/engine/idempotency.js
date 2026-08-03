const { createHash, randomUUID: defaultRandomUUID } = require("crypto");

const RECEIPT_COLLECTION = "idempotency_receipts";
const JOB_COLLECTION = "jobs";
const RECEIPT_RETENTION_DAYS = 90;
const CLAIM_LEASE_MS = 90_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const PROCESS_OWNER_ID = defaultRandomUUID();

class InvalidIdempotencyKeyError extends Error {
  constructor() {
    super("Invalid Idempotency-Key");
    this.name = "InvalidIdempotencyKeyError";
    this.code = "INVALID_IDEMPOTENCY_KEY";
  }
}

class IdempotencyConflictError extends Error {
  constructor() {
    super("Idempotency-Key was already used with a different request");
    this.name = "IdempotencyConflictError";
    this.code = "IDEMPOTENCY_CONFLICT";
  }
}

class IdempotencyUnavailableError extends Error {
  constructor(cause) {
    super("Durable idempotency is unavailable");
    this.name = "IdempotencyUnavailableError";
    this.code = "IDEMPOTENCY_UNAVAILABLE";
    if (cause) this.cause = cause;
  }
}

class IdempotencyReceiptInconsistentError extends Error {
  constructor() {
    super("Idempotency receipt has no durable job");
    this.name = "IdempotencyReceiptInconsistentError";
    this.code = "IDEMPOTENCY_RECEIPT_INCONSISTENT";
  }
}

class IdempotencyPrincipalUnavailableError extends Error {
  constructor() {
    super("Idempotency-Key requires a stable principal autenticado");
    this.name = "IdempotencyPrincipalUnavailableError";
    this.code = "IDEMPOTENCY_PRINCIPAL_UNAVAILABLE";
  }
}

class StaleExecutionLeaseError extends Error {
  constructor() {
    super("Durable job execution lease is stale");
    this.name = "StaleExecutionLeaseError";
    this.code = "STALE_EXECUTION_LEASE";
  }
}

function normalizeIdempotencyKey(raw) {
  if (typeof raw !== "string") throw new InvalidIdempotencyKeyError();
  if (raw.length < 8 || raw.length > 200) {
    throw new InvalidIdempotencyKeyError();
  }
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (code < 33 || code > 126) throw new InvalidIdempotencyKeyError();
  }
  return raw;
}

function canonicalize(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  throw new TypeError(`Unsupported fingerprint value: ${typeof value}`);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function fingerprintSubmission({ botId, payload, accountAlias }) {
  return sha256(
    canonicalize({
      version: 1,
      botId: String(botId || "unknown"),
      accountAlias: accountAlias || null,
      payload: payload || {},
    })
  );
}

function safeObject(value, fallback = {}) {
  if (!value || typeof value !== "object") return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function safeJsonValue(value, fallback = null) {
  if (value === undefined) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function toDate(value) {
  if (!value) return null;
  try {
    if (typeof value.toDate === "function") return value.toDate();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}

function toIso(value) {
  if (!value) return null;
  try {
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

function mapDurableJob(jobId, data) {
  if (!data || typeof data !== "object") return null;
  return {
    ok: true,
    jobId,
    botId: data.bot_id || data.botId || "unknown",
    state: data.state || null,
    acceptedAt: toIso(data.accepted_at || data.acceptedAt),
    startedAt: toIso(data.started_at || data.startedAt),
    finishedAt: toIso(data.finished_at || data.finishedAt),
    result: data.result || null,
    error: data.error || null,
    meta: data.meta || {},
    createdBy: {
      name: data.created_by_name ?? null,
      role: data.created_by_role ?? null,
      at: toIso(data.created_by_at),
    },
    stages: Array.isArray(data.stages_list) ? data.stages_list : [],
  };
}

function createIdempotencyStore({
  firestore,
  now = () => new Date(),
  randomUUID = defaultRandomUUID,
  claimLeaseMs = CLAIM_LEASE_MS,
} = {}) {
  if (!firestore || typeof firestore.runTransaction !== "function") {
    throw new TypeError("firestore with runTransaction() is required");
  }

  async function reserveSubmission({
    key,
    botId,
    fingerprintPayload,
    meta,
    createdBy,
    accountAlias,
    principalId,
    ownerId,
  }) {
    const normalizedKey = normalizeIdempotencyKey(key);
    if (typeof principalId !== "string" || !principalId) {
      throw new IdempotencyPrincipalUnavailableError();
    }
    if (typeof ownerId !== "string" || !ownerId) {
      throw new IdempotencyUnavailableError();
    }
    const principalScope = principalId;
    const receiptId = sha256(
      canonicalize({
        version: 1,
        principalScope,
        botId: String(botId || "unknown"),
        key: normalizedKey,
      })
    );
    const fingerprint = fingerprintSubmission({
      botId,
      payload: fingerprintPayload,
      accountAlias,
    });
    const receiptRef = firestore.collection(RECEIPT_COLLECTION).doc(receiptId);
    const acceptedDate = now();

    try {
      return await firestore.runTransaction(async (transaction) => {
        const existing = await transaction.get(receiptRef);
        if (existing.exists) {
          const data = existing.data() || {};
          if (
            data.fingerprint !== fingerprint ||
            data.bot_id !== String(botId || "unknown")
          ) {
            throw new IdempotencyConflictError();
          }
          if (!data.job_id || !data.accepted_at) {
            throw new IdempotencyReceiptInconsistentError();
          }
          const durableJob = await transaction.get(
            firestore.collection(JOB_COLLECTION).doc(data.job_id)
          );
          if (!durableJob.exists) {
            throw new IdempotencyReceiptInconsistentError();
          }
          const durableData = durableJob.data() || {};
          return {
            replayed: true,
            jobId: data.job_id,
            acceptedAt: toIso(data.accepted_at),
            executionEpoch: Number(durableData.execution_epoch || 1),
          };
        }

        const jobId = randomUUID();
        const acceptedAt = acceptedDate.toISOString();
        const expiresAt = new Date(
          acceptedDate.getTime() + RECEIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000
        );
        const claimUntil = new Date(acceptedDate.getTime() + claimLeaseMs);
        const jobRef = firestore.collection(JOB_COLLECTION).doc(jobId);
        const createdBySafe = safeObject(createdBy, {});

        transaction.create(receiptRef, {
          version: 1,
          fingerprint,
          bot_id: String(botId || "unknown"),
          job_id: jobId,
          accepted_at: acceptedDate,
          created_at: acceptedDate,
          expires_at: expiresAt,
        });
        transaction.create(jobRef, {
          bot_id: String(botId || "unknown"),
          state: "queued",
          accepted_at: acceptedDate,
          meta: safeObject(meta),
          created_by_name: createdBySafe.name ?? null,
          created_by_role: createdBySafe.role ?? null,
          created_by_at: createdBySafe.at ? new Date(createdBySafe.at) : null,
          account_alias: accountAlias || null,
          idempotency_receipt_id: receiptId,
          durable_lifecycle: true,
          execution_owner: ownerId,
          execution_epoch: 1,
          claim_until: claimUntil,
          last_heartbeat_at: acceptedDate,
          updated_at: acceptedDate,
        });

        return {
          replayed: false,
          jobId,
          acceptedAt,
          executionEpoch: 1,
        };
      });
    } catch (error) {
      if (
        error instanceof InvalidIdempotencyKeyError ||
        error instanceof IdempotencyConflictError ||
        error instanceof IdempotencyReceiptInconsistentError ||
        error instanceof IdempotencyPrincipalUnavailableError
      ) {
        throw error;
      }
      throw new IdempotencyUnavailableError(error);
    }
  }

  async function getJob(jobId) {
    const jobRef = firestore.collection(JOB_COLLECTION).doc(String(jobId || ""));
    try {
      return await firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(jobRef);
        if (!snapshot.exists) return null;
        let data = snapshot.data() || {};
        const claimUntil = toDate(data.claim_until);
        if (
          (data.state === "queued" || data.state === "running") &&
          (!claimUntil || claimUntil.getTime() <= now().getTime())
        ) {
          const interruptedAt = now();
          const interrupted = {
            state: "failed",
            finished_at: interruptedAt,
            result: null,
            error: {
              code: "INTERRUPTED",
              message: "Job interrupted before completion",
            },
            claim_until: null,
            execution_owner: null,
            updated_at: interruptedAt,
          };
          transaction.update(jobRef, interrupted);
          data = { ...data, ...interrupted };
        }
        return mapDurableJob(String(jobId || ""), data);
      });
    } catch (error) {
      if (error instanceof IdempotencyReceiptInconsistentError) throw error;
      throw new IdempotencyUnavailableError(error);
    }
  }

  function assertExecution(data, ownerId, executionEpoch, allowedStates) {
    if (
      !data ||
      data.execution_owner !== ownerId ||
      Number(data.execution_epoch) !== Number(executionEpoch) ||
      !allowedStates.includes(data.state)
    ) {
      throw new StaleExecutionLeaseError();
    }
  }

  async function updateExecution(jobId, execution, updateFactory, allowedStates) {
    const jobRef = firestore.collection(JOB_COLLECTION).doc(String(jobId || ""));
    try {
      return await firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(jobRef);
        if (!snapshot.exists) throw new IdempotencyReceiptInconsistentError();
        const data = snapshot.data() || {};
        assertExecution(
          data,
          execution.ownerId,
          execution.executionEpoch,
          allowedStates
        );
        const update = updateFactory(data);
        transaction.update(jobRef, update);
        return update;
      });
    } catch (error) {
      if (
        error instanceof StaleExecutionLeaseError ||
        error instanceof IdempotencyReceiptInconsistentError
      ) {
        throw error;
      }
      throw new IdempotencyUnavailableError(error);
    }
  }

  async function markJobRunning(jobId, execution) {
    return updateExecution(
      jobId,
      execution,
      () => {
        const startedAt = now();
        return {
          state: "running",
          started_at: startedAt,
          claim_until: new Date(startedAt.getTime() + claimLeaseMs),
          last_heartbeat_at: startedAt,
          updated_at: startedAt,
        };
      },
      ["queued"]
    );
  }

  async function renewJobLease(jobId, execution) {
    return updateExecution(
      jobId,
      execution,
      () => {
        const heartbeatAt = now();
        return {
          claim_until: new Date(heartbeatAt.getTime() + claimLeaseMs),
          last_heartbeat_at: heartbeatAt,
          updated_at: heartbeatAt,
        };
      },
      ["queued", "running"]
    );
  }

  async function markJobTerminal(jobId, {
    ownerId,
    executionEpoch,
    state,
    result,
    error,
  }) {
    if (!["succeeded", "failed", "canceled"].includes(state)) {
      throw new TypeError("Invalid durable terminal state");
    }
    return updateExecution(
      jobId,
      { ownerId, executionEpoch },
      () => {
        const finishedAt = now();
        return {
          state,
          finished_at: finishedAt,
          result: safeJsonValue(result),
          error: safeJsonValue(error),
          claim_until: null,
          execution_owner: null,
          updated_at: finishedAt,
        };
      },
      ["queued", "running"]
    );
  }

  async function markJobFailed(jobId, code = "ENQUEUE_FAILED", execution) {
    return markJobTerminal(jobId, {
      ...execution,
      state: "failed",
      result: null,
      error: { code, message: "Job could not be enqueued" },
    });
  }

  return {
    reserveSubmission,
    getJob,
    markJobFailed,
    markJobRunning,
    renewJobLease,
    markJobTerminal,
  };
}

function createIdempotentSubmitter({
  store,
  queue,
  ownerId = PROCESS_OWNER_ID,
  heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS,
}) {
  if (!queue || typeof queue.submit !== "function") {
    throw new TypeError("queue with submit() is required");
  }

  return async function submitIdempotently({
    idempotencyKey,
    botId,
    fingerprintPayload,
    meta = {},
    account,
    run,
    principalId,
  }) {
    if (typeof run !== "function") {
      throw new Error("submit requiere un run() function");
    }
    if (
      !account ||
      !account.siteUser ||
      !account.sitePass ||
      !account.totpSecret
    ) {
      throw new Error(
        "submit: account requerido (siteUser, sitePass, totpSecret). Token sin credenciales y .env legacy vacío."
      );
    }
    if (idempotencyKey === null || idempotencyKey === undefined) {
      return {
        ...queue.submit({ botId, meta, account, run }),
        replayed: false,
      };
    }
    if (!store || typeof store.reserveSubmission !== "function") {
      throw new IdempotencyUnavailableError();
    }
    if (typeof principalId !== "string" || !principalId) {
      throw new IdempotencyPrincipalUnavailableError();
    }

    const createdBy = meta && typeof meta === "object" ? meta.createdBy : null;
    const durableMeta = { ...(meta || {}) };
    delete durableMeta.createdBy;
    const reservation = await store.reserveSubmission({
      key: idempotencyKey,
      botId,
      fingerprintPayload,
      meta: durableMeta,
      createdBy,
      accountAlias: account && account.alias ? account.alias : null,
      principalId,
      ownerId,
    });

    if (reservation.replayed) {
      return {
        ok: true,
        jobId: reservation.jobId,
        acceptedAt: reservation.acceptedAt,
        queuePosition: null,
        estimate: null,
        capacitySnapshot: null,
        replayed: true,
      };
    }

    const execution = {
      ownerId,
      executionEpoch: reservation.executionEpoch,
    };
    let heartbeatStopped = false;
    let lastHeartbeat = Promise.resolve();
    const heartbeat = () => {
      lastHeartbeat = lastHeartbeat
        .catch(() => {})
        .then(() => store.renewJobLease(reservation.jobId, execution))
        .catch(() => {});
    };
    const heartbeatTimer = setInterval(heartbeat, heartbeatIntervalMs);
    if (typeof heartbeatTimer.unref === "function") heartbeatTimer.unref();
    const stopHeartbeat = async () => {
      if (!heartbeatStopped) {
        heartbeatStopped = true;
        clearInterval(heartbeatTimer);
      }
      await lastHeartbeat;
    };
    const beforeRun = async () => {
      await store.markJobRunning(reservation.jobId, execution);
    };
    const runWithHeartbeat = async (jobContext) => {
      return run(jobContext);
    };
    const afterFinalize = async (terminal) => {
      await stopHeartbeat();
      await store.markJobTerminal(reservation.jobId, {
        ...execution,
        state: terminal.state,
        result: terminal.result,
        error: terminal.error,
      });
    };

    try {
      return {
        ...queue.submit({
          botId,
          meta,
          account,
          run: runWithHeartbeat,
          jobId: reservation.jobId,
          acceptedAt: reservation.acceptedAt,
          beforeRun,
          afterFinalize,
          durableLifecycle: true,
        }),
        replayed: false,
      };
    } catch (error) {
      await stopHeartbeat();
      if (typeof store.markJobFailed === "function") {
        await store.markJobFailed(
          reservation.jobId,
          "ENQUEUE_FAILED",
          execution
        );
      }
      throw error;
    }
  };
}

async function getJobWithDurableFallback(
  jobId,
  { memoryQueue, durableStore }
) {
  const memoryJob = memoryQueue.getJob(jobId);
  if (memoryJob) return memoryJob;
  if (!durableStore || typeof durableStore.getJob !== "function") return null;
  return durableStore.getJob(jobId);
}

let defaultStore = null;
function getDefaultIdempotencyStore({ required = false } = {}) {
  const enabled = String(process.env.AUDIT_DB || "").trim() === "1";
  if (!enabled) {
    if (required) throw new IdempotencyUnavailableError();
    return null;
  }
  if (!defaultStore) {
    const { db } = require("../db/firestore");
    defaultStore = createIdempotencyStore({ firestore: db() });
  }
  return defaultStore;
}

async function submitIdempotently(input) {
  const queue = require("./queue");
  const store =
    input.idempotencyKey === null || input.idempotencyKey === undefined
      ? null
      : getDefaultIdempotencyStore({ required: true });
  return createIdempotentSubmitter({ store, queue })(input);
}

function toIdempotencyHttpError(error) {
  if (error instanceof InvalidIdempotencyKeyError) {
    return { status: 400, body: { ok: false, error: "invalid_idempotency_key" } };
  }
  if (error instanceof IdempotencyConflictError) {
    return { status: 409, body: { ok: false, error: "idempotency_conflict" } };
  }
  if (error instanceof IdempotencyReceiptInconsistentError) {
    return {
      status: 503,
      body: { ok: false, error: "idempotency_receipt_inconsistent" },
    };
  }
  if (error instanceof IdempotencyPrincipalUnavailableError) {
    return {
      status: 503,
      body: { ok: false, error: "idempotency_principal_unavailable" },
    };
  }
  if (error instanceof IdempotencyUnavailableError) {
    return { status: 503, body: { ok: false, error: "idempotency_unavailable" } };
  }
  return null;
}

module.exports = {
  IdempotencyConflictError,
  IdempotencyPrincipalUnavailableError,
  IdempotencyReceiptInconsistentError,
  IdempotencyUnavailableError,
  InvalidIdempotencyKeyError,
  createIdempotencyStore,
  createIdempotentSubmitter,
  fingerprintSubmission,
  getDefaultIdempotencyStore,
  getJobWithDurableFallback,
  mapDurableJob,
  normalizeIdempotencyKey,
  submitIdempotently,
  toIdempotencyHttpError,
};

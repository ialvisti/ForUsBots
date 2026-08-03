const test = require("node:test");
const assert = require("node:assert/strict");

const idempotencyPath = require.resolve("../../src/engine/idempotency");
const submissions = [];
let nextResult = {
  ok: true,
  jobId: "00000000-0000-4000-8000-000000000100",
  acceptedAt: "2026-08-03T18:00:00.000Z",
  queuePosition: 1,
  estimate: null,
  capacitySnapshot: null,
  replayed: false,
};
let nextError = null;

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

const participantController = require("../../src/bots/forusall-scrape-participant/controller");
const planController = require("../../src/bots/forusall-scrape-plan/controller");

function request(body, idempotencyKey) {
  return {
    body,
    auth: {
      role: "user",
      user: { id: "rag-service", name: "RAG Service" },
      principalId: "a".repeat(64),
      account: {
        alias: "rag-service",
        siteUser: "user@example.test",
        sitePass: "secret",
        totpSecret: "AAAA",
      },
    },
    get(name) {
      return name.toLowerCase() === "idempotency-key" ? idempotencyKey : undefined;
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
  submissions.length = 0;
  nextError = null;
  nextResult = {
    ok: true,
    jobId: "00000000-0000-4000-8000-000000000100",
    acceptedAt: "2026-08-03T18:00:00.000Z",
    queuePosition: 1,
    estimate: null,
    capacitySnapshot: null,
    replayed: false,
  };
});

test("scrape-participant pasa clave, principal y payload normalizado", async () => {
  const res = response();
  await participantController(
    request({ participantId: "participant", strict: true }, "opaque-key-123"),
    res
  );

  assert.equal(res.output.status, 202);
  assert.equal(res.output.headers["Idempotency-Replayed"], "false");
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].idempotencyKey, "opaque-key-123");
  assert.equal(submissions[0].principalId, "a".repeat(64));
  assert.equal(submissions[0].botId, "scrape-participant");
  assert.equal(submissions[0].fingerprintPayload.participantId, "participant");
  assert.equal(submissions[0].fingerprintPayload.strict, true);
});

test("scrape-plan reporta replay y conserva el mismo Location/jobId", async () => {
  nextResult = { ...nextResult, replayed: true, queuePosition: null };
  const res = response();
  await planController(request({ planId: "plan" }, "opaque-key-456"), res);

  assert.equal(res.output.status, 202);
  assert.equal(res.output.headers["Idempotency-Replayed"], "true");
  assert.equal(
    res.output.headers.Location,
    "/forusbot/jobs/00000000-0000-4000-8000-000000000100"
  );
  assert.equal(submissions[0].botId, "scrape-plan");
  assert.equal(submissions[0].fingerprintPayload.planId, "plan");
});

test("un conflicto durable responde 409 sin filtrar detalles", async () => {
  nextError = {
    httpError: {
      status: 409,
      body: { ok: false, error: "idempotency_conflict" },
    },
  };
  const res = response();
  await participantController(
    request({ participantId: "participant" }, "opaque-key-789"),
    res
  );

  assert.equal(res.output.status, 409);
  assert.deepEqual(res.output.body, {
    ok: false,
    error: "idempotency_conflict",
  });
});

// tests/engine/queue-finalize-runms.test.js
// Correr con: node --test tests/engine/queue-finalize-runms.test.js
//
// Verifica que finalize() en queue.js emite job.succeeded / job.failed
// con runMs, queueMs, totalMs y totalSeconds poblados desde
// job.enqueuedAt/startedAt/finishedAt. Si estos campos no llegan al
// evento, audit.js los persiste como null y el dashboard de duraciones
// queda vacío.

const test = require("node:test");
const assert = require("node:assert/strict");

// Patchear el logger ANTES de require de queue.js, así queue.js obtiene
// la misma instancia ya parcheada (require cachea por path).
const log = require("../../src/engine/logger");
const captured = [];
const originalEvent = log.event;
log.event = function patchedEvent(obj, lvl = "info") {
  captured.push({ type: obj && obj.type, level: lvl, payload: obj });
};

const { enqueue, __state } = require("../../src/engine/queue");

test.after(() => {
  log.event = originalEvent;
});

function eventsByType(type) {
  return captured.filter((e) => e.type === type);
}

function lastEventOfType(type) {
  const all = eventsByType(type);
  return all[all.length - 1] || null;
}

test("job.succeeded incluye runMs/queueMs/totalMs/totalSeconds numericos", async () => {
  captured.length = 0;

  const p = enqueue({
    botId: "test-runms-ok",
    run: async () => {
      await new Promise((r) => setTimeout(r, 150));
      return { ok: true };
    },
  });

  await p;

  const accepted = lastEventOfType("job.accepted");
  const started = lastEventOfType("job.started");
  const succeeded = lastEventOfType("job.succeeded");

  assert.ok(accepted, "debe emitir job.accepted");
  assert.ok(started, "debe emitir job.started");
  assert.ok(succeeded, "debe emitir job.succeeded");

  // Orden relativo
  const idxAccepted = captured.indexOf(accepted);
  const idxStarted = captured.indexOf(started);
  const idxSucceeded = captured.indexOf(succeeded);
  assert.ok(idxAccepted < idxStarted, "accepted antes que started");
  assert.ok(idxStarted < idxSucceeded, "started antes que succeeded");

  const payload = succeeded.payload;
  assert.ok(
    Number.isFinite(payload.runMs),
    `runMs debe ser numero finito, fue ${payload.runMs}`
  );
  assert.ok(
    payload.runMs >= 100,
    `runMs >= 100ms esperado (sleep 150ms), fue ${payload.runMs}`
  );
  assert.ok(
    Number.isFinite(payload.queueMs) && payload.queueMs >= 0,
    `queueMs >= 0 esperado, fue ${payload.queueMs}`
  );
  assert.ok(
    Number.isFinite(payload.totalMs) && payload.totalMs >= payload.runMs,
    `totalMs >= runMs esperado, totalMs=${payload.totalMs} runMs=${payload.runMs}`
  );
  assert.equal(
    payload.totalSeconds,
    Math.round(payload.totalMs / 1000),
    "totalSeconds = round(totalMs/1000)"
  );
});

test("job.failed tambien incluye runMs/queueMs/totalMs/totalSeconds", async () => {
  captured.length = 0;

  const p = enqueue({
    botId: "test-runms-fail",
    run: async () => {
      await new Promise((r) => setTimeout(r, 30));
      throw new Error("boom");
    },
  });

  await assert.rejects(p, /boom/);

  const failed = lastEventOfType("job.failed");
  assert.ok(failed, "debe emitir job.failed");

  const payload = failed.payload;
  assert.ok(
    Number.isFinite(payload.runMs) && payload.runMs >= 0,
    `runMs numerico esperado, fue ${payload.runMs}`
  );
  assert.ok(
    Number.isFinite(payload.queueMs) && payload.queueMs >= 0,
    `queueMs numerico esperado, fue ${payload.queueMs}`
  );
  assert.ok(
    Number.isFinite(payload.totalMs) && payload.totalMs >= 0,
    `totalMs numerico esperado, fue ${payload.totalMs}`
  );
  assert.equal(
    payload.totalSeconds,
    Math.round(payload.totalMs / 1000),
    "totalSeconds = round(totalMs/1000)"
  );
  assert.equal(payload.error && payload.error.message, "boom");
});

test("edge: si startedAt se pierde, runMs/queueMs son null sin crash", async () => {
  captured.length = 0;

  const p = enqueue({
    botId: "test-runms-edge",
    run: async () => {
      // Simula el path raro: el registro en `running` pierde startedAt
      // antes de que finalize lo lea. finalize debe degradar a null.
      const job = __state.running.find((j) => j.botId === "test-runms-edge");
      if (job) job.startedAt = null;
      return null;
    },
  });

  await p;

  const succeeded = lastEventOfType("job.succeeded");
  assert.ok(succeeded, "debe emitir job.succeeded incluso sin startedAt");

  const payload = succeeded.payload;
  assert.equal(payload.runMs, null, "runMs debe ser null cuando startedAt es null");
  assert.equal(payload.queueMs, null, "queueMs debe ser null cuando startedAt es null");
  // totalMs depende de enqueuedAt + finishedAt y debe seguir valido
  assert.ok(
    Number.isFinite(payload.totalMs) && payload.totalMs >= 0,
    `totalMs debe seguir valido, fue ${payload.totalMs}`
  );
});

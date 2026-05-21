// tests/engine/audit-events-ttl.test.js
// Correr con: node --test tests/engine/audit-events-ttl.test.js
//
// Verifica que cada doc escrito a eventsCol() incluye un campo
// `expires_at` ~30 dias en el futuro (Date absoluto, no serverTimestamp).
// Combinado con la TTL policy de Firestore (gcloud firestore fields ttls
// update expires_at --collection-group=events --enable-ttl), los events
// se auto-rotan.
//
// Implementacion: inyectamos un mock en require.cache de
// `src/db/firestore.js` ANTES de require de audit.js, para evitar la
// dependencia transitiva con @google-cloud/firestore (no instalado en
// el entorno de test local).

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

process.env.AUDIT_DB = "1";

const firestorePath = require.resolve("../../src/db/firestore");
const captured = { events: [] };

require.cache[firestorePath] = {
  id: firestorePath,
  filename: firestorePath,
  loaded: true,
  exports: {
    jobsCol: () => ({
      doc: () => ({ set: async () => {} }),
    }),
    eventsCol: () => ({
      add: async (obj) => {
        captured.events.push(obj);
      },
    }),
    stagesCol: () => ({ add: async () => {} }),
    FieldValue: {
      serverTimestamp: () => "__SERVER_TS__",
    },
    Timestamp: {
      fromDate: (d) => ({ toDate: () => d, _date: d }),
    },
  },
  paths: [],
};

const audit = require("../../src/engine/audit");

test("eventsCol.add recibe expires_at ~30 dias en el futuro (Date absoluto)", async () => {
  captured.events.length = 0;
  const before = Date.now();

  await audit.trackEvent({
    type: "job.succeeded",
    jobId: "test-ttl-1",
    bot: "test-bot",
    ts: new Date().toISOString(),
    runMs: 1000,
    queueMs: 0,
    totalMs: 1000,
    totalSeconds: 1,
  });

  const after = Date.now();

  // El evento siempre se escribe en eventsCol (ademas del side-effect en jobsCol).
  assert.ok(captured.events.length >= 1, "debe escribir al menos un event");
  const ev = captured.events[captured.events.length - 1];

  assert.ok(ev.expires_at instanceof Date, "expires_at debe ser un Date");
  const expiresMs = ev.expires_at.getTime();

  const lowerBound = before + 29 * 24 * 60 * 60 * 1000;
  const upperBound = after + 31 * 24 * 60 * 60 * 1000;

  assert.ok(
    expiresMs >= lowerBound,
    `expires_at >= now+29d esperado, fue ${new Date(expiresMs).toISOString()}`
  );
  assert.ok(
    expiresMs <= upperBound,
    `expires_at <= now+31d esperado, fue ${new Date(expiresMs).toISOString()}`
  );
});

test("expires_at es Date absoluto, NO el placeholder de serverTimestamp", async () => {
  captured.events.length = 0;
  await audit.trackEvent({
    type: "stage.start",
    jobId: "test-ttl-2",
    bot: "test-bot",
    stage: "noop",
    ts: new Date().toISOString(),
  });
  const ev = captured.events[captured.events.length - 1];
  assert.notEqual(
    ev.expires_at,
    "__SERVER_TS__",
    "expires_at NO debe ser FieldValue.serverTimestamp() (la TTL policy ignora placeholders server-side)"
  );
  assert.ok(ev.expires_at instanceof Date);
});

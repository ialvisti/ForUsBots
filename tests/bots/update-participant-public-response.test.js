const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeResultEnvelope,
} = require("../../src/engine/normalizer");
const { toPublicJob } = require("../../src/middleware/public-response");

function successfulRawResult() {
  return {
    ok: true,
    code: "UPDATE_OK",
    message: "Participant updated successfully.",
    data: {
      participantId: "12345",
      participantUrl:
        "https://employer.forusall.com/participants/12345",
      updatesApplied: ["Hire Date"],
      confirmMode: "js-dialog",
      confirmText: "Participant updated successfully.",
    },
    warnings: [],
    errors: [],
  };
}

test("preserves an already canonical update-participant result", () => {
  const raw = successfulRawResult();
  const normalized = normalizeResultEnvelope(
    "update-participant",
    true,
    raw,
    null
  );

  assert.deepEqual(normalized, raw);
  assert.equal(normalized.data.participantId, "12345");
  assert.equal(
    Object.prototype.hasOwnProperty.call(normalized.data, "data"),
    false
  );
});

test("publishes participant update status and message on success", () => {
  const result = normalizeResultEnvelope(
    "update-participant",
    true,
    successfulRawResult(),
    null
  );
  const response = toPublicJob({
    state: "succeeded",
    botId: "update-participant",
    result,
    meta: { participantId: "meta-fallback" },
  });

  assert.deepEqual(response, {
    state: "succeeded",
    data: {
      participantId: "12345",
      updateStatus: "UPDATE_OK",
      statusMessage: "Participant updated successfully.",
      applied: {},
      skipped: [],
    },
    warnings: [],
    errors: [],
  });
  assert.equal(
    Object.prototype.hasOwnProperty.call(response.data, "participantUrl"),
    false
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(response.data, "confirmMode"),
    false
  );
});

test("recovers the public fields from a legacy nested job result", () => {
  const response = toPublicJob({
    state: "succeeded",
    botId: "update-participant",
    result: {
      ok: true,
      code: "OK",
      message: "Participant updated successfully.",
      data: {
        code: "UPDATE_OK",
        data: {
          participantId: "legacy-123",
          participantUrl:
            "https://employer.forusall.com/participants/legacy-123",
          updatesApplied: ["State"],
          confirmMode: "inline-alert",
          confirmText: "Participant updated successfully.",
        },
      },
      warnings: [],
      errors: [],
    },
  });

  assert.deepEqual(response.data, {
    participantId: "legacy-123",
    updateStatus: "UPDATE_OK",
    statusMessage: "Participant updated successfully.",
    applied: {},
    skipped: [],
  });
});

test("uses job metadata only when participantId is absent from result data", () => {
  const response = toPublicJob({
    state: "succeeded",
    botId: "update-participant",
    meta: { participantId: "meta-123" },
    result: {
      ok: true,
      code: "UPDATE_OK",
      message: "Participant updated successfully.",
      data: {
        updatesApplied: {},
        confirmText: "Participant updated successfully.",
      },
      warnings: [],
      errors: [],
    },
  });

  assert.equal(response.data.participantId, "meta-123");
});

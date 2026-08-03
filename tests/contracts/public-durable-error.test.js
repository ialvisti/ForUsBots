const test = require("node:test");
const assert = require("node:assert/strict");

const { toPublicJob } = require("../../src/middleware/public-response");

test("durability failure preserves its machine-readable public code", () => {
  const response = toPublicJob({
    state: "failed",
    error: "Durable job state could not be persisted",
    result: {
      ok: false,
      code: "DURABLE_STATE_FAILED",
      message: "Durable job state could not be persisted",
      data: null,
      warnings: [],
      errors: [],
    },
  });

  assert.deepEqual(response, {
    state: "failed",
    error: {
      code: "DURABLE_STATE_FAILED",
      message: "Durable job state could not be persisted",
    },
  });
});

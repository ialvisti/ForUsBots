"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  _normalizeAllowedEmailTriggerModes: normalize,
} = require("../../src/middleware/auth");

test("email trigger token modes normalize to a sorted allowlist", () => {
  assert.deepEqual(normalize(["VERIFY_ONLY", "send", "verify_only"]), [
    "send",
    "verify_only",
  ]);
  assert.deepEqual(normalize(["invalid"]), []);
});

test("missing token mode allowlist preserves legacy access", () => {
  assert.equal(normalize(undefined), null);
  assert.equal(normalize(null), null);
  assert.deepEqual(normalize("send"), []);
});

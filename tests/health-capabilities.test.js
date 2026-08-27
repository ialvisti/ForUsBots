"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { getHealthPayload } = require("../src/health");

test("health advertises the hardened email-trigger contract", () => {
  assert.deepEqual(getHealthPayload({}), {
    ok: true,
    capabilities: {
      emailTriggerIdempotency: "v1",
      emailTriggerReplayOnly: "v1",
      emailTriggerTerminalSemantics: "v1",
      emailTriggerReportYear: "v1",
      emailTriggerPortalPostGuard: "v1",
    },
  });
});

test("health advertises Preview document gate only when fully configured", () => {
  assert.deepEqual(
    getHealthPayload({
      SAR_DOCUMENT_GATE_ENABLED: "true",
      SAR_DOCUMENT_VERIFIER_URL: "https://sar-verifier-example.run.app",
      SAR_DOCUMENT_VERIFIER_AUDIENCE:
        "https://sar-verifier-example.run.app",
    }).capabilities,
    {
      emailTriggerIdempotency: "v1",
      emailTriggerReplayOnly: "v1",
      emailTriggerTerminalSemantics: "v1",
      emailTriggerReportYear: "v1",
      emailTriggerPortalPostGuard: "v1",
      emailTriggerPreviewDocumentGate: "v1",
    }
  );

  assert.equal(
    getHealthPayload({
      SAR_DOCUMENT_GATE_ENABLED: "true",
      SAR_DOCUMENT_VERIFIER_URL: "http://localhost:8080",
    }).capabilities.emailTriggerPreviewDocumentGate,
    undefined
  );
});

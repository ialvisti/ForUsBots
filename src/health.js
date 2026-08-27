"use strict";

const { isDocumentGateConfigured } = require("./bots/forusall-emailtrigger/documentGate");

const BASE_CAPABILITIES = Object.freeze({
  emailTriggerIdempotency: "v1",
  emailTriggerReplayOnly: "v1",
  emailTriggerTerminalSemantics: "v1",
  emailTriggerReportYear: "v1",
});

function getCapabilities(env = process.env) {
  const capabilities = { ...BASE_CAPABILITIES };
  if (isDocumentGateConfigured(env)) {
    capabilities.emailTriggerPreviewDocumentGate = "v1";
  }
  return capabilities;
}

function getHealthPayload(env = process.env) {
  return { ok: true, capabilities: getCapabilities(env) };
}

module.exports = {
  BASE_CAPABILITIES,
  getCapabilities,
  getHealthPayload,
};

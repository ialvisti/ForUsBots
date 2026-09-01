const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const yaml = require("js-yaml");

const spec = yaml.load(
  fs.readFileSync(
    path.resolve(__dirname, "../../docs/openapi.yaml"),
    "utf8"
  )
);

function resolveLocalRef(value) {
  if (!value || typeof value !== "object" || !value.$ref) return value;
  const segments = value.$ref.replace(/^#\//, "").split("/");
  return segments.reduce((current, segment) => current[segment], spec);
}

function post(pathname) {
  return spec.paths[pathname].post;
}

function idempotencyHeader(operation) {
  return operation.parameters.find(
    (parameter) => parameter.in === "header" && parameter.name === "Idempotency-Key"
  );
}

function responseSchema(operation, status) {
  const response = resolveLocalRef(operation.responses[String(status)]);
  assert.ok(response, `missing response ${status}`);
  assert.ok(response.content, `response ${status} must document content`);
  assert.ok(
    response.content["application/json"],
    `response ${status} must document application/json`
  );
  assert.ok(
    response.content["application/json"].schema,
    `response ${status} must have a JSON schema`
  );
  return resolveLocalRef(response.content["application/json"].schema);
}

test("Idempotency-Key documents the printable-ASCII rule enforced by the API", () => {
  for (const pathname of [
    "/forusbot/scrape-participant",
    "/forusbot/scrape-plan",
    "/forusbot/email-trigger",
  ]) {
    const schema = idempotencyHeader(post(pathname)).schema;
    assert.equal(schema.minLength, 8);
    assert.equal(schema.maxLength, 200);
    assert.equal(schema.pattern, "^[!-~]{8,200}$");
  }
});

test("idempotent replay fields are nullable in every documented 202 response", () => {
  for (const pathname of [
    "/forusbot/scrape-participant",
    "/forusbot/scrape-plan",
    "/forusbot/email-trigger",
  ]) {
    const schema = responseSchema(post(pathname), 202);
    for (const property of [
      "queuePosition",
      "estimate",
      "capacitySnapshot",
    ]) {
      assert.equal(
        schema.properties[property].nullable,
        true,
        `${pathname} ${property} must allow null on replay`
      );
    }
  }
});

test("summary annual email documents reportYear and its UTC default", () => {
  const operation = post("/forusbot/email-trigger");
  const schema = operation.requestBody.content["application/json"].schema;
  assert.equal(schema.properties.reportYear.type, "integer");
  assert.match(schema.properties.reportYear.description, /previous UTC year/);
});

test("summary annual recovery documents atomic replay-only mode", () => {
  const operation = post("/forusbot/email-trigger");
  const header = operation.parameters.find(
    (parameter) =>
      parameter.in === "header" &&
      parameter.name === "Idempotency-Replay-Only"
  );
  assert.ok(header);
  assert.deepEqual(header.schema.enum, ["true", "false"]);
  assert.match(header.description, /never create a new job/i);
});

test("scrape-participant documents its complete 202 JSON response", () => {
  const schema = responseSchema(post("/forusbot/scrape-participant"), 202);
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.required, [
    "ok",
    "jobId",
    "acceptedAt",
    "warnings",
    "executedBy",
  ]);
  assert.equal(schema.properties.jobId.format, "uuid");
  assert.equal(schema.properties.acceptedAt.format, "date-time");
});

test("GET /jobs/{id} documents its Firestore-unavailable 503 response", () => {
  const response = spec.paths["/forusbot/jobs/{id}"].get.responses["503"];
  assert.ok(response);
  const schema = resolveLocalRef(response.content["application/json"].schema);
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.required, ["ok", "error"]);
  assert.equal(schema.properties.ok.type, "boolean");
  assert.equal(schema.properties.error.type, "string");
});

test("health documents the hardened email-trigger capabilities", () => {
  for (const pathname of ["/health", "/forusbot/health"]) {
    const schema = responseSchema(spec.paths[pathname].get, 200);
    assert.deepEqual(schema.required, ["ok", "capabilities"]);
    assert.deepEqual(schema.properties.capabilities.required, [
      "emailTriggerIdempotency",
      "emailTriggerReplayOnly",
      "emailTriggerTerminalSemantics",
      "emailTriggerFailureTaxonomy",
      "emailTriggerReportYear",
      "emailTriggerPortalPostGuard",
    ]);
  }
});

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const yaml = require("js-yaml");

const config = yaml.load(
  fs.readFileSync(path.resolve(__dirname, "../../cloudbuild.yaml"), "utf8")
);

function step(id) {
  return config.steps.find((candidate) => candidate.id === id);
}

function script(id) {
  const found = step(id);
  assert.ok(found, `missing Cloud Build step: ${id}`);
  return found.args[found.args.length - 1];
}

test("rollout resolves the pushed digest and pins the template to it", () => {
  const resolveIndex = config.steps.findIndex(
    (candidate) => candidate.id === "resolve-image-digest"
  );
  const rolloutIndex = config.steps.findIndex(
    (candidate) => candidate.id === "rollout-and-verify"
  );
  assert.ok(resolveIndex > config.steps.findIndex((candidate) => candidate.id === "push"));
  assert.ok(rolloutIndex > resolveIndex);

  const resolveScript = script("resolve-image-digest");
  assert.match(resolveScript, /image_summary\.digest/);
  assert.match(resolveScript, /\$_IMAGE@\$\$image_digest/);

  const rolloutScript = script("rollout-and-verify");
  assert.match(rolloutScript, /--container-image="\$\$image_ref"/);
  assert.doesNotMatch(rolloutScript, /--container-image=\$_IMAGE:\$SHORT_SHA/);
});

test("rollout captures the previous template and rolls back on failure", () => {
  const rolloutScript = script("rollout-and-verify");
  const captureIndex = rolloutScript.indexOf("previous_template=");
  const mutationIndex = rolloutScript.indexOf("set-instance-template");
  assert.ok(captureIndex >= 0 && captureIndex < mutationIndex);
  assert.match(rolloutScript, /trap rollback EXIT/);
  assert.match(rolloutScript, /rollback.*previous_template/s);
  assert.ok(
    (rolloutScript.match(/set-instance-template/g) || []).length >= 2,
    "deployment and rollback must both set a template"
  );
  assert.ok(
    (rolloutScript.match(/rolling-action start-update/g) || []).length >= 2,
    "deployment and rollback must both start an update"
  );
});

test("rollout verifies configured template, effective template, and image digest", () => {
  const rolloutScript = script("rollout-and-verify");
  assert.match(rolloutScript, /configured_template/);
  assert.match(rolloutScript, /effective_template/);
  assert.match(rolloutScript, /gce-container-declaration/);
  assert.match(rolloutScript, /image_ref/);
  assert.match(rolloutScript, /--metadata=google-logging-enabled=true/);
});

test("rollout probes HTTP health with bounded retries", () => {
  const rolloutScript = script("rollout-and-verify");
  assert.match(rolloutScript, /for attempt in \$\$?\(seq 1 [1-9][0-9]*\)/);
  assert.match(rolloutScript, /curl -fsS/);
  assert.match(rolloutScript, /\/health/);
  assert.match(rolloutScript, /emailTriggerPortalPostGuard/);
  assert.match(rolloutScript, /sleep [1-9][0-9]*/);
  assert.match(rolloutScript, /HTTP health probe failed/);
});

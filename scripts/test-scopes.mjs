// scripts/test-scopes.mjs
// Cobertura unitaria de src/auth/scopes.js (sin framework, asserts manuales).
// Uso: node scripts/test-scopes.mjs

import { strict as assert } from "node:assert";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  resolveScope,
  isAllowed,
  resolveEndpoint,
  scopeToJSON,
} = require("../src/auth/scopes");

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`PASS: ${name}`);
}
function fail(name, err) {
  console.error(`FAIL: ${name}`);
  console.error(err);
  process.exit(1);
}
function test(name, fn) {
  try {
    fn();
    ok(name);
  } catch (e) {
    fail(name, e);
  }
}

test("admin sin overrides → allow update-plan", () => {
  const scope = resolveScope({ role: "admin" });
  const v = isAllowed(scope, "POST", "/forusbot/update-plan");
  assert.equal(v.allowed, true);
});

test("user default → deny update-plan", () => {
  const scope = resolveScope({ role: "user" });
  const v = isAllowed(scope, "POST", "/forusbot/update-plan");
  assert.equal(v.allowed, false);
  assert.match(v.reason, /denied-feature:update-plan/);
});

test("user con allowedEndpoints override → allow update-plan", () => {
  const scope = resolveScope({
    role: "user",
    allowedEndpoints: ["POST /forusbot/update-plan"],
  });
  const v = isAllowed(scope, "POST", "/forusbot/update-plan");
  assert.equal(v.allowed, true);
  assert.equal(v.reason, "explicit-allow");
});

test("admin con deniedEndpoints → bloquea DELETE pero deja pasar GET", () => {
  const scope = resolveScope({
    role: "admin",
    deniedEndpoints: ["DELETE /forusbot/jobs/:id"],
  });
  const del = isAllowed(scope, "DELETE", "/forusbot/jobs/:id");
  const get = isAllowed(scope, "GET", "/forusbot/jobs/:id");
  assert.equal(del.allowed, false);
  assert.equal(get.allowed, true);
});

test("token legacy ({}) → tratado como user", () => {
  const scope = resolveScope({});
  assert.equal(scope.role, "user");
  // user hereda admin-locks denegado por default
  const v = isAllowed(scope, "GET", "/forusbot/locks");
  assert.equal(v.allowed, false);
});

test("resolveEndpoint normaliza path con :id", () => {
  const r = resolveEndpoint("DELETE", "/forusbot/jobs/abc-123");
  assert.equal(r?.feature, "jobs-write");
  assert.equal(r?.isOpen, false);
});

test("resolveEndpoint reconoce open endpoints", () => {
  const r = resolveEndpoint("GET", "/forusbot/health");
  assert.equal(r?.isOpen, true);
  assert.equal(r?.feature, null);
});

test("deniedFeatures extra del token se suman a defaultDeniedFeatures", () => {
  const scope = resolveScope({
    role: "user",
    deniedFeatures: ["scrape-participant"],
  });
  // Default user ya tiene update-plan denegado
  assert.equal(scope.deniedFeatures.has("update-plan"), true);
  // El override del token agrega scrape-participant
  assert.equal(scope.deniedFeatures.has("scrape-participant"), true);
  const v = isAllowed(scope, "POST", "/forusbot/scrape-participant");
  assert.equal(v.allowed, false);
});

test("scopeToJSON devuelve arrays sorted (sin Sets)", () => {
  const scope = resolveScope({
    role: "user",
    deniedFeatures: ["zeta", "alpha"],
  });
  const json = scopeToJSON(scope);
  assert.equal(Array.isArray(json.deniedFeatures), true);
  // Asegura orden ascendente
  const copy = [...json.deniedFeatures];
  copy.sort();
  assert.deepEqual(json.deniedFeatures, copy);
});

console.log(`\n${passed} passed`);

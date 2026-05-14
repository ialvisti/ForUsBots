// tests/engine/loginLock.test.js
// Correr con: node --test tests/engine/loginLock.test.js
//
// Verifica la propiedad de mutex per-cuenta del portal: dos jobs con el mismo
// siteUser se serializan; dos jobs con siteUsers distintos corren en paralelo.

const test = require("node:test");
const assert = require("node:assert/strict");
const { acquireLogin } = require("../../src/engine/loginLock");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("dos acquireLogin con el mismo siteUser se serializan", async () => {
  const order = [];
  const release1 = await acquireLogin("alice@x.com");

  const second = acquireLogin("alice@x.com").then((release2) => {
    order.push("second-acquired");
    release2();
  });

  // El segundo aún no debería haber adquirido — el primero aún no soltó.
  await sleep(40);
  order.push("first-still-holding");
  release1();
  await second;

  assert.deepEqual(order, ["first-still-holding", "second-acquired"]);
});

test("acquireLogin con siteUsers distintos corre en paralelo", async () => {
  const order = [];
  const releaseA = await acquireLogin("alice@x.com");
  const releaseB = await acquireLogin("bob@y.com");
  // Ambos lograron adquirir sin que el otro suelte — no se serializan.
  order.push("both-acquired");
  releaseA();
  releaseB();

  assert.deepEqual(order, ["both-acquired"]);
});

test("acquireLogin libera correctamente y permite re-acquire", async () => {
  const r1 = await acquireLogin("carol@x.com");
  r1();
  // Re-acquire inmediato debería resolver sin colgarse.
  const r2 = await acquireLogin("carol@x.com");
  r2();
  assert.ok(true);
});

const test = require("node:test");
const assert = require("node:assert/strict");

const { _principalIdForToken } = require("../../src/middleware/auth");

test("principal durable es estable, separa tokens y nunca contiene el token raw", () => {
  const first = _principalIdForToken("token-a");
  const replay = _principalIdForToken("token-a");
  const other = _principalIdForToken("token-b");

  assert.equal(first, replay);
  assert.notEqual(first, other);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first.includes("token-a"), false);
});

test("principal durable sobrevive rotación de token para la misma identidad", () => {
  const beforeRotation = _principalIdForToken("old-token", {
    id: "rag-service",
    email: "rag@example.test",
  });
  const afterRotation = _principalIdForToken("new-token", {
    id: "rag-service",
    email: "rag@example.test",
  });
  const normalizedEmailA = _principalIdForToken("token-a", {
    email: "RAG@EXAMPLE.TEST",
  });
  const normalizedEmailB = _principalIdForToken("token-b", {
    email: "rag@example.test",
  });

  assert.equal(beforeRotation, afterRotation);
  assert.equal(normalizedEmailA, normalizedEmailB);
  assert.notEqual(beforeRotation, normalizedEmailA);
});

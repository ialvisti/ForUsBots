"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  acquireEmailTriggerAccount,
} = require("../../src/bots/forusall-emailtrigger/accountLock");

test("email trigger jobs serialize per portal account", async () => {
  const releaseFirst = await acquireEmailTriggerAccount("Ops@Example.com");
  let secondAcquired = false;
  const second = acquireEmailTriggerAccount("ops@example.com").then(
    (release) => {
      secondAcquired = true;
      return release;
    }
  );

  await Promise.resolve();
  assert.equal(secondAcquired, false);
  releaseFirst();
  const releaseSecond = await second;
  assert.equal(secondAcquired, true);
  releaseSecond();
});

test("email trigger jobs for different accounts can proceed independently", async () => {
  const releaseA = await acquireEmailTriggerAccount("a@example.com");
  const releaseB = await acquireEmailTriggerAccount("b@example.com");
  releaseA();
  releaseB();
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  selectIfPresent,
} = require("../../src/bots/forusall-emailtrigger/flows/_common");

function pageForSelect({ selected = ["627"], readback = "627" } = {}) {
  const element = {
    options: [
      { value: "", textContent: "Choose" },
      { value: "627", textContent: "Plan" },
    ],
  };
  return {
    async waitForSelector() {},
    async waitForTimeout() {},
    async $$eval(_selector, callback, value) {
      return callback([element], value);
    },
    async selectOption() {
      return selected;
    },
    async inputValue() {
      return readback;
    },
  };
}

test("required select proves both Playwright result and DOM readback", async () => {
  assert.equal(
    await selectIfPresent(pageForSelect(), "#plan_id", 627, {
      required: true,
    }),
    true
  );
});

test("required select never swallows selection or readback failure", async () => {
  await assert.rejects(
    selectIfPresent(
      pageForSelect({ selected: [], readback: "" }),
      "#plan_id",
      627,
      { required: true }
    ),
    /Selection failed/
  );
  await assert.rejects(
    selectIfPresent(
      pageForSelect({ selected: ["627"], readback: "628" }),
      "#plan_id",
      627,
      { required: true }
    ),
    /readback mismatch/
  );
});

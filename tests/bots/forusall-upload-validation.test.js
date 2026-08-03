const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parsePositivePlanId,
} = require("../../src/bots/forusall-upload/validation");
const controller = require("../../src/bots/forusall-upload/controller");

test("parsePositivePlanId normalizes valid numeric IDs", () => {
  assert.equal(parsePositivePlanId(580), 580);
  assert.equal(parsePositivePlanId(" 580 "), 580);
  assert.equal(parsePositivePlanId("000580"), 580);
});

test("parsePositivePlanId rejects IDs that cannot identify a portal plan", () => {
  for (const value of [
    undefined,
    null,
    "",
    " ",
    0,
    "0",
    -1,
    "12.5",
    "12x",
  ]) {
    assert.equal(
      parsePositivePlanId(value),
      null,
      `expected ${String(value)} to fail`
    );
  }
});

test("upload controller rejects planId 0 before creating a job", async () => {
  const req = {
    body: Buffer.from("not-used"),
    header(name) {
      const headers = {
        "x-filename": "document.pdf",
        "x-meta": JSON.stringify({
          planId: 0,
          formData: {
            section: "COMPLIANCE",
            caption: "Other",
            status: "Audit Ready",
            effectiveDate: "2025-12-31",
            captionOtherText: "Compliance Package",
          },
        }),
      };
      return headers[name.toLowerCase()];
    },
  };
  const response = {};
  const res = {
    status(code) {
      response.status = code;
      return this;
    },
    json(body) {
      response.body = body;
      return this;
    },
  };

  await controller(req, res);

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "Invalid planId");
  assert.match(response.body.hint, /greater than 0/);
});

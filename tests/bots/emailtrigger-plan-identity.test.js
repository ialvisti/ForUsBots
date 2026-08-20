"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizePlanIdentity,
} = require("../../src/bots/forusall-emailtrigger/planIdentity");

test("plan identity uses the legal name exclusively when it is available", () => {
  assert.deepEqual(
    normalizePlanIdentity(
      {
        plan_id: "627",
        official_plan_name: "Acme 401(k) Plan",
        company_name: "Acme",
        symlink: "acme",
        ein: "12-3456789",
      },
      627
    ),
    {
      planNames: ["Acme 401(k) Plan"],
      ein: "123456789",
    }
  );
});

test("company and short name are fallback aliases only without a legal name", () => {
  assert.deepEqual(
    normalizePlanIdentity(
      {
        plan_id: "627",
        official_plan_name: "",
        company_name: "Acme Industries",
        symlink: "Acme",
        ein: "12-3456789",
      },
      627
    ),
    {
      planNames: ["Acme Industries", "Acme"],
      ein: "123456789",
    }
  );
});

test("plan identity fails closed for a missing or mismatched plan id", () => {
  const base = {
    company_name: "Acme",
    ein: "12-3456789",
  };
  assert.throws(() => normalizePlanIdentity(base, 627), /establish/);
  assert.throws(
    () => normalizePlanIdentity({ ...base, plan_id: "628" }, 627),
    /establish/
  );
});

test("plan identity fails closed without a usable name or EIN", () => {
  assert.throws(
    () => normalizePlanIdentity({ plan_id: "627", ein: "12" }, 627),
    /establish/
  );
  assert.throws(
    () =>
      normalizePlanIdentity(
        { plan_id: "627", company_name: "Acme", ein: "" },
        627
      ),
    /establish/
  );
});

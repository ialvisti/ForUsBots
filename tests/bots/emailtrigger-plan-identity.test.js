"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizePlanIdentity,
} = require("../../src/bots/forusall-emailtrigger/planIdentity");

test("legal plan name excludes short name and company name", () => {
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

test("short name is the only fallback when legal plan name is empty", () => {
  assert.deepEqual(
    normalizePlanIdentity(
      {
        plan_id: "74",
        official_plan_name: "",
        company_name: "ForUsAll",
        symlink: "forus",
        ein: "12-3456789",
      },
      74
    ),
    {
      planNames: ["forus"],
      ein: "123456789",
    }
  );
});

test("legal plan name is normalized without adding other aliases", () => {
  assert.deepEqual(
    normalizePlanIdentity(
      {
        plan_id: "627",
        official_plan_name: "  Acme   401(k) Plan ",
        company_name: "acme 401(K) plan",
        symlink: " Acme ",
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

test("weak short name is rejected even when company name is usable", () => {
  assert.throws(
    () =>
      normalizePlanIdentity(
        {
          plan_id: "627",
          official_plan_name: "",
          company_name: "Acme Industries",
          symlink: "aa",
          ein: "12-3456789",
        },
        627
      ),
    { code: "SAR_PLAN_IDENTITY_FAILED" }
  );
});

test("plan identity fails closed for a missing or mismatched plan id", () => {
  const base = {
    symlink: "Acme",
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
        { plan_id: "627", symlink: "Acme", ein: "" },
        627
      ),
    /establish/
  );
});

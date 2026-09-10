"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const scrapePlanFlow = require("../../src/bots/forusall-scrape-plan/runFlow");

function historyEntry(listItems) {
  const items = listItems.map((textContent) => ({ textContent }));
  return {
    querySelectorAll(selector) {
      return selector === "li" ? items : [];
    },
  };
}

function historyPanel(heading, entries) {
  const body = {
    querySelectorAll(selector) {
      if (selector === ":scope > .scrollbar > div") return entries;
      return [];
    },
  };
  return {
    querySelector(selector) {
      if (selector === ".panel-heading h4, .panel-heading") {
        return { textContent: heading };
      }
      if (selector === ".notes-panel") return body;
      return null;
    },
  };
}

function control({ value = "", tagName = "INPUT", type = "text", checked = false, label = "" }) {
  return {
    value,
    tagName,
    type,
    checked,
    selectedIndex: 0,
    options: [{ textContent: label || value }],
  };
}

function pageFor({ panels, controls = {} }) {
  return {
    async evaluate(callback) {
      const previousDocument = global.document;
      global.document = {
        querySelectorAll(selector) {
          return selector === ".panel" ? panels : [];
        },
        querySelector(selector) {
          return controls[selector] || null;
        },
      };
      try {
        return callback();
      } finally {
        global.document = previousDocument;
      }
    },
  };
}

test("extracts Toolworks lifecycle notes and status transitions by event", async () => {
  const notes = historyPanel("Notes", [
    historyEntry([
      "The snapshot is updated on 2024-12-09 with the following changes",
      "Changed By: plan-admin@example.test",
      "Notes: This plan will terminate/deconvert and the last payroll we should process is 10/24/2024",
      "Changes: active : true to false status : actively_managed to terminated terminated_status_as_of : None to 2024-10-24 employer_contribution_timing : ongoing to year end payroll_xray : None to false",
    ]),
    historyEntry([
      "The snapshot is updated on 2024-05-14 with the following changes",
      "Changed By: another-admin@example.test",
      "Notes: Updated plan ID",
      "Changes: rk_plan_id : old to new",
    ]),
  ]);
  const timeline = historyPanel("TIMELINE", [
    historyEntry([
      "Effective on 2020-09-01 with the following changes",
      "Changed By: plan-admin@example.test",
      "Changes: active : true to false status : actively_managed to terminated terminated_status_as_of : None to 2024-10-24 employer_contribution_timing : ongoing to year end payroll_xray : None to false",
    ]),
  ]);
  const page = pageFor({
    panels: [timeline, notes],
    controls: {
      "#status": control({ tagName: "SELECT", value: "terminated", label: "Terminated" }),
      "#active": control({ tagName: "SELECT", value: "false", label: "False" }),
      "#terminated_status_as_of": control({ value: "2024-10-24" }),
    },
  });

  const result = await scrapePlanFlow.extractPlanHistory(page);

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.extractionStatus, "ok");
  assert.deepEqual(result.current, {
    status: "Terminated",
    active: false,
    statusAsOf: "2024-10-24",
  });
  assert.equal(result.entries[0].occurredAt, "2024-12-09");
  assert.equal(result.entries[0].source, "notes");
  assert.match(result.entries[0].note, /last payroll.*10\/24\/2024/i);
  assert.deepEqual(result.entries[0].changes, [
    { field: "active", from: "true", to: "false" },
    { field: "status", from: "actively_managed", to: "terminated" },
    { field: "terminated_status_as_of", from: "None", to: "2024-10-24" },
  ]);
  assert.equal(result.entries[1].source, "timeline");
  assert.equal(result.entries[1].effectiveOn, "2020-09-01");
  assert.equal(JSON.stringify(result).includes("@example.test"), false);
  assert.deepEqual(result.notes, [
    "This plan will terminate/deconvert and the last payroll we should process is 10/24/2024",
    "Updated plan ID",
  ]);
});

test("distinguishes a missing history panel from an empty history", async () => {
  const missing = await scrapePlanFlow.extractPlanHistory(pageFor({ panels: [] }));
  assert.equal(missing.extractionStatus, "panel_missing");
  assert.deepEqual(missing.entries, []);

  const empty = await scrapePlanFlow.extractPlanHistory(pageFor({
    panels: [historyPanel("notes", [])],
  }));
  assert.equal(empty.extractionStatus, "empty");
  assert.deepEqual(empty.entries, []);
});

test("public formatter preserves legacy notes and structured plan history", () => {
  const formatPublic = require("../../src/bots/forusall-scrape-plan/formatPublic");
  const planHistory = {
    schemaVersion: 1,
    extractionStatus: "ok",
    current: { status: "Terminated", active: false, statusAsOf: "2024-10-24" },
    entries: [],
  };

  const result = formatPublic({
    data: {
      planId: "439",
      modules: [{ key: "basic_info", status: "ok", data: { status: "Terminated" } }],
      notes: ["This plan will terminate/deconvert"],
      planHistory,
    },
  });

  assert.deepEqual(result.notes, ["This plan will terminate/deconvert"]);
  assert.deepEqual(result.planHistory, planHistory);
});

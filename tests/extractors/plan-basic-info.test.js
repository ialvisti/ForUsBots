"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const extractBasicInfo = require("../../src/extractors/forusall-plan/modules/basic_info");

test("empty controls stay empty while display-only plan rows use text fallback", async () => {
  function makeRow(labelText, control, fallbackText = labelText) {
    return {
      offsetParent: {},
      querySelector(selector) {
        if (selector === "label") return { textContent: labelText };
        if (selector === "input, select, textarea") return control;
        if (selector === ".left-align") {
          return { innerText: fallbackText, textContent: fallbackText };
        }
        return null;
      },
    };
  }
  const emptyInput = {
    tagName: "INPUT",
    value: "",
    getAttribute: () => "text",
  };
  const emptySelect = {
    tagName: "SELECT",
    value: "",
    selectedIndex: 0,
    options: [{ textContent: "Company Name" }],
    getAttribute: () => null,
  };
  const emptyTextarea = {
    tagName: "TEXTAREA",
    value: "",
    getAttribute: () => null,
  };
  const rows = [
    makeRow("Legal Plan Name", emptyInput),
    makeRow("Company Name", emptySelect),
    makeRow("Short Name", emptyTextarea),
    makeRow("EIN", null, "12-3456789"),
  ];
  const root = {
    querySelectorAll: () => rows,
  };
  const documentStub = {
    querySelector(selector) {
      if (selector === "#bitemporal-plan-attrs") return root;
      return null;
    },
  };
  const page = {
    async evaluate(callback, options) {
      const previousDocument = global.document;
      const previousWindow = global.window;
      global.document = documentStub;
      global.window = {
        getComputedStyle: () => ({
          display: "block",
          visibility: "visible",
          opacity: "1",
          position: "static",
        }),
      };
      try {
        return callback(options);
      } finally {
        global.document = previousDocument;
        global.window = previousWindow;
      }
    },
  };

  assert.deepEqual(
    await extractBasicInfo(page, {
      fields: ["official_plan_name", "company_name", "symlink", "ein"],
    }),
    {
      data: {
        official_plan_name: "",
        company_name: "",
        symlink: "",
        ein: "12-3456789",
      },
      warnings: [],
      unknownFields: [],
    }
  );
});

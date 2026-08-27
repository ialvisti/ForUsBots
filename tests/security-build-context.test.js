"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

for (const ignoreFile of [".dockerignore", ".gcloudignore"]) {
  test(`${ignoreFile} excludes local credentials and evidence`, () => {
    const patterns = fs.readFileSync(path.join(root, ignoreFile), "utf8");
    for (const required of [
      ".env",
      ".git/",
      "tokens.json",
      "tokens*.json",
      "tmp/",
      ".sessions/",
      ".user-data/",
      "forusall-portal-html-data/",
      ".gcp-config.local",
      ".envv",
      "payload.json",
      "presentation.pdf",
      ".claude/",
      ".cursor/",
      ".firebase/",
    ]) {
      assert.match(patterns, new RegExp(`^${required.replaceAll("*", "\\*")}$`, "m"));
    }
  });
}

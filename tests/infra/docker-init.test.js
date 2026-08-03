const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const dockerfile = fs.readFileSync(
  path.resolve(__dirname, "../../Dockerfile"),
  "utf8"
);

test("production container uses Tini as PID 1", () => {
  assert.match(dockerfile, /\bapt-get install\b[\s\S]*\btini\b/);
  assert.match(dockerfile, /^ENTRYPOINT \["\/usr\/bin\/tini", "--"\]$/m);
});

test("production container launches Node directly", () => {
  assert.match(dockerfile, /^CMD \["node", "src\/index\.js"\]$/m);
  assert.doesNotMatch(dockerfile, /^CMD \["npm", "start"\]$/m);
});

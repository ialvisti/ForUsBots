const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ensureAuthForTarget,
  _internals: { isOnLogin },
} = require("../../src/engine/auth/loginOtp");

const selectors = {
  user: "#user_email",
  pass: "#user_password",
  loginButton: "#new_user input[type=submit]",
};

function pageWithCounts(url, counts = {}) {
  return {
    url: () => url,
    locator: (selector) => ({
      count: async () => counts[selector] || 0,
    }),
  };
}

test("isOnLogin requires the actual login fields, not only a sign_in URL", async () => {
  assert.equal(
    await isOnLogin(pageWithCounts("https://example.test/sign_in"), selectors),
    false
  );

  assert.equal(
    await isOnLogin(
      pageWithCounts("https://example.test/sign_in", {
        "#user_email": 1,
        "#user_password": 1,
      }),
      selectors
    ),
    true
  );
});

test("ensureAuthForTarget reports an invalid target instead of attempting login", async () => {
  const page = {
    ...pageWithCounts("https://example.test/404.html"),
    goto: async () => ({ status: () => 404 }),
    waitForTimeout: async () => {},
  };

  await assert.rejects(
    ensureAuthForTarget(page, {
      loginUrl: "https://example.test/sign_in",
      targetUrl: "https://example.test/plans/0/upload",
      selectors,
      shellSelectors: ["#upload-form"],
      account: {
        siteUser: "user@example.test",
        sitePass: "secret",
        totpSecret: "AAAA",
      },
      saveSession: false,
    }),
    /Target page unavailable.*HTTP 404.*Authentication was not retried/
  );
});

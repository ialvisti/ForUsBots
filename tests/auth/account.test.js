// tests/auth/account.test.js
// Correr con: node --test tests/auth/account.test.js
//
// Limpia y restablece env vars para aislar el FALLBACK (que captura process.env al require).
// Por eso reseteamos el module cache antes de cada caso que necesita un FALLBACK distinto.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const ACCOUNT_MODULE = path.resolve(__dirname, "../../src/auth/account.js");

function freshRequire() {
  delete require.cache[ACCOUNT_MODULE];
  return require(ACCOUNT_MODULE);
}

test("resolveAccount usa el account del token cuando está completo", () => {
  process.env.SITE_USER = "fallback@x.com";
  process.env.SITE_PASS = "fallback-pass";
  process.env.TOTP_SECRET = "FALLBACKSECRET";
  const { resolveAccount } = freshRequire();

  const out = resolveAccount({
    account: {
      alias: "ops-prod",
      siteUser: "ops@forusall.com",
      sitePass: "real-pass",
      totpSecret: "REALSECRET",
    },
  });

  assert.equal(out.alias, "ops-prod");
  assert.equal(out.siteUser, "ops@forusall.com");
  assert.equal(out.sitePass, "real-pass");
  assert.equal(out.totpSecret, "REALSECRET");
});

test("resolveAccount cae al fallback (legacy-shared) cuando token no trae account", () => {
  process.env.SITE_USER = "legacy@x.com";
  process.env.SITE_PASS = "legacy-pass";
  process.env.TOTP_SECRET = "LEGACYSECRET";
  const { resolveAccount } = freshRequire();

  const out = resolveAccount(null);
  assert.equal(out.alias, "legacy-shared");
  assert.equal(out.siteUser, "legacy@x.com");
  assert.equal(out.sitePass, "legacy-pass");
  assert.equal(out.totpSecret, "LEGACYSECRET");
});

test("resolveAccount cae al fallback cuando token.account está incompleto (falta totpSecret)", () => {
  process.env.SITE_USER = "fallback@x.com";
  process.env.SITE_PASS = "fallback-pass";
  process.env.TOTP_SECRET = "FALLBACKSECRET";
  const { resolveAccount } = freshRequire();

  const out = resolveAccount({
    account: { alias: "partial", siteUser: "a@b.com", sitePass: "x" },
  });
  // account incompleto: usa fallback
  assert.equal(out.alias, "legacy-shared");
  assert.equal(out.siteUser, "fallback@x.com");
});

test("resolveAccount con env vacío devuelve nulls", () => {
  delete process.env.SITE_USER;
  delete process.env.SITE_PASS;
  delete process.env.TOTP_SECRET;
  const { resolveAccount } = freshRequire();

  const out = resolveAccount(null);
  assert.equal(out.siteUser, null);
  assert.equal(out.sitePass, null);
  assert.equal(out.totpSecret, null);
});

test("resolveAccount normaliza totpSecret (uppercase, sin espacios)", () => {
  const { resolveAccount } = freshRequire();
  const out = resolveAccount({
    account: {
      alias: "ops",
      siteUser: "ops@x.com",
      sitePass: "p",
      totpSecret: "ab cd ef gh",
    },
  });
  assert.equal(out.totpSecret, "ABCDEFGH");
});

test("publicView enmascara el email y omite secretos", () => {
  const { publicView } = freshRequire();
  const view = publicView({
    alias: "ops-prod",
    siteUser: "operations@forusall.com",
    sitePass: "should-not-appear",
    totpSecret: "SHOULDNOTAPPEAR",
  });
  assert.equal(view.alias, "ops-prod");
  assert.equal(view.siteUser, "o***@forusall.com");
  assert.equal(view.sitePass, undefined);
  assert.equal(view.totpSecret, undefined);
});

test("maskEmail edge cases", () => {
  const { maskEmail } = freshRequire();
  assert.equal(maskEmail(null), null);
  assert.equal(maskEmail(""), null);
  assert.equal(maskEmail("a@b.com"), "***");
  assert.equal(maskEmail("ab@c.com"), "a***@c.com");
});

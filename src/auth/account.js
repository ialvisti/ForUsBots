// src/auth/account.js
// Resuelve la cuenta del portal ForUsAll que un job debe usar.
// Si el token trae `account: { alias, siteUser, sitePass, totpSecret }` (fase 02),
// se usa eso. Si no, cae al `.env` global (grace period para tokens legacy).
//
// NUNCA serializar el resultado completo en respuestas HTTP ni en logs. Usar publicView().

const FALLBACK = Object.freeze({
  alias: "legacy-shared",
  siteUser: process.env.SITE_USER || null,
  sitePass: process.env.SITE_PASS || null,
  totpSecret:
    (process.env.TOTP_SECRET || "").replace(/\s+/g, "").toUpperCase() || null,
});

function resolveAccount(tokenMeta) {
  const acc = tokenMeta && tokenMeta.account;
  if (acc && acc.siteUser && acc.sitePass && acc.totpSecret) {
    return {
      alias: String(acc.alias || acc.siteUser),
      siteUser: acc.siteUser,
      sitePass: acc.sitePass,
      totpSecret: String(acc.totpSecret).replace(/\s+/g, "").toUpperCase(),
    };
  }
  return { ...FALLBACK };
}

function maskEmail(email) {
  if (!email) return null;
  const s = String(email);
  const at = s.indexOf("@");
  if (at <= 1) return "***";
  return s.slice(0, 1) + "***" + s.slice(at);
}

function publicView(account) {
  if (!account) return null;
  return { alias: account.alias, siteUser: maskEmail(account.siteUser) };
}

module.exports = { resolveAccount, publicView, maskEmail, FALLBACK };

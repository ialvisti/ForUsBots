// src/config.js
// Solo variables de entorno que necesita el runtime del bot.

function envBool(v, def = false) {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return def;
}

const SITE_USER = process.env.SITE_USER || '';
const SITE_PASS = process.env.SITE_PASS || '';
const TOTP_SECRET = (process.env.TOTP_SECRET || '').replace(/\s+/g, '').toUpperCase();

const MAX_CONCURRENCY = Math.max(1, parseInt(process.env.MAX_CONCURRENCY || '3', 10));
// Duración de la ventana TOTP (segundos). Normalmente 30s.
const TOTP_STEP_SECONDS = Math.max(15, parseInt(process.env.TOTP_STEP_SECONDS || '30', 10));

// === SSN Reveal controls ===
const REVEAL_FULL_SSN = envBool(process.env.REVEAL_FULL_SSN, false);
// Tiempo de espera (ms) tras hacer click en "reveal" para que aparezca #ssn_row
const SSN_REVEAL_WAIT_MS = Math.max(300, parseInt(process.env.SSN_REVEAL_WAIT_MS || '1500', 10));

module.exports = {
  SITE_USER,
  SITE_PASS,
  TOTP_SECRET,
  MAX_CONCURRENCY,
  TOTP_STEP_SECONDS,
  // exports nuevos
  REVEAL_FULL_SSN,
  SSN_REVEAL_WAIT_MS,
};

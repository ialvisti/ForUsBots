// src/config.js
// Solo variables de entorno que necesita el runtime del bot.

const SITE_USER = process.env.SITE_USER || '';
const SITE_PASS = process.env.SITE_PASS || '';
const TOTP_SECRET = (process.env.TOTP_SECRET || '').replace(/\s+/g, '').toUpperCase();

const MAX_CONCURRENCY = Math.max(1, parseInt(process.env.MAX_CONCURRENCY || '3', 10));
// Duración de la ventana TOTP (segundos). Normalmente 30s.
const TOTP_STEP_SECONDS = Math.max(15, parseInt(process.env.TOTP_STEP_SECONDS || '30', 10));

module.exports = {
  SITE_USER,
  SITE_PASS,
  TOTP_SECRET,
  MAX_CONCURRENCY,
  TOTP_STEP_SECONDS,
};

// src/server.js
const express = require('express');
const path = require('path');
const fs = require('fs');

const { getSettings } = require('./engine/settings');
const { resolveRole } = require('./middleware/auth');

const app = express();

// ===== Body parsers (para PATCH /settings y demás JSON) =====
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));

// ===== Helpers =====
function noCache(_req, res, next) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
}
function readCookie(req, key) {
  const raw = req.headers.cookie || '';
  const parts = raw.split(';').map(s => s.trim()).filter(Boolean);
  for (const p of parts) {
    const i = p.indexOf('=');
    if (i > 0) {
      const k = p.slice(0, i);
      if (k === key) return decodeURIComponent(p.slice(i + 1));
    }
  }
  return null;
}
function isSecureReq(req) {
  const xfwd = (req.headers['x-forwarded-proto'] || '').toString().toLowerCase();
  return req.secure || xfwd.includes('https');
}
function setAuthCookie(req, res, token, maxAgeSeconds = 60 * 60 * 24 * 7) {
  const secure = process.env.COOKIE_SECURE === '1' || isSecureReq(req);
  const pieces = [
    `forusbot_token=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`
  ];
  if (secure) pieces.push('Secure');
  res.setHeader('Set-Cookie', pieces.join('; '));
}
function clearAuthCookie(req, res) {
  const secure = process.env.COOKIE_SECURE === '1' || isSecureReq(req);
  const pieces = [
    'forusbot_token=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (secure) pieces.push('Secure');
  res.setHeader('Set-Cookie', pieces.join('; '));
}

// === Auto-logout: si sales de /evidence, se borra la cookie ===
app.use((req, res, next) => {
  const p = req.path || '';
  const inEvidenceArea =
    p === '/evidence' ||
    p.startsWith('/evidence/') ||
    p === '/forusbot/evidence/login';
  if (!inEvidenceArea && readCookie(req, 'forusbot_token')) {
    clearAuthCookie(req, res);
  }
  next();
});

// ===== Rutas estáticas =====
const DOCS_DIR = path.join(__dirname, '..', 'docs');
app.use('/docs', express.static(DOCS_DIR, { index: 'index.html' }));

// Evidence (configurable) – con fallback si falta serve-index
const EVIDENCE_DIR = process.env.EVIDENCE_DIR || '/tmp/evidence';
try { fs.mkdirSync(EVIDENCE_DIR, { recursive: true }); } catch {}

let serveIndex = null;
try { serveIndex = require('serve-index'); } catch (_) { serveIndex = null; }

// Gate por flags y rol (acepta header o cookie)
function evidenceGate(req, res, next) {
  const flags = (getSettings().flags) || {};
  if (flags.evidencePublic) return next();

  const token = req.header('x-auth-token') || readCookie(req, 'forusbot_token');
  const role = resolveRole(token);
  if (!role) return res.status(401).json({ ok: false, error: 'unauthorized' });
  if (flags.evidenceAdminOnly && role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  return next();
}

// ===== Login para /evidence (set-cookie). NO hay /logout (auto-logout) =====
app.post('/forusbot/evidence/login', (req, res) => {
  try {
    const token = req.header('x-auth-token') || (req.body && req.body.token);
    const role = resolveRole(token);
    if (!role) return res.status(401).json({ ok: false, error: 'unauthorized' });
    setAuthCookie(req, res, token);
    return res.json({ ok: true, role, hint: 'Cookie set. Open /evidence on this origin.' });
  } catch (e) {
    console.error('[evidence login] error', e);
    return res.status(500).json({ ok: false, error: 'login error' });
  }
});

// ===== Montaje de /evidence (protegido por gate) =====
if (serveIndex) {
  app.use('/evidence', noCache, evidenceGate, express.static(EVIDENCE_DIR));
  app.use('/evidence', noCache, evidenceGate, serveIndex(EVIDENCE_DIR, { icons: true }));
} else {
  app.use('/evidence', noCache, evidenceGate, express.static(EVIDENCE_DIR));
}

// ===== API namespaced =====
app.use('/forusbot', require('./routes'));

// ===== Health (compat y namespaced) =====
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/forusbot/health', (_req, res) => res.json({ ok: true }));

// ===== 404 =====
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not Found' });
});

// ===== Error handler =====
app.use((err, _req, res, _next) => {
  console.error('[express error]', err && err.stack ? err.stack : err);
  res.status(500).json({ ok: false, error: 'Internal Server Error' });
});

module.exports = app;

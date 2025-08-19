// src/server.js
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();

// ===== Body parsers (para PATCH /settings y demás JSON) =====
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));

// ===== Rutas estáticas =====
const DOCS_DIR = path.join(__dirname, '..', 'docs');
app.use('/docs', express.static(DOCS_DIR, { index: 'index.html' }));

// Evidence (dev only) – con fallback si falta serve-index
const EVIDENCE_DIR = process.env.EVIDENCE_DIR || '/tmp/evidence';
try { fs.mkdirSync(EVIDENCE_DIR, { recursive: true }); } catch {}

let serveIndex = null;
try {
  // Si está instalada, la usamos para listar el dir
  // npm i serve-index --save
  serveIndex = require('serve-index');
} catch (_) {
  // No instalada: seguimos sin crashear
  serveIndex = null;
}

if (serveIndex) {
  app.use('/evidence', express.static(EVIDENCE_DIR));
  app.use('/evidence', serveIndex(EVIDENCE_DIR, { icons: true }));
} else {
  // Sin índice, sólo archivos estáticos
  app.use('/evidence', express.static(EVIDENCE_DIR));
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

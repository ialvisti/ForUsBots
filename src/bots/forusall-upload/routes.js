// src/bots/forusall-upload/routes.js
const router = require('express').Router();
const bodyParser = require('body-parser');
const auth = require('../../middleware/auth');
const controller = require('./controller');

// Middleware: adjunta createdBy (desde req.auth) dentro de x-meta (JSON)
function attachCreatorToMetaHeader(req, _res, next) {
  try {
    const a = req.auth || {};
    const u = a.user || null;
    // Sólo si tenemos identidad resuelta por el middleware de auth
    if (!a.role || !u) return next();

    const raw = req.headers['x-meta']; // Express normaliza a lowercase
    if (!raw) return next(); // el controller ya validará si falta

    let meta;
    try { meta = JSON.parse(raw); } catch { meta = null; }
    if (!meta || typeof meta !== 'object') return next();

    // Forzar la verdad del servidor (evita spoofing del cliente)
    meta.createdBy = {
      name: u.name || null,
      email: u.email || null,
      id: u.id || null,
      role: a.role || (a.isAdmin ? 'admin' : 'user'),
      at: new Date().toISOString()
    };

    req.headers['x-meta'] = JSON.stringify(meta);
  } catch (_) {
    // Nunca bloquear por fallo de enriquecimiento; el controller sigue su flujo
  }
  next();
}

// Endpoint único: POST /forusbot/vault-file-upload
router.post(
  '/',
  auth, // resuelve req.auth { role, isAdmin, user }
  attachCreatorToMetaHeader, // inserta createdBy en x-meta
  bodyParser.raw({ type: ['application/pdf', 'application/octet-stream'], limit: '50mb' }),
  controller
);

module.exports = router;

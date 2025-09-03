// src/bots/forusall-emailtrigger/routes.js
const router = require('express').Router();
const bodyParser = require('body-parser');
const auth = require('../../middleware/auth');
const controller = require('./controller');

// Middleware: adjunta createdBy (desde req.auth) dentro del body (JSON)
function attachCreatorToBody(req, _res, next) {
  try {
    const a = req.auth || {};
    const u = a.user || null;
    if (!u || !a.role) return next();

    if (!req.body || typeof req.body !== 'object') return next();

    // Forzar la verdad del servidor para trazabilidad
    req.body.createdBy = {
      name: u.name || null,
      email: u.email || null,
      id: u.id || null,
      role: a.role || (a.isAdmin ? 'admin' : 'user'),
      at: new Date().toISOString(),
    };
  } catch (_) {
    // nunca bloquear por error de enriquecimiento
  }
  next();
}

// Endpoint único: POST /forusbot/emailtrigger
router.post(
  '/',
  auth, // req.auth { role, isAdmin, user }
  bodyParser.json({ limit: '1mb' }),
  attachCreatorToBody,
  controller
);

module.exports = router;

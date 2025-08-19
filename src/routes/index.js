// src/routes/index.js
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const forusUploadRoutes = require('../bots/forusall-upload/routes');
const queue = require('../engine/queue');
const { getLoginLocksStatus } = require('../engine/loginLock');
const auth = require('../middleware/auth');
const { getSettings, patchSettings } = require('../engine/settings');

// Decide si /status es público según flag
function maybeProtectStatus() {
  const s = getSettings();
  return s.flags && s.flags.statusPublic ? [] : [auth];
}

// Health “global” del namespace /forusbot
router.get('/health', (_req, res) => res.json({ ok: true }));

// Estado de la cola / ejecución + candados de login/OTP
router.get('/status', ...maybeProtectStatus(), (_req, res) => {
  try {
    const status = queue.getStatus();
    const locks = getLoginLocksStatus();
    return res.json({
      ...status,
      loginLocks: locks.locks,
      totpStepSeconds: locks.stepSeconds,
    });
  } catch (e) {
    console.error('[status error]', e);
    return res.status(500).json({ ok: false, error: 'No se pudo obtener el estado' });
  }
});

// ===== Jobs =====

// Listar jobs (running, queued, finished) con filtros
router.get('/jobs', auth, (req, res) => {
  try {
    const { state, botId, limit, offset } = req.query || {};
    const out = queue.listJobs({ state, botId, limit, offset });
    return res.json(out);
  } catch (e) {
    console.error('[jobs list] error', e);
    return res.status(500).json({ ok: false, error: 'No se pudo listar jobs' });
  }
});

// Obtener estado de un job por id
router.get('/jobs/:id', auth, (req, res) => {
  const job = queue.getJob(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: 'Job no encontrado' });
  return res.json(job);
});

// Cancelar un job en cola
router.delete('/jobs/:id', auth, (req, res) => {
  try {
    const r = queue.cancel(req.params.id);
    if (!r.ok && r.reason === 'not_found') {
      return res.status(404).json({ ok: false, error: 'Job no encontrado' });
    }
    if (r.ok && !r.canceled && r.reason === 'running') {
      return res.status(409).json({ ok: false, error: 'No se puede cancelar: job en ejecución' });
    }
    return res.json({ ok: true, canceled: !!r.canceled, reason: r.reason || null });
  } catch (e) {
    console.error('[jobs delete] error', e);
    return res.status(500).json({ ok: false, error: 'No se pudo cancelar el job' });
  }
});

// ===== Locks =====
router.get('/locks', auth, (_req, res) => {
  try {
    const locks = getLoginLocksStatus();
    return res.json(locks);
  } catch (e) {
    console.error('[locks] error', e);
    return res.status(500).json({ ok: false, error: 'No se pudo obtener locks' });
  }
});

// ===== Settings =====
router.get('/settings', auth, (_req, res) => {
  try {
    const s = getSettings();
    return res.json({ ok: true, settings: s, capacity: queue.getStatus().capacity });
  } catch (e) {
    console.error('[settings get] error', e);
    return res.status(500).json({ ok: false, error: 'No se pudo obtener settings' });
  }
});

router.patch('/settings', auth, (req, res) => {
  try {
    const partial = req.body && typeof req.body === 'object' ? req.body : {};
    const result = patchSettings(partial);
    // Si cambió concurrencia, intentamos arrancar más jobs
    if (result.changed.includes('maxConcurrency')) {
      queue.kick();
    }
    return res.json({ ok: true, ...result, capacity: queue.getStatus().capacity });
  } catch (e) {
    console.error('[settings patch] error', e);
    return res.status(400).json({ ok: false, error: e && e.message ? e.message : 'patch inválido' });
  }
});

// ===== Métricas =====
router.get('/metrics', auth, (_req, res) => {
  try {
    const m = queue.getMetrics();
    return res.json(m);
  } catch (e) {
    console.error('[metrics] error', e);
    return res.status(500).json({ ok: false, error: 'No se pudo obtener métricas' });
  }
});

// ===== Versión =====
router.get('/version', auth, (_req, res) => {
  try {
    const pkg = require('../../package.json');
    return res.json({ ok: true, name: pkg.name, version: pkg.version });
  } catch (e) {
    console.error('[version] error', e);
    return res.status(500).json({ ok: false, error: 'No se pudo leer package.json' });
  }
});

// ===== OpenAPI (YAML) =====
router.get('/openapi', auth, (_req, res) => {
  try {
    const openapiPath = path.join(__dirname, '..', '..', 'docs', 'openapi.yaml');
    if (!fs.existsSync(openapiPath)) {
      return res.status(404).json({ ok: false, error: 'openapi.yaml no encontrado' });
    }
    res.type('text/yaml');
    return res.send(fs.readFileSync(openapiPath, 'utf8'));
  } catch (e) {
    console.error('[openapi] error', e);
    return res.status(500).json({ ok: false, error: 'No se pudo servir OpenAPI' });
  }
});

// Monta el bot: /forusbot/vault-file-upload
router.use('/vault-file-upload', forusUploadRoutes);

module.exports = router;

// src/routes/index.js
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const express = require('express');

const forusUploadRoutes = require('../bots/forusall-upload/routes');
const scrapeParticipantRoutes = require('../bots/forusall-scrape-participant/routes');
const queue = require('../engine/queue');
const { getLoginLocksStatus } = require('../engine/loginLock');
const auth = require('../middleware/auth'); // default = requireUser (compat)
const { requireAdmin, requireUser } = require('../middleware/auth');
const { getSettings, patchSettings } = require('../engine/settings');

// Decide si /status es público o requiere rol según flags
function maybeProtectStatus() {
  const s = getSettings();
  const flags = (s && s.flags) || {};
  if (flags.statusPublic) return [];              // público
  if (flags.statusAdminOnly) return [requireAdmin]; // solo admin
  return [requireUser];                           // requiere usuario (o admin)
}

// Health “global” del namespace /forusbot
router.get('/health', (_req, res) => res.json({ ok: true }));

// Estado de la cola / ejecución + candados de login/OTP
router.get('/status', ...maybeProtectStatus(), (_req, res) => {
  try {
    const status = queue.getStatus();
    const locks = getLoginLocksStatus();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
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
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found' });
  return res.json(job);
});

// Cancelar un job en cola
router.delete('/jobs/:id', auth, (req, res) => {
  try {
    const r = queue.cancel(req.params.id);
    if (!r.ok && r.reason === 'not_found') {
      return res.status(404).json({ ok: false, error: 'Job not found' });
    }
    if (r.ok && !r.canceled && r.reason === 'running') {
      return res.status(409).json({ ok: false, error: 'Cannot cancel: job is running' });
    }
    return res.json({ ok: true, canceled: !!r.canceled, reason: r.reason || null });
  } catch (e) {
    console.error('[jobs delete] error', e);
    return res.status(500).json({ ok: false, error: 'Could not cancel job' });
  }
});

// ===== Locks (ADMIN) =====
router.get('/locks', requireAdmin, (_req, res) => {
  try {
    const locks = getLoginLocksStatus();
    return res.json(locks);
  } catch (e) {
    console.error('[locks] error', e);
    return res.status(500).json({ ok: false, error: 'Could not obtain locks' });
  }
});

// ===== Settings (ADMIN) =====
router.get('/settings', requireAdmin, (_req, res) => {
  try {
    const s = getSettings();
    return res.json({ ok: true, settings: s, capacity: queue.getStatus().capacity });
  } catch (e) {
    console.error('[settings get] error', e);
    return res.status(500).json({ ok: false, error: 'Could not obtain settings' });
  }
});

router.patch('/settings', requireAdmin, (req, res) => {
  try {
    const partial = req.body && typeof req.body === 'object' ? req.body : {};
    const result = patchSettings(partial);
    if (result.changed.includes('maxConcurrency')) {
      queue.kick();
    }
    return res.json({ ok: true, ...result, capacity: queue.getStatus().capacity });
  } catch (e) {
    console.error('[settings patch] error', e);
    return res.status(400).json({ ok: false, error: e && e.message ? e.message : 'Invalid patch' });
  }
});

// ===== WhoAmI (auth) =====
router.get('/whoami', auth, (req, res) => {
  try {
    const a = req.auth || {};
    return res.json({
      ok: true,
      role: a.role || null,
      isAdmin: !!a.isAdmin,
      user: a.user || null
    });
  } catch (e) {
    console.error('[whoami] error', e);
    return res.status(500).json({ ok: false, error: 'whoami error' });
  }
});

// ===== Métricas (ADMIN) =====
router.get('/metrics', requireAdmin, (_req, res) => {
  try {
    const m = queue.getMetrics();
    return res.json(m);
  } catch (e) {
    console.error('[metrics] error', e);
    return res.status(500).json({ ok: false, error: 'Could not get metrics' });
  }
});

// ===== Versión (ADMIN) =====
router.get('/version', requireAdmin, (_req, res) => {
  try {
    const pkg = require('../../package.json');
    return res.json({ ok: true, name: pkg.name, version: pkg.version });
  } catch (e) {
    console.error('[version] error', e);
    return res.status(500).json({ ok: false, error: 'Could not obtain package.json' });
  }
});

// ===== OpenAPI (YAML) (ADMIN) =====
router.get('/openapi', requireAdmin, (_req, res) => {
  try {
    const openapiPath = path.join(__dirname, '..', '..', 'docs', 'openapi.yaml');
    if (!fs.existsSync(openapiPath)) {
      return res.status(404).json({ ok: false, error: 'openapi.yaml not found' });
    }
    res.type('text/yaml');
    return res.send(fs.readFileSync(openapiPath, 'utf8'));
  } catch (e) {
    console.error('[openapi] error', e);
    return res.status(500).json({ ok: false, error: 'Could not serve OpenAPI' });
  }
});

// ===== Sandbox Dry-Run (opcional, sin auth) =====
router.post(
  '/sandbox/vault-file-upload',
  express.raw({ type: '*/*', limit: '20mb' }),
  (req, res) => {
    try {
      const warnings = [];
      const filenameHdr = req.header('x-filename');
      const metaHdr = req.header('x-meta');

      if (!filenameHdr) {
        return res.status(400).json({ ok: false, error: 'Missing header x-filename', warnings });
      }
      const safeBase = require('path').basename(String(filenameHdr).trim());
      const ext = require('path').extname(safeBase).toLowerCase();
      if (!ext || ext !== '.pdf') {
        return res.status(400).json({
          ok: false,
          errorType: 'validation',
          error: "x-filename must end with '.pdf'",
          warnings
        });
      }

      if (!metaHdr) {
        return res.status(400).json({ ok: false, error: 'Missing header x-meta', warnings });
      }

      let metaIn;
      try { metaIn = JSON.parse(metaHdr); }
      catch (e) {
        return res.status(400).json({
          ok: false,
          errorType: 'parse',
          error: 'x-meta is not valid JSON',
          parseMessage: e && e.message ? e.message : String(e),
          warnings
        });
      }

      const missing = [];
      if (metaIn.planId === undefined || metaIn.planId === null || String(metaIn.planId).trim?.() === '') missing.push('planId');
      const f = (metaIn.formData && typeof metaIn.formData === 'object') ? metaIn.formData : null;
      if (!f) missing.push('formData');
      else {
        ['section','caption','status','effectiveDate'].forEach(k=>{
          if (f[k] === undefined || f[k] === null || String(f[k]).trim() === '') missing.push(`formData.${k}`);
        });
        const isOther = String(f.caption||'').trim().toLowerCase() === 'other';
        if (isOther && (!f.captionOtherText || String(f.captionOtherText).trim() === '')) {
          missing.push('formData.captionOtherText (required when caption=Other)');
        }
      }
      if (missing.length) {
        return res.status(400).json({
          ok:false, errorType:'validation', error:'Missing fields in x-meta', missing, warnings
        });
      }

      const hasBinary = !!(req.body && req.body.length);
      if (hasBinary && /^document\s+missing$/i.test(String(f.status||''))) {
        return res.status(422).json({
          ok:false, errorType:'validation',
          error: "Status 'Document Missing' is not valid when a file is attached",
          hint: "Use 'Audit Ready' or another status allowed by the portal",
          warnings
        });
      }

      const isOther = String(f.caption||'').trim().toLowerCase() === 'other';
      if (!isOther && f.captionOtherText && String(f.captionOtherText).trim() !== '') {
        warnings.push("captionOtherText was ignored because caption != 'Other'");
      }

      return res.json({
        ok: true,
        mode: 'dry-run',
        receivedBinaryBytes: hasBinary ? req.body.length : 0,
        normalized: {
          filename: safeBase,
          meta: metaIn
        },
        warnings
      });
    } catch (e) {
      console.error('[sandbox dry-run] error', e);
      return res.status(500).json({ ok:false, error: 'Could not process dry-run' });
    }
  }
);

// Monta el bot: /forusbot/vault-file-upload
router.use('/vault-file-upload', forusUploadRoutes);

// Monta el bot: /forusbot/scrape-participant
router.use('/scrape-participant', scrapeParticipantRoutes);

module.exports = router;

// src/engine/settings.js
// Settings en memoria (por proceso) con patch seguro.

const { MAX_CONCURRENCY: CFG_MAX } = require('../config');

function envBool(v, def) {
  if (v === undefined) return def;
  const s = String(v).trim().toLowerCase();
  if (['1','true','yes','y','on'].includes(s)) return true;
  if (['0','false','no','n','off'].includes(s)) return false;
  return def;
}

const _state = {
  // Concurrencia dinámica (se puede cambiar por PATCH /settings)
  maxConcurrency: Number.isFinite(CFG_MAX) && CFG_MAX > 0 ? CFG_MAX : 3,

  // Flags varios
  flags: {
    // /forusbot/status
    statusPublic:     envBool(process.env.STATUS_PUBLIC, true),   // compat: antes era público por defecto
    statusAdminOnly:  envBool(process.env.STATUS_ADMIN_ONLY, false),

    // /evidence
    evidencePublic:    envBool(process.env.EVIDENCE_PUBLIC, false),
    evidenceAdminOnly: envBool(process.env.EVIDENCE_ADMIN_ONLY, false),
  },
};

function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}

/** Devuelve un snapshot de settings (copia). */
function getSettings() {
  return deepClone(_state);
}

/**
 * Aplica un patch parcial. Estructura esperada:
 * {
 *   maxConcurrency?: number >= 1
 *   flags?: {
 *     statusPublic?: boolean
 *     statusAdminOnly?: boolean
 *     evidencePublic?: boolean
 *     evidenceAdminOnly?: boolean
 *   }
 * }
 */
function patchSettings(partial = {}) {
  const before = getSettings();
  const changed = [];

  if (partial && Object.prototype.hasOwnProperty.call(partial, 'maxConcurrency')) {
    const n = Number(partial.maxConcurrency);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error('maxConcurrency debe ser un número >= 1');
    }
    if (_state.maxConcurrency !== n) {
      _state.maxConcurrency = Math.floor(n);
      changed.push('maxConcurrency');
    }
  }

  if (partial && typeof partial.flags === 'object' && partial.flags !== null) {
    const f = partial.flags;

    if (Object.prototype.hasOwnProperty.call(f, 'statusPublic')) {
      const v = !!f.statusPublic;
      if (_state.flags.statusPublic !== v) {
        _state.flags.statusPublic = v;
        changed.push('flags.statusPublic');
      }
      if (v) { // si es público, no puede ser admin-only
        if (_state.flags.statusAdminOnly !== false) {
          _state.flags.statusAdminOnly = false;
          changed.push('flags.statusAdminOnly');
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(f, 'statusAdminOnly')) {
      const v = !!f.statusAdminOnly;
      if (_state.flags.statusAdminOnly !== v) {
        _state.flags.statusAdminOnly = v;
        changed.push('flags.statusAdminOnly');
      }
      if (v) { // si es admin-only, no es público
        if (_state.flags.statusPublic !== false) {
          _state.flags.statusPublic = false;
          changed.push('flags.statusPublic');
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(f, 'evidencePublic')) {
      const v = !!f.evidencePublic;
      if (_state.flags.evidencePublic !== v) {
        _state.flags.evidencePublic = v;
        changed.push('flags.evidencePublic');
      }
      if (v) { // si es público, no puede ser admin-only
        if (_state.flags.evidenceAdminOnly !== false) {
          _state.flags.evidenceAdminOnly = false;
          changed.push('flags.evidenceAdminOnly');
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(f, 'evidenceAdminOnly')) {
      const v = !!f.evidenceAdminOnly;
      if (_state.flags.evidenceAdminOnly !== v) {
        _state.flags.evidenceAdminOnly = v;
        changed.push('flags.evidenceAdminOnly');
      }
      if (v) { // si es admin-only, no es público
        if (_state.flags.evidencePublic !== false) {
          _state.flags.evidencePublic = false;
          changed.push('flags.evidencePublic');
        }
      }
    }
  }

  return {
    ok: true,
    changed,
    previous: before,
    settings: getSettings(),
  };
}

module.exports = {
  getSettings,
  patchSettings,
};

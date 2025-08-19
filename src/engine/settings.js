// src/engine/settings.js
// Settings en memoria (por proceso) con patch seguro.

const { MAX_CONCURRENCY: CFG_MAX } = require('../config');

const _state = {
  // Concurrencia dinámica (se puede cambiar por PATCH /settings)
  maxConcurrency: Number.isFinite(CFG_MAX) && CFG_MAX > 0 ? CFG_MAX : 3,

  // Flags varios
  flags: {
    // Si true, /forusbot/status es público; si false, requiere x-auth-token
    statusPublic: true,
  },
};

function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}

/**
 * Devuelve un snapshot de settings (copia).
 */
function getSettings() {
  return deepClone(_state);
}

/**
 * Aplica un patch parcial. Estructura esperada:
 * {
 *   maxConcurrency?: number >= 1
 *   flags?: { statusPublic?: boolean }
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

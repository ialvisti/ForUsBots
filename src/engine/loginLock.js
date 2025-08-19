// src/engine/loginLock.js
// Candado por usuario para serializar el login/OTP,
// y compuerta para no reusar el mismo TOTP step (30s por defecto).

const { TOTP_STEP_SECONDS } = require('../config');

const stepMs = (Number(TOTP_STEP_SECONDS) || 30) * 1000;

// Mutex sencillo por clave (usuario)
class Mutex {
  constructor() {
    this.locked = false;
    this.queue = [];
  }
  async acquire() {
    return new Promise(resolve => {
      if (!this.locked) {
        this.locked = true;
        resolve(this._release.bind(this));
      } else {
        this.queue.push(resolve);
      }
    });
  }
  _release() {
    const next = this.queue.shift();
    if (next) next(this._release.bind(this));
    else this.locked = false;
  }
}

const mutexByUser = new Map();      // user -> Mutex
const lastStepByUser = new Map();   // user -> last step number used successfully

function getMutex(user) {
  const key = String(user || 'default');
  if (!mutexByUser.has(key)) mutexByUser.set(key, new Mutex());
  return mutexByUser.get(key);
}

function currentTotpStep() {
  return Math.floor(Date.now() / stepMs);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Espera hasta que cambie el step TOTP si ya fue usado en este usuario.
 * Añade un pequeño colchón de 250ms para evitar carrera al borde de ventana.
 */
async function waitNewTotpWindowIfNeeded(user) {
  const key = String(user || 'default');
  const last = lastStepByUser.get(key);
  const nowStep = currentTotpStep();
  if (last === nowStep) {
    const msUntilNext = stepMs - (Date.now() % stepMs) + 250;
    await sleep(msUntilNext);
  }
}

function markTotpUsed(user) {
  const key = String(user || 'default');
  lastStepByUser.set(key, currentTotpStep());
}

/**
 * Adquiere el candado por usuario. Devuelve una función release().
 */
async function acquireLogin(user) {
  const m = getMutex(user);
  const release = await m.acquire();
  return release;
}

/**
 * Introspección para el endpoint de estado.
 * Devuelve { ok, stepSeconds, locks: { [user]: { state, queueSize, currentStep, lastStepUsed, lastStepAgeSeconds } } }
 */
function getLoginLocksStatus() {
  const users = new Set([...mutexByUser.keys(), ...lastStepByUser.keys()]);
  const locks = {};
  const now = Date.now();
  for (const user of users) {
    const m = mutexByUser.get(user);
    const locked = !!(m && m.locked);
    const queueSize = m ? m.queue.length : 0;
    const lastStep = lastStepByUser.get(user);
    const lastStepAgeSeconds = (typeof lastStep === 'number')
      ? Math.floor((now - (lastStep * stepMs)) / 1000)
      : null;

    locks[user] = {
      state: locked ? 'locked' : 'free',
      queueSize,
      currentStep: currentTotpStep(),
      lastStepUsed: (typeof lastStep === 'number') ? lastStep : null,
      lastStepAgeSeconds,
    };
  }
  return { ok: true, stepSeconds: stepMs / 1000, locks };
}

module.exports = {
  acquireLogin,
  waitNewTotpWindowIfNeeded,
  markTotpUsed,
  getLoginLocksStatus,
};

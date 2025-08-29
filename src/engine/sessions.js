// src/engine/sessions.js
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");

function envBool(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

const ROOT = path.resolve(
  process.env.SESSIONS_DIR || path.join(__dirname, "..", "..", ".sessions")
);
const TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 0);
const REUSE = envBool(process.env.SESSION_REUSE ?? "1"); // por defecto ON

function sanitizeUser(u) {
  return String(u || "default")
    .toLowerCase()
    .replace(/[^a-z0-9_.@-]+/g, "_");
}
function ensureDirSync(p) {
  try {
    fsSync.mkdirSync(p, { recursive: true, mode: 0o700 });
  } catch {}
}
function getSessionPath(userEmail) {
  const base = sanitizeUser(userEmail);
  return path.join(ROOT, `${base}.json`);
}

async function loadStorageStatePath(userEmail) {
  if (!REUSE) return null;
  const p = getSessionPath(userEmail);
  try {
    const st = await fs.stat(p);
    if (!st.isFile()) return null;
    if (TTL_HOURS > 0) {
      const ageMs = Date.now() - st.mtimeMs;
      if (ageMs > TTL_HOURS * 3600_000) return null; // expiró
    }
    return p;
  } catch {
    return null;
  }
}

async function saveContextStorageState(context, userEmail) {
  if (!REUSE) return;
  const p = getSessionPath(userEmail);
  ensureDirSync(path.dirname(p));
  await context.storageState({ path: p });
  try {
    fsSync.chmodSync(p, 0o600);
  } catch {}
}

module.exports = {
  getSessionPath,
  loadStorageStatePath,
  saveContextStorageState,
};

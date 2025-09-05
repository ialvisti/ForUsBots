// src/middleware/auth.js
// API-key auth con roles + metadatos (name/email/id) cargados EXCLUSIVAMENTE desde archivo JSON.
// + Sesiones efímeras en memoria (TTL por default 30 min) para ADMIN UI.
// NO hay soporte de ADMIN_TOKENS / USER_TOKENS / SHARED_TOKEN.
// Headers aceptados: x-auth-token o Authorization: Bearer <token>

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function safeParseJson(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function normRegistry(data) {
  // Devuelve Map<token, {role,name,email,id}>
  const map = new Map();
  if (!data) return map;

  if (Array.isArray(data)) {
    for (const it of data) {
      if (!it || typeof it !== "object") continue;
      const { token, role } = it;
      if (!token || !role) continue;
      map.set(String(token), {
        role: String(role).toLowerCase(),
        name: it.name || null,
        email: it.email || null,
        id: it.id || null,
      });
    }
  } else if (typeof data === "object") {
    for (const [token, meta] of Object.entries(data)) {
      if (!token || !meta || typeof meta !== "object") continue;
      const role = (meta.role || "").toLowerCase();
      if (!role) continue;
      map.set(String(token), {
        role,
        name: meta.name || null,
        email: meta.email || null,
        id: meta.id || null,
      });
    }
  }
  return map;
}

function resolveTokensCandidates() {
  const explicit = process.env.TOKENS_FILE;
  if (explicit) {
    const p = path.isAbsolute(explicit)
      ? explicit
      : path.resolve(process.cwd(), explicit);
    return [p];
  }

  const filename = process.env.TOKENS_FILENAME || "tokens.json";
  const isProd = (process.env.NODE_ENV || "").toLowerCase() === "production";

  const prodPath = path.join("/etc/secrets", filename);
  const projectRoot = path.resolve(__dirname, "..", "..");
  const rootPath = path.join(projectRoot, filename);
  const srcPath = path.resolve(__dirname, "..", filename);

  return isProd ? [prodPath, rootPath, srcPath] : [rootPath, srcPath];
}

let TOKENS_PATH_USED = null;

function loadTokensRegistry() {
  const candidates = resolveTokensCandidates();
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8");
        const parsed = safeParseJson(raw, null);
        if (parsed) {
          TOKENS_PATH_USED = p;
          return parsed;
        }
      }
    } catch (_) {
      /* intentar siguiente */
    }
  }
  return null;
}

// Cargar registro desde archivo (única fuente no efímera)
const fileRegistry = loadTokensRegistry();
const TOKEN_META = normRegistry(fileRegistry);

// ====== Session Store (en memoria) ======
const SESSIONS = new Map(); // Map<sessionToken, { role, user, exp }>
const SESSION_TTL_MS =
  Number.parseInt(process.env.ADMIN_SESSION_TTL_MS || "1800000", 10) || 1800000; // 30 min
let LAST_GC = 0;

function nowMs() {
  return Date.now();
}
function gcSessions(force = false) {
  const t = nowMs();
  if (!force && t - LAST_GC < 30000) return; // cada 30s máx
  LAST_GC = t;
  for (const [k, v] of SESSIONS.entries()) {
    if (!v || !v.exp || v.exp <= t) SESSIONS.delete(k);
  }
}

function newSessionToken() {
  if (typeof crypto.randomBytes === "function") {
    try {
      return "sess_" + crypto.randomBytes(24).toString("base64url");
    } catch {}
    return "sess_" + crypto.randomBytes(24).toString("hex");
  }
  return (
    "sess_" +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  );
}

function createSessionFromIdentity(identity, ttlMs = SESSION_TTL_MS) {
  gcSessions();
  const token = newSessionToken();
  const exp = nowMs() + Math.max(1000, Number(ttlMs) || SESSION_TTL_MS);
  const sess = { role: identity.role, user: identity.user || null, exp };
  SESSIONS.set(token, sess);
  return { token, exp };
}

function revokeSessionToken(token) {
  if (!token) return false;
  return SESSIONS.delete(token);
}

// ====== Lectura de token y resolución de identidad ======
function bearerToken(req) {
  const h = req.header("authorization") || req.header("Authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}
function readToken(req) {
  // Importante: NO cookies aquí. Sólo header o bearer.
  return req.header("x-auth-token") || bearerToken(req) || null;
}

function getIdentityFromFileToken(token) {
  const meta = TOKEN_META.get(token);
  if (!meta) return null;
  const role = meta.role;
  if (role !== "admin" && role !== "user") return null;
  return { role, user: { name: meta.name, email: meta.email, id: meta.id } };
}

function getIdentity(token) {
  if (!token) return null;

  // 1) ¿Es un session token válido?
  const s = SESSIONS.get(token);
  if (s) {
    if (s.exp > nowMs()) {
      return { role: s.role, user: s.user || null };
    } else {
      SESSIONS.delete(token);
      return null;
    }
  }

  // 2) ¿Es un token del archivo?
  return getIdentityFromFileToken(token);
}

// ===== API expuesta =====
function resolveRole(token) {
  const id = getIdentity(token);
  return id ? id.role : null;
}

function requireUser(req, res, next) {
  gcSessions();
  const token = readToken(req);
  const id = getIdentity(token);
  if (!id) {
    return res
      .status(401)
      .json({ ok: false, error: "unauthorized", warnings: [] });
  }
  req.auth = {
    role: id.role,
    isAdmin: id.role === "admin",
    user: id.user || null,
  };
  next();
}

function requireAdmin(req, res, next) {
  gcSessions();
  const token = readToken(req);
  const id = getIdentity(token);
  if (!id) {
    return res
      .status(401)
      .json({ ok: false, error: "unauthorized", warnings: [] });
  }
  if (id.role !== "admin") {
    return res
      .status(403)
      .json({ ok: false, error: "forbidden", warnings: [] });
  }
  req.auth = { role: "admin", isAdmin: true, user: id.user || null };
  next();
}

// Export default = requireUser (compat)
module.exports = requireUser;
module.exports.requireUser = requireUser;
module.exports.requireAdmin = requireAdmin;
module.exports.resolveRole = resolveRole;

// Sesiones (para rutas de login)
module.exports.createSessionFromIdentity = createSessionFromIdentity;
module.exports.revokeSessionToken = revokeSessionToken;

// Utilidades (debug / uso interno)
module.exports._getIdentity = getIdentity;
module.exports._getFileIdentity = getIdentityFromFileToken;
module.exports._tokenMetaCount = () => TOKEN_META.size;
module.exports._tokensPath = () => TOKENS_PATH_USED;
module.exports._sessionCount = () => SESSIONS.size;

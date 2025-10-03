// src/middleware/auth.js
// API-key auth con roles + metadatos (name/email/id) cargados EXCLUSIVAMENTE desde archivo JSON.

const fs = require("fs");
const path = require("path");

function safeParseJson(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function normRegistry(data) {
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
    } catch (_) {}
  }
  return null;
}

const fileRegistry = loadTokensRegistry();
const TOKEN_META = normRegistry(fileRegistry);

function bearerToken(req) {
  const h = req.header("authorization") || req.header("Authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}
function readToken(req) {
  return req.header("x-auth-token") || bearerToken(req) || null;
}

// Acepta cualquier rol no vacío (admin, user, *_lead, etc.)
function getIdentity(token) {
  if (!token) return null;
  const meta = TOKEN_META.get(token);
  if (!meta) return null;
  const role = (meta.role || "").toLowerCase();
  if (!role) return null;
  return { role, user: { name: meta.name, email: meta.email, id: meta.id } };
}

// ===== API expuesta =====
function resolveRole(token) {
  const id = getIdentity(token);
  return id ? id.role : null;
}

function requireUser(req, res, next) {
  const token = readToken(req);
  const id = getIdentity(token);
  if (!id)
    return res
      .status(401)
      .json({ ok: false, error: "unauthorized", warnings: [] });
  req.auth = {
    role: id.role,
    isAdmin: id.role === "admin",
    user: id.user || null,
  };
  next();
}

function requireAdmin(req, res, next) {
  const token = readToken(req);
  const id = getIdentity(token);
  if (!id)
    return res
      .status(401)
      .json({ ok: false, error: "unauthorized", warnings: [] });
  if (id.role !== "admin")
    return res
      .status(403)
      .json({ ok: false, error: "forbidden", warnings: [] });
  req.auth = { role: "admin", isAdmin: true, user: id.user || null };
  next();
}

// (Eliminado soporte 'ld': NO expongas ninguna variante L&D)

function listUsersPublic() {
  const out = [];
  for (const [, meta] of TOKEN_META.entries()) {
    if (!meta) continue;
    const id = meta.id || "";
    const name = meta.name || id || "user";
    const imgSlug = String(name).trim().replace(/\s+/g, "_");
    out.push({
      id,
      name,
      email: meta.email || "",
      role: meta.role,
      img: `/docs/Knwoledge_Database/Images/people/${imgSlug}.png`,
    });
  }
  return out;
}

module.exports = requireUser;
module.exports.requireUser = requireUser;
module.exports.requireAdmin = requireAdmin;
module.exports.resolveRole = resolveRole;
module.exports.listUsersPublic = listUsersPublic;

// Utilidades (debug)
module.exports._getIdentity = getIdentity;
module.exports._tokenMetaCount = () => TOKEN_META.size;
module.exports._tokensPath = () => TOKENS_PATH_USED;

// src/middleware/auth.js
// API-key auth con roles + metadatos (name/email/id) cargados EXCLUSIVAMENTE desde archivo JSON.
// NO hay soporte de ADMIN_TOKENS / USER_TOKENS / SHARED_TOKEN.
//
// Rutas admitidas del archivo (en orden):
//   - TOKENS_FILE (ruta explícita, absoluta o relativa al CWD)
//   - (prod)  /etc/secrets/<TOKENS_FILENAME|tokens.json>
//   - (dev)   <raíz del proyecto>/<TOKENS_FILENAME|tokens.json>
//   - (fallback) /src/<TOKENS_FILENAME|tokens.json>
//
// Formatos soportados:
//   - Objeto: { "token123": { "role":"admin", "name":"...", "email":"...", "id":"..." }, ... }
//   - Array:  [ { "token":"...", "role":"user", "name":"...", "email":"...", "id":"..." }, ... ]
//
// Headers aceptados: x-auth-token o Authorization: Bearer <token>

const fs = require('fs');
const path = require('path');

function safeParseJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function normRegistry(data) {
  // Devuelve Map<token, {role,name,email,id}>
  const map = new Map();
  if (!data) return map;

  if (Array.isArray(data)) {
    for (const it of data) {
      if (!it || typeof it !== 'object') continue;
      const { token, role } = it;
      if (!token || !role) continue;
      map.set(String(token), {
        role: String(role).toLowerCase(),
        name: it.name || null,
        email: it.email || null,
        id: it.id || null,
      });
    }
  } else if (typeof data === 'object') {
    for (const [token, meta] of Object.entries(data)) {
      if (!token || !meta || typeof meta !== 'object') continue;
      const role = (meta.role || '').toLowerCase();
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
  // 0) Ruta explícita gana
  const explicit = process.env.TOKENS_FILE;
  if (explicit) {
    const p = path.isAbsolute(explicit) ? explicit : path.resolve(process.cwd(), explicit);
    return [p];
  }

  const filename = process.env.TOKENS_FILENAME || 'tokens.json';
  const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';

  // 1) Producción: /etc/secrets/<filename>
  const prodPath = path.join('/etc/secrets', filename);

  // 2) Dev — raíz del proyecto: __dirname = /src/middleware  => raíz = subir dos niveles
  const projectRoot = path.resolve(__dirname, '..', '..');
  const rootPath = path.join(projectRoot, filename);

  // 3) Fallback (ubicación anterior): /src/<filename>
  const srcPath = path.resolve(__dirname, '..', filename);

  // Orden: prod → root → src (en dev probamos root antes que src)
  return isProd ? [prodPath, rootPath, srcPath] : [rootPath, srcPath];
}

let TOKENS_PATH_USED = null;

function loadTokensRegistry() {
  const candidates = resolveTokensCandidates();
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        const parsed = safeParseJson(raw, null);
        if (parsed) {
          TOKENS_PATH_USED = p;
          return parsed;
        }
      }
    } catch (_) { /* intentar siguiente */ }
  }
  return null;
}

// Cargar registro desde archivo (única fuente)
const fileRegistry = loadTokensRegistry();
const TOKEN_META = normRegistry(fileRegistry);

function bearerToken(req) {
  const h = req.header('authorization') || req.header('Authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}
function readToken(req) {
  return req.header('x-auth-token') || bearerToken(req) || null;
}

function getIdentity(token) {
  if (!token) return null;
  const meta = TOKEN_META.get(token);
  if (!meta) return null;
  const role = meta.role;
  if (role !== 'admin' && role !== 'user') return null;
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
  if (!id) {
    return res.status(401).json({ ok: false, error: 'unauthorized', warnings: [] });
  }
  req.auth = { role: id.role, isAdmin: id.role === 'admin', user: id.user || null };
  next();
}

function requireAdmin(req, res, next) {
  const token = readToken(req);
  const id = getIdentity(token);
  if (!id) {
    return res.status(401).json({ ok: false, error: 'unauthorized', warnings: [] });
  }
  if (id.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'forbidden', warnings: [] });
  }
  req.auth = { role: 'admin', isAdmin: true, user: id.user || null };
  next();
}

// Export default = requireUser (compat con imports existentes)
module.exports = requireUser;
module.exports.requireUser = requireUser;
module.exports.requireAdmin = requireAdmin;
module.exports.resolveRole = resolveRole;

// Utilidades (debug)
module.exports._getIdentity = getIdentity;
module.exports._tokenMetaCount = () => TOKEN_META.size;
module.exports._tokensPath = () => TOKENS_PATH_USED;

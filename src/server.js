// src/server.js
const express = require("express");
const path = require("path");
const fs = require("fs");

const { getSettings } = require("./engine/settings");
const { resolveRole, listUsersPublic } = require("./middleware/auth");

const app = express();

// ===== Body parsers =====
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false }));

// ===== Helpers =====
function noCache(_req, res, next) {
  res.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
}
function readCookie(req, key) {
  const raw = req.headers.cookie || "";
  const parts = raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    const i = p.indexOf("=");
    if (i > 0) {
      const k = p.slice(0, i);
      if (k === key) return decodeURIComponent(p.slice(i + 1));
    }
  }
  return null;
}
function isSecureReq(req) {
  const xfwd = (req.headers["x-forwarded-proto"] || "")
    .toString()
    .toLowerCase();
  return req.secure || xfwd.includes("https");
}

// Cookie helpers (evidence/admin)
function setCookieGeneric(
  req,
  res,
  name,
  token,
  maxAgeSeconds = 60 * 60 * 24 * 7
) {
  const secure = process.env.COOKIE_SECURE === "1" || isSecureReq(req);
  const pieces = [
    `${name}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) pieces.push("Secure");
  res.setHeader("Set-Cookie", pieces.join("; "));
}
function clearCookieGeneric(req, res, name) {
  const secure = process.env.COOKIE_SECURE === "1" || isSecureReq(req);
  const pieces = [
    `${name}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) pieces.push("Secure");
  res.setHeader("Set-Cookie", pieces.join("; "));
}

const setAuthCookie = (req, res, t) =>
  setCookieGeneric(req, res, "forusbot_token", t);
const clearAuthCookie = (req, res) =>
  clearCookieGeneric(req, res, "forusbot_token");
const setAdminCookie = (req, res, t) =>
  setCookieGeneric(req, res, "forusbot_admin", t);
const clearAdminCookie = (req, res) =>
  clearCookieGeneric(req, res, "forusbot_admin");

// === Auto-logout previo para evidencia
app.use((req, res, next) => {
  const p = req.path || "";
  const inEvidenceArea =
    p === "/evidence" ||
    p.startsWith("/evidence/") ||
    p === "/forusbot/evidence/login";
  if (!inEvidenceArea && readCookie(req, "forusbot_token")) {
    clearAuthCookie(req, res);
  }
  next();
});

// ===== Rutas estáticas =====
const DOCS_DIR = path.join(__dirname, "..", "docs");
app.use("/docs", express.static(DOCS_DIR, { index: "index.html" }));

// Evidence (configurable)
const EVIDENCE_DIR = process.env.EVIDENCE_DIR || "/tmp/evidence";
try {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
} catch {}

let serveIndex = null;
try {
  serveIndex = require("serve-index");
} catch {
  serveIndex = null;
}

function evidenceGate(req, res, next) {
  const flags = getSettings().flags || {};
  if (flags.evidencePublic) return next();

  const token = req.header("x-auth-token") || readCookie(req, "forusbot_token");
  const role = resolveRole(token);
  if (!role) return res.status(401).json({ ok: false, error: "unauthorized" });
  if (flags.evidenceAdminOnly && role !== "admin") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  return next();
}

// Evidence login (usa cualquier token válido)
app.post("/forusbot/evidence/login", (req, res) => {
  try {
    const token = req.header("x-auth-token") || (req.body && req.body.token);
    const role = resolveRole(token);
    if (!role)
      return res.status(401).json({ ok: false, error: "unauthorized" });
    setAuthCookie(req, res, token);
    return res.json({
      ok: true,
      role,
      hint: "Cookie set. Open /evidence on this origin.",
    });
  } catch (e) {
    console.error("[evidence login] error", e);
    return res.status(500).json({ ok: false, error: "login error" });
  }
});

// Evidence static
if (serveIndex) {
  app.use("/evidence", noCache, evidenceGate, express.static(EVIDENCE_DIR));
  app.use(
    "/evidence",
    noCache,
    evidenceGate,
    serveIndex(EVIDENCE_DIR, { icons: true })
  );
} else {
  app.use("/evidence", noCache, evidenceGate, express.static(EVIDENCE_DIR));
}

// ===== ADMIN UI cookies =====
app.post("/forusbot/admin/login", (req, res) => {
  try {
    const token = req.header("x-auth-token") || (req.body && req.body.token);
    const role = resolveRole(token);
    if (role !== "admin")
      return res.status(401).json({ ok: false, error: "unauthorized" });
    setAdminCookie(req, res, token);
    return res.json({ ok: true, role: "admin" });
  } catch (e) {
    console.error("[admin login] error", e);
    return res.status(500).json({ ok: false, error: "login error" });
  }
});
app.post("/forusbot/admin/logout", (req, res) => {
  try {
    clearAdminCookie(req, res);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[admin logout] error", e);
    return res.status(500).json({ ok: false, error: "logout error" });
  }
});
app.get("/forusbot/admin/whoami", (req, res) => {
  try {
    const token =
      req.header("x-auth-token") || readCookie(req, "forusbot_admin");
    const role = resolveRole(token);
    return res.json({ ok: true, role, isAdmin: role === "admin" });
  } catch (e) {
    console.error("[admin whoami] error", e);
    return res.status(500).json({ ok: false, error: "whoami error" });
  }
});

/* ======================================================
   NUEVO: Auth & Users (sin L&D)
   - /forusbot/auth/whoami  → valida token (cualquier rol)
   - /forusbot/users        → lista pública (cualquier rol)
====================================================== */
app.get("/forusbot/auth/whoami", (req, res) => {
  try {
    const token = req.header("x-auth-token");
    const role = resolveRole(token);
    if (!role)
      return res.status(401).json({ ok: false, error: "unauthorized" });
    return res.json({ ok: true, role });
  } catch (e) {
    console.error("[auth whoami] error", e);
    return res.status(500).json({ ok: false, error: "whoami error" });
  }
});

app.get("/forusbot/users", (req, res) => {
  try {
    const token = req.header("x-auth-token");
    const role = resolveRole(token);
    if (!role)
      return res.status(401).json({ ok: false, error: "unauthorized" });
    return res.json({ ok: true, users: listUsersPublic() });
  } catch (e) {
    console.error("[users] error", e);
    return res.status(500).json({ ok: false, error: "users error" });
  }
});

// Header injection: SOLO admin cookie (para consola admin)
app.use("/forusbot", (req, _res, next) => {
  if (!req.headers["x-auth-token"]) {
    const tAdmin = readCookie(req, "forusbot_admin");
    if (tAdmin) req.headers["x-auth-token"] = tAdmin;
  }
  next();
});

// ===== API namespaced =====
app.use("/forusbot", require("./routes"));

// ===== Health =====
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/forusbot/health", (_req, res) => res.json({ ok: true }));

// ===== Admin Console estática =====
const ADMIN_DIR = path.join(DOCS_DIR, "admin");
app.use("/admin", noCache, express.static(ADMIN_DIR, { index: "index.html" }));

// ===== 404 =====
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not Found" });
});

// ===== Error handler =====
app.use((err, _req, res, _next) => {
  console.error("[express error]", err && err.stack ? err.stack : err);
  res.status(500).json({ ok: false, error: "Internal Server Error" });
});

module.exports = app;

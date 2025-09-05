// src/routes/admin-auth.js
const express = require("express");
const {
  _getFileIdentity,
  _getIdentity,
  createSessionFromIdentity,
  revokeSessionToken,
} = require("../middleware/auth");

const router = express.Router();

function hdrToken(req) {
  return req.header("x-auth-token") || null;
}

// POST /forusbot/admin/login  { token: "<admin token del archivo>" }
router.post("/login", express.json(), (req, res) => {
  try {
    const tok = (
      req.body && req.body.token ? String(req.body.token) : ""
    ).trim();
    if (!tok)
      return res.status(400).json({ ok: false, error: "missing_token" });

    // Solo aceptamos tokens del archivo y de rol admin.
    const fileId = _getFileIdentity(tok);
    if (!fileId || fileId.role !== "admin") {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const { token, exp } = createSessionFromIdentity(fileId);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res.json({
      ok: true,
      token,
      expiresAt: new Date(exp).toISOString(),
    });
  } catch (e) {
    console.error("[admin-auth] login error", e);
    return res.status(500).json({ ok: false, error: "login_error" });
  }
});

// POST /forusbot/admin/logout
router.post("/logout", (_req, res) => {
  try {
    const t = hdrToken(_req);
    if (t) revokeSessionToken(t);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[admin-auth] logout error", e);
    return res.status(500).json({ ok: false, error: "logout_error" });
  }
});

// GET /forusbot/admin/whoami
router.get("/whoami", (req, res) => {
  try {
    const t = hdrToken(req);
    const id = _getIdentity(t);
    if (!id) return res.status(401).json({ ok: false, error: "unauthorized" });
    return res.json({
      ok: true,
      role: id.role,
      isAdmin: id.role === "admin",
      user: id.user || null,
    });
  } catch (e) {
    console.error("[admin-auth] whoami error", e);
    return res.status(500).json({ ok: false, error: "whoami_error" });
  }
});

module.exports = router;

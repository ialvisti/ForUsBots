// src/middleware/restrictToEmails.js
// Middleware factory: bloquea el request si `req.auth.user.email` no está en
// la allowlist. Debe encadenarse DESPUÉS de `requireUser` (depende de req.auth).

function restrictToEmails(allowed) {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  const set = new Set(
    list
      .map((e) => (e == null ? "" : String(e).trim().toLowerCase()))
      .filter(Boolean)
  );

  return function restrictToEmailsMiddleware(req, res, next) {
    const email = String(req.auth?.user?.email || "").trim().toLowerCase();
    if (!email || !set.has(email)) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        reason: "endpoint restricted to specific users",
      });
    }
    next();
  };
}

module.exports = restrictToEmails;

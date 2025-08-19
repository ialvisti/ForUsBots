// src/middleware/auth.js
const expected = process.env.SHARED_TOKEN || 'dev-secret';

module.exports = function auth(req, res, next) {
  const token = req.header('x-auth-token');
  if (!token || token !== expected) {
    return res.status(401).json({ ok: false, error: 'unauthorized', warnings: [] });
  }
  next();
};

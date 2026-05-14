const { isAllowed } = require("../auth/scopes");

function requireScope(featureKey, { pathPattern } = {}) {
  return function requireScopeMiddleware(req, res, next) {
    if (!req.auth || !req.auth.scope) {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }
    const method = req.method;
    let pattern = pathPattern;
    if (!pattern) {
      const baseUrl = req.baseUrl || "";
      const routePath = req.route?.path || req.path || "";
      pattern = routePath === "/" ? baseUrl : baseUrl + routePath;
      if (!pattern) pattern = req.path || "";
    }

    const verdict = isAllowed(req.auth.scope, method, pattern);
    if (verdict.allowed) return next();

    return res.status(403).json({
      ok: false,
      error: "forbidden",
      feature: featureKey,
      endpoint: `${method} ${pattern}`,
      reason: verdict.reason,
    });
  };
}

module.exports = requireScope;

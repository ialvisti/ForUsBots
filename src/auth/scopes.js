// Lógica pura de resolución de scope y autorización.
// Sin side effects: testeable sin mocks.

const { getRole } = require("./roles");
const {
  ENDPOINT_TO_FEATURE,
  OPEN_ENDPOINTS,
  endpointKey,
} = require("./featureMap");

function buildPatternCache() {
  const out = [];
  for (const key of Object.keys(ENDPOINT_TO_FEATURE)) {
    const [method, pattern] = key.trim().split(/\s+/);
    const regex = new RegExp(
      "^" + pattern.replace(/:[a-zA-Z_]+/g, "[^/]+") + "$"
    );
    out.push({ method: method.toUpperCase(), pattern, regex, open: false });
  }
  for (const key of OPEN_ENDPOINTS) {
    const [method, pattern] = key.trim().split(/\s+/);
    const regex = new RegExp(
      "^" + pattern.replace(/:[a-zA-Z_]+/g, "[^/]+") + "$"
    );
    out.push({ method: method.toUpperCase(), pattern, regex, open: true });
  }
  return out;
}

let _patternCache = null;
function patternCache() {
  if (!_patternCache) _patternCache = buildPatternCache();
  return _patternCache;
}

function resolveEndpoint(method, rawPath) {
  const upMethod = String(method || "").toUpperCase();
  for (const p of patternCache()) {
    if (p.method !== upMethod) continue;
    if (p.regex.test(rawPath)) {
      const key = endpointKey(upMethod, p.pattern);
      if (p.open) return { feature: null, isOpen: true, key };
      return { feature: ENDPOINT_TO_FEATURE[key], isOpen: false, key };
    }
  }
  return null;
}

function resolveScope(tokenMeta) {
  const roleId = (tokenMeta && tokenMeta.role) || "user";
  const role = getRole(roleId);

  const deniedFeatures = new Set(role.defaultDeniedFeatures || []);
  const extraDenied = (tokenMeta && tokenMeta.deniedFeatures) || [];
  for (const f of extraDenied) deniedFeatures.add(f);

  const deniedEndpoints = new Set(
    (tokenMeta && tokenMeta.deniedEndpoints) || []
  );
  const allowedEndpoints = new Set(
    (tokenMeta && tokenMeta.allowedEndpoints) || []
  );

  return { deniedFeatures, deniedEndpoints, allowedEndpoints, role: roleId };
}

function isAllowed(scope, method, pathPattern) {
  const key = endpointKey(method, pathPattern);

  if (scope.allowedEndpoints.has(key)) {
    return { allowed: true, reason: "explicit-allow" };
  }
  if (scope.deniedEndpoints.has(key)) {
    return { allowed: false, reason: "denied-endpoint" };
  }

  const feature = ENDPOINT_TO_FEATURE[key];
  if (feature && scope.deniedFeatures.has(feature)) {
    return { allowed: false, reason: `denied-feature:${feature}` };
  }
  return { allowed: true, reason: "default-allow" };
}

function scopeToJSON(scope) {
  return {
    role: scope.role,
    deniedFeatures: [...scope.deniedFeatures].sort(),
    deniedEndpoints: [...scope.deniedEndpoints].sort(),
    allowedEndpoints: [...scope.allowedEndpoints].sort(),
  };
}

module.exports = { resolveScope, isAllowed, resolveEndpoint, scopeToJSON };

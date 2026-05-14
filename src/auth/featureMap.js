// Mapeo canónico de endpoints a features. Cada endpoint protegido pertenece a UNA
// feature. Cuando un token tiene `deniedFeatures: ["scrape-participant"]`,
// se bloquean TODOS los endpoints cuya feature == "scrape-participant".
// Endpoints listados en OPEN_ENDPOINTS NO pasan por scope (health pública,
// articles read pública, handshake de admin login, etc.).

const FEATURE_KEYS = Object.freeze([
  // Bots
  "scrape-participant",
  "scrape-plan",
  "update-participant",
  "update-plan",
  "search-participants",
  "mfa-reset",
  "email-trigger",
  "vault-upload",
  // Sandbox dry-run
  "sandbox-vault-upload",
  "sandbox-update-plan",
  // Jobs
  "jobs-read",
  "jobs-write",
  // Identidad
  "whoami-read",
  // Admin
  "admin-jobs-db",
  "admin-metrics-db",
  "admin-settings",
  "admin-locks",
  "admin-metrics",
  "admin-version",
  "admin-openapi",
  "admin-close",
  // Articles
  "articles-write",
  "articles-draft-read",
  "articles-draft-write",
  "articles-draft-publish",
]);

function endpointKey(method, pathPattern) {
  return `${String(method).toUpperCase()} ${pathPattern}`.replace(/\s+/g, " ").trim();
}

function buildEndpointMap(pairs) {
  const out = {};
  for (const [method, path, feature] of pairs) {
    out[endpointKey(method, path)] = feature;
  }
  return Object.freeze(out);
}

const ENDPOINT_TO_FEATURE = buildEndpointMap([
  // Bots
  ["POST",   "/forusbot/scrape-participant",         "scrape-participant"],
  ["POST",   "/forusbot/scrape-plan",                "scrape-plan"],
  ["POST",   "/forusbot/update-participant",         "update-participant"],
  ["POST",   "/forusbot/update-plan",                "update-plan"],
  ["POST",   "/forusbot/search-participants",        "search-participants"],
  ["POST",   "/forusbot/mfa-reset",                  "mfa-reset"],
  ["POST",   "/forusbot/email-trigger",              "email-trigger"],
  ["POST",   "/forusbot/vault-file-upload",          "vault-upload"],

  // Sandbox dry-run
  ["POST",   "/forusbot/sandbox/vault-file-upload",  "sandbox-vault-upload"],
  ["POST",   "/forusbot/sandbox/update-plan",        "sandbox-update-plan"],

  // Jobs / queue
  ["GET",    "/forusbot/jobs",                       "jobs-read"],
  ["GET",    "/forusbot/jobs/:id",                   "jobs-read"],
  ["DELETE", "/forusbot/jobs/:id",                   "jobs-write"],

  // Identidad del token autenticado
  ["GET",    "/forusbot/whoami",                     "whoami-read"],

  // Admin
  ["GET",    "/forusbot/locks",                      "admin-locks"],
  ["GET",    "/forusbot/settings",                   "admin-settings"],
  ["PATCH",  "/forusbot/settings",                   "admin-settings"],
  ["GET",    "/forusbot/metrics",                    "admin-metrics"],
  ["GET",    "/forusbot/version",                    "admin-version"],
  ["GET",    "/forusbot/openapi",                    "admin-openapi"],
  ["POST",   "/forusbot/_close",                     "admin-close"],
  ["GET",    "/forusbot/admin/jobs-db",              "admin-jobs-db"],
  ["GET",    "/forusbot/admin/jobs-db/:id",          "admin-jobs-db"],
  ["DELETE", "/forusbot/admin/jobs-db/_purge",       "admin-jobs-db"],
  ["GET",    "/forusbot/admin/metrics-db",           "admin-metrics-db"],

  // Articles (KB pública para read, admin para write)
  ["POST",   "/forusbot/articles",                   "articles-write"],
  ["DELETE", "/forusbot/articles/:id",               "articles-write"],

  // Articles draft
  ["GET",    "/forusbot/articles-draft",             "articles-draft-read"],
  ["GET",    "/forusbot/articles-draft/:id",         "articles-draft-read"],
  ["GET",    "/forusbot/articles-draft/_published",  "articles-draft-read"],
  ["GET",    "/forusbot/articles-draft/_published/:id", "articles-draft-read"],
  ["POST",   "/forusbot/articles-draft",             "articles-draft-write"],
  ["POST",   "/forusbot/articles-draft/:id/rename",  "articles-draft-write"],
  ["DELETE", "/forusbot/articles-draft/:id",         "articles-draft-write"],
  ["POST",   "/forusbot/articles-draft/:id/publish", "articles-draft-publish"],
]);

const OPEN_ENDPOINTS = Object.freeze(new Set([
  endpointKey("GET",  "/forusbot/health"),
  endpointKey("GET",  "/forusbot/status"),
  endpointKey("GET",  "/forusbot/articles"),
  endpointKey("GET",  "/forusbot/articles/:id"),
  endpointKey("POST", "/forusbot/admin/login"),
  endpointKey("POST", "/forusbot/admin/logout"),
  endpointKey("GET",  "/forusbot/admin/whoami"),
]));

module.exports = { FEATURE_KEYS, ENDPOINT_TO_FEATURE, OPEN_ENDPOINTS, endpointKey };

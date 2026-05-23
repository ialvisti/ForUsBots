// Catálogo central de roles. Cada role declara las features que NO puede ejecutar
// por default. Un token con ese role hereda esa denylist y puede agregar
// deniedFeatures / deniedEndpoints extra, o re-habilitar puntualmente con
// allowedEndpoints. El catálogo de features válidas vive en ./featureMap.js.

const ROLES = Object.freeze({
  admin: Object.freeze({
    label: "Admin",
    defaultDeniedFeatures: Object.freeze([]),
  }),
  user: Object.freeze({
    label: "User",
    defaultDeniedFeatures: Object.freeze([
      "update-plan",
      "mfa-reset",
      "users-management",
      "sandbox-users-management",
      "admin-jobs-db",
      "admin-metrics-db",
      "admin-settings",
      "admin-locks",
      "admin-metrics",
      "admin-version",
      "admin-openapi",
      "admin-close",
      "articles-write",
    ]),
  }),
  pa_lead: Object.freeze({
    label: "PA Lead",
    defaultDeniedFeatures: Object.freeze([
      "update-plan",
      "users-management",
      "sandbox-users-management",
      "admin-jobs-db",
      "admin-metrics-db",
      "admin-settings",
      "admin-close",
    ]),
  }),
  rm_lead: Object.freeze({
    label: "RM Lead",
    defaultDeniedFeatures: Object.freeze([
      "update-plan",
      "mfa-reset",
      "users-management",
      "sandbox-users-management",
      "admin-jobs-db",
      "admin-metrics-db",
      "admin-settings",
      "admin-close",
    ]),
  }),
  ops_lead: Object.freeze({
    label: "Ops Lead",
    defaultDeniedFeatures: Object.freeze([
      "admin-settings",
      "admin-close",
    ]),
  }),
  imp_lead: Object.freeze({
    label: "Implementation Lead",
    defaultDeniedFeatures: Object.freeze([
      "update-plan",
      "mfa-reset",
      "users-management",
      "sandbox-users-management",
      "admin-jobs-db",
      "admin-metrics-db",
      "admin-settings",
      "admin-close",
    ]),
  }),
});

function getRole(roleId) {
  return ROLES[roleId] || ROLES.user;
}

module.exports = { ROLES, getRole };

// docs/sandbox/js/endpoints/constants.js
export const ENDPOINTS = {

  "update-participant": {
    label: "POST /forusbot/update-participant",
    method: "POST",
    path: "/forusbot/update-participant",
    feature: "update-participant",
    group: "update",
    needs: { token: true }, // JSON body
    pollJob: true,
  },

  "update-plan": {
    label: "POST /forusbot/update-plan",
    method: "POST",
    path: "/forusbot/update-plan",
    feature: "update-plan",
    group: "update-plan",
    needs: { token: true }, // JSON body — restringido a Ivan Alvis
    pollJob: true,
  },
  "sandbox-update-plan": {
    label: "POST /forusbot/sandbox/update-plan (dry-run)",
    method: "POST",
    path: "/forusbot/sandbox/update-plan",
    feature: "sandbox-update-plan",
    group: "update-plan",
    needs: { token: true }, // restringido a Ivan Alvis (dry-run, sin browser)
    pollJob: false,
  },

  "vault-upload": {
    label: "POST /forusbot/vault-file-upload",
    method: "POST",
    path: "/forusbot/vault-file-upload",
    feature: "vault-upload",
    group: "upload",
    needs: { token: true, pdf: true, xfilename: true, meta: true },
    allowedExts: [".pdf", ".xlsx", ".xls", ".csv", ".zip"],
    pollJob: true,
  },
  "sandbox-upload": {
    label: "POST /forusbot/sandbox/vault-file-upload (dry-run)",
    method: "POST",
    path: "/forusbot/sandbox/vault-file-upload",
    feature: "sandbox-vault-upload",
    group: "upload",
    needs: { token: false, pdf: false, xfilename: true, meta: true },
    allowedExts: [".pdf"],
    pollJob: false,
  },
  "jobs-get": {
    label: "GET /forusbot/jobs/:id",
    method: "GET",
    path: "/forusbot/jobs/:id",
    feature: "jobs-read",
    group: "jobs",
    needs: { token: true, jobId: true },
    pollJob: false,
  },
  "jobs-delete": {
    label: "DELETE /forusbot/jobs/:id",
    method: "DELETE",
    path: "/forusbot/jobs/:id",
    feature: "jobs-write",
    group: "jobs",
    needs: { token: true, jobId: true },
    pollJob: false,
  },
  "status-get": {
    label: "GET /forusbot/status",
    method: "GET",
    path: "/forusbot/status",
    feature: null, // public/open endpoint — no scope check
    group: "misc",
    needs: { token: false },
    pollJob: false,
  },
  // NEW: scrape participant
  "scrape-participant": {
    label: "POST /forusbot/scrape-participant",
    method: "POST",
    path: "/forusbot/scrape-participant",
    feature: "scrape-participant",
    group: "scrape",
    needs: { token: true }, // JSON body, no x-meta/x-filename
    pollJob: true, // returns 202 + jobId
  },
  // NEW: scrape plan
  "scrape-plan": {
    label: "POST /forusbot/scrape-plan",
    method: "POST",
    path: "/forusbot/scrape-plan",
    feature: "scrape-plan",
    group: "scrape-plan",
    needs: { token: true }, // JSON body with planId, modules, etc.
    pollJob: true, // returns 202 + jobId
  },
  // NEW: mfa reset
  "mfa-reset": {
    label: "POST /forusbot/mfa-reset",
    method: "POST",
    path: "/forusbot/mfa-reset",
    feature: "mfa-reset",
    group: "mfa", // mostrará .ep-mfa en la UI
    needs: { token: true }, // JSON body con { participantId }
    pollJob: true, // returns 202 + jobId
  },

  "search-participants": {
    label: "POST /forusbot/search-participants",
    method: "POST",
    path: "/forusbot/search-participants",
    feature: "search-participants",
    group: "search",
    needs: { token: true }, // JSON body
    pollJob: true,
  },

  "email-trigger": {
    label: "POST /forusbot/email-trigger",
    method: "POST",
    path: "/forusbot/email-trigger",
    feature: "email-trigger",
    group: "email",
    needs: { token: true }, // JSON body
    pollJob: true,
  },

  // Users Management (restricted: ivan.alvis + sponsorservicesbot)
  "users-management-create": {
    label: "POST /forusbot/users-management/create",
    method: "POST",
    path: "/forusbot/users-management/create",
    feature: "users-management",
    group: "users-management",
    needs: { token: true },
    pollJob: true,
  },
  "users-management-edit": {
    label: "POST /forusbot/users-management/edit",
    method: "POST",
    path: "/forusbot/users-management/edit",
    feature: "users-management",
    group: "users-management",
    needs: { token: true },
    pollJob: true,
  },
  "sandbox-users-management-create": {
    label: "POST /forusbot/sandbox/users-management/create (dry-run)",
    method: "POST",
    path: "/forusbot/sandbox/users-management/create",
    feature: "sandbox-users-management",
    group: "users-management",
    needs: { token: true },
    pollJob: false,
  },
  "sandbox-users-management-edit": {
    label: "POST /forusbot/sandbox/users-management/edit (dry-run)",
    method: "POST",
    path: "/forusbot/sandbox/users-management/edit",
    feature: "sandbox-users-management",
    group: "users-management",
    needs: { token: true },
    pollJob: false,
  },
};

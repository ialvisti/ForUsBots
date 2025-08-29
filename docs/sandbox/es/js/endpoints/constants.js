// docs/sandbox/js/endpoints/constants.js
export const ENDPOINTS = {
  "vault-upload": {
    label: "POST /forusbot/vault-file-upload",
    method: "POST",
    path: "/forusbot/vault-file-upload",
    group: "upload",
    needs: { token: true, pdf: true, xfilename: true, meta: true },
    pollJob: true,
  },
  "sandbox-upload": {
    label: "POST /forusbot/sandbox/vault-file-upload (dry-run)",
    method: "POST",
    path: "/forusbot/sandbox/vault-file-upload",
    group: "upload",
    needs: { token: false, pdf: false, xfilename: true, meta: true },
    pollJob: false,
  },
  "jobs-get": {
    label: "GET /forusbot/jobs/:id",
    method: "GET",
    path: "/forusbot/jobs/:id",
    group: "jobs",
    needs: { token: true, jobId: true },
    pollJob: false,
  },
  "jobs-delete": {
    label: "DELETE /forusbot/jobs/:id",
    method: "DELETE",
    path: "/forusbot/jobs/:id",
    group: "jobs",
    needs: { token: true, jobId: true },
    pollJob: false,
  },
  "status-get": {
    label: "GET /forusbot/status",
    method: "GET",
    path: "/forusbot/status",
    group: "misc",
    needs: { token: true },
    pollJob: false,
  },
  // NEW: scrape participant
  "scrape-participant": {
    label: "POST /forusbot/scrape-participant",
    method: "POST",
    path: "/forusbot/scrape-participant",
    group: "scrape",
    needs: { token: true }, // JSON body, no x-meta/x-filename
    pollJob: true, // returns 202 + jobId
  },
  // NEW: mfa reset
  "mfa-reset": {
    label: "POST /forusbot/mfa-reset",
    method: "POST",
    path: "/forusbot/mfa-reset",
    group: "mfa", // mostrará .ep-mfa en la UI
    needs: { token: true }, // JSON body con { participantId }
    pollJob: true, // returns 202 + jobId
  },

  "search-participants": {
    label: "POST /forusbot/search-participants",
    method: "POST",
    path: "/forusbot/search-participants",
    group: "search",
    needs: { token: true }, // JSON body
    pollJob: true,
  },
};

// docs/admin/js/admin-api.js
const AdminAPI = (() => {
  const base = "/forusbot";

  // === Token sólo en memoria (no cookies, no storage) ===
  function _setToken(token) {
    if (typeof window !== "undefined") {
      window.__ADMIN_TOKEN = token || null;
    }
  }

  // Auth (estricto, sin cookies)
  async function login(token) {
    _setToken((token || "").trim());
    // Opcional: podríamos validar llamando whoami aquí.
    return { ok: true };
  }
  async function logout() {
    _setToken(null);
    return { ok: true };
  }
  async function whoami() {
    // OJO: ruta correcta según tu backend (no existe /admin/whoami)
    return Api.req(`${base}/whoami`, { method: "GET" });
  }

  // Metrics (runtime)
  async function metrics() {
    return Api.req(`${base}/metrics`, { method: "GET" });
  }

  // Metrics desde BD (snapshot)
  async function metricsDB(params = {}, fetchOpts = {}) {
    const qs = new URLSearchParams();
    if (params.top) qs.set("top", String(params.top));
    if (params.hours) qs.set("hours", String(params.hours));
    if (params.days) qs.set("days", String(params.days));
    if (params.limit) qs.set("limit", String(params.limit));
    // nuevos filtros de throughput
    if (params.agg) qs.set("agg", String(params.agg)); // hour | day | month
    if (params.date) qs.set("date", String(params.date)); // YYYY-MM-DD
    if (params.month) qs.set("month", String(params.month)); // YYYY-MM
    if (params.year) qs.set("year", String(params.year)); // YYYY
    return Api.req(`/forusbot/admin/metrics-db?` + qs.toString(), {
      method: "GET",
      ...fetchOpts,
    });
  }

  // ===== Jobs desde BD (nuevo) =====
  async function listJobsDB({ state, botId, limit = 100, offset = 0 } = {}) {
    const qs = new URLSearchParams();
    if (state) qs.set("state", state);
    if (botId) qs.set("botId", botId);
    if (limit) qs.set("limit", String(limit));
    if (offset) qs.set("offset", String(offset));
    return Api.req(`/forusbot/admin/jobs-db?` + qs.toString(), {
      method: "GET",
    });
  }
  async function getJobDB(id) {
    return Api.req(`/forusbot/admin/jobs-db/${encodeURIComponent(id)}`, {
      method: "GET",
    });
  }

  // Jobs (runtime)
  async function listJobs({ state, botId, limit = 50, offset = 0 } = {}) {
    const params = new URLSearchParams();
    if (state) params.set("state", state);
    if (botId) params.set("botId", botId);
    if (limit) params.set("limit", String(limit));
    if (offset) params.set("offset", String(offset));
    return Api.req(`${base}/jobs?` + params.toString(), { method: "GET" });
  }
  async function getJob(id) {
    return Api.req(`${base}/jobs/${encodeURIComponent(id)}`, { method: "GET" });
  }
  async function cancelJob(id) {
    return Api.req(`${base}/jobs/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  // Settings
  async function getSettings() {
    return Api.req(`${base}/settings`, { method: "GET" });
  }
  async function patchSettings(patch) {
    return Api.req(`${base}/settings`, { method: "PATCH", body: patch });
  }

  // Version
  async function version() {
    return Api.req(`${base}/version`, { method: "GET" });
  }

  // Close shared context
  async function closeContext() {
    return Api.req(`${base}/_close`, { method: "POST" });
  }

  // ===== Admin: purge de jobs en BD =====
  async function purgeJobsDB() {
    return Api.req(`/forusbot/admin/jobs-db/_purge`, { method: "DELETE" });
  }

  return {
    // auth
    login,
    logout,
    whoami,

    // metrics
    metrics,
    metricsDB,

    // jobs
    listJobs,
    getJob,
    listJobsDB,
    getJobDB,
    cancelJob,

    // settings / version / ctx
    getSettings,
    patchSettings,
    version,
    closeContext,

    // maintenance
    purgeJobsDB,
  };
})();

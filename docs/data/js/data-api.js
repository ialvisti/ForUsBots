// docs/datos/js/data-api.js
const DataAPI = (() => {
  const base = "/forusbot";

  // Token solo en memoria
  function _setToken(token) {
    if (typeof window !== "undefined") {
      window.__DATA_TOKEN = token || null;
    }
  }

  // Auth
  async function login(token) {
    _setToken((token || "").trim());
    return { ok: true };
  }
  async function logout() {
    _setToken(null);
    return { ok: true };
  }
  async function whoami() {
    return Api.req(`${base}/whoami`, { method: "GET" });
  }

  // Metrics (desde BD, solo lectura)
  async function metricsDB(params = {}, fetchOpts = {}) {
    const qs = new URLSearchParams();
    if (params.top) qs.set("top", String(params.top));
    if (params.hours) qs.set("hours", String(params.hours));
    if (params.days) qs.set("days", String(params.days));
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.agg) qs.set("agg", String(params.agg)); // hour|day|month
    if (params.date) qs.set("date", String(params.date)); // YYYY-MM-DD
    if (params.month) qs.set("month", String(params.month)); // YYYY-MM
    if (params.year) qs.set("year", String(params.year)); // YYYY
    return Api.req(`/forusbot/data/metrics-db?` + qs.toString(), {
      method: "GET",
      ...fetchOpts,
    });
  }

  // Jobs desde BD (con filtros avanzados)
  async function listJobsDB({
    jobId,
    botId,
    state,
    createdBy,
    day, // YYYY-MM-DD
    month, // YYYY-MM
    limit = 100,
    offset = 0,
  } = {}) {
    const qs = new URLSearchParams();
    if (jobId) qs.set("jobId", jobId);
    if (botId) qs.set("botId", botId);
    if (state) qs.set("state", state);
    if (createdBy) qs.set("createdBy", createdBy);
    if (day) qs.set("day", day);
    if (month) qs.set("month", month);
    if (limit) qs.set("limit", String(limit));
    if (offset) qs.set("offset", String(offset));
    return Api.req(`/forusbot/data/jobs-db?` + qs.toString(), {
      method: "GET",
    });
  }

  async function getJobDB(id) {
    return Api.req(`/forusbot/data/jobs-db/${encodeURIComponent(id)}`, {
      method: "GET",
    });
  }

  // Exponemos solo lo necesario (read-only)
  return {
    login,
    logout,
    whoami,
    metricsDB,
    listJobsDB,
    getJobDB,
  };
})();

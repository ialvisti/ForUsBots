// docs/admin/js/api.js
const Api = (() => {
  const BASE = ""; // mismo origen
  async function req(path, { method = "GET", body, headers } = {}) {
    const opts = {
      method,
      headers: { ...(headers || {}) },
      credentials: "omit", // jamás mandamos cookies
    };

    // Inyecta x-auth-token desde memoria (modo estricto, sin persistencia)
    try {
      const t =
        typeof window !== "undefined" && window.__ADMIN_TOKEN
          ? String(window.__ADMIN_TOKEN)
          : null;
      if (t) opts.headers["x-auth-token"] = t;
    } catch {
      /* no-op */
    }

    if (body && typeof body === "object" && !(body instanceof FormData)) {
      opts.headers["content-type"] = "application/json";
      opts.body = JSON.stringify(body);
    } else if (body) {
      opts.body = body;
    }

    const r = await fetch(BASE + path, opts);
    const ct = r.headers.get("content-type") || "";
    const isJson = ct.includes("application/json");
    const data = isJson ? await r.json().catch(() => ({})) : await r.text();
    if (!r.ok) {
      const msg =
        (isJson && data && (data.error || data.message)) ||
        r.statusText ||
        "Request error";
      const err = new Error(msg);
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  }
  return { req };
})();

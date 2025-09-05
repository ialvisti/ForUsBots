// docs/admin/js/components/jobs.js
const JobsUI = (() => {
  const root = document.getElementById("jobs-root");
  const detailRoot = document.getElementById("job-detail-root");
  let stateFilter = "";
  let botFilter = "";

  function controls() {
    const wrap = document.createElement("div");
    wrap.className = "panel";
    wrap.innerHTML = `
      <div class="row">
        <label style="min-width:200px">State
          <select id="jobs-state">
            <option value="">(any)</option>
            <option>queued</option>
            <option>running</option>
            <option>succeeded</option>
            <option>failed</option>
            <option>canceled</option>
          </select>
        </label>
        <label style="min-width:220px">Bot ID
          <input id="jobs-bot" placeholder="search-participants, ..." />
        </label>
        <button id="jobs-refresh" class="secondary xtra-space">Refresh</button>
      </div>
    `;
    wrap.querySelector("#jobs-state").value = stateFilter;
    wrap.querySelector("#jobs-bot").value = botFilter;

    wrap.querySelector("#jobs-state").addEventListener("change", (e) => {
      stateFilter = e.target.value;
      load();
    });
    wrap.querySelector("#jobs-bot").addEventListener("input", (e) => {
      botFilter = e.target.value.trim();
    });
    wrap.querySelector("#jobs-refresh").addEventListener("click", load);
    return wrap;
  }

  // Fallback defensivo por si algún backend viejo aún envía JSON en texto
  function renderCreatedBy(v) {
    if (!v) return "";
    if (typeof v === "object") return v.name || v.fullname || v.username || "";
    const s = String(v).trim();
    if (!s) return "";
    if (s.startsWith("{") || s.startsWith("[")) {
      try {
        const o = JSON.parse(s);
        if (o && typeof o === "object") {
          return o.name || o.fullname || o.username || s;
        }
      } catch {
        /* ignore */
      }
    }
    return s;
  }

  function table(items = []) {
    const p = document.createElement("div");
    p.className = "panel";

    if (!Array.isArray(items) || !items.length) {
      p.innerHTML = `<div class="muted">No jobs found.</div>`;
      return p;
    }

    const rows = items
      .map((j) => {
        const createdByText = renderCreatedBy(
          j.createdByName || j.created_by_name || j.createdBy || ""
        );
        return `
      <tr data-id="${j.jobId}">
        <td><code>${(j.jobId || "").slice(0, 8)}</code></td>
        <td>${j.botId || ""}</td>
        <td>${createdByText}</td>
        <td>
          <span class="badge ${
            j.state === "succeeded"
              ? "ok"
              : j.state === "failed"
              ? "err"
              : j.state === "running"
              ? "warn"
              : ""
          }">${j.state || ""}</span>
        </td>
        <td>${j.acceptedAt || ""}</td>
        <td>${j.startedAt || ""}</td>
        <td>${j.finishedAt || ""}</td>
        <td>${j.totalSeconds ?? ""}</td>
      </tr>
    `;
      })
      .join("");

    p.innerHTML = `
      <h3>Jobs</h3>
      <div class="muted">Click a row to see the details.</div>
      <br>
      <table>
        <thead>
          <tr>
            <th>ID</th><th>Bot</th><th>Created By</th><th>State</th>
            <th>Accepted</th><th>Started</th><th>Finished</th><th>Total(s)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    p.querySelectorAll("tbody tr").forEach((tr) => {
      tr.addEventListener("click", () => showDetail(tr.dataset.id));
    });

    return p;
  }

  async function load() {
    try {
      root.innerHTML = "";
      root.append(controls());

      const r = await AdminAPI.listJobsDB({
        state: stateFilter || undefined,
        botId: botFilter || undefined,
        limit: 100,
        offset: 0,
      });

      const items = r?.jobs || r?.items || [];
      root.append(table(items));
    } catch (e) {
      root.innerHTML = `<div class="panel error">Error listando jobs: ${
        e?.message || e
      }</div>`;
    }
  }

  async function showDetail(jobId) {
    try {
      const j = await AdminAPI.getJobDB(jobId);

      detailRoot.innerHTML = "";
      const frag = JobDetailUI.render(j);
      detailRoot.append(frag);

      // desplazarse hasta el encabezado del detalle (la primera .panel dentro de #job-detail-root)
      const headerPanel = detailRoot.querySelector(".panel");
      (headerPanel || detailRoot).scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      });
    } catch (e) {
      detailRoot.innerHTML = `<div class="panel error">Error obteniendo job: ${
        e?.message || e
      }</div>`;
    }
  }

  function start() {
    load(); // sólo bajo demanda (botón Refrescar), sin auto-polling
  }
  function stop() {
    /* no-op: ya no hay timers */
  }

  return { start, stop, load, showDetail };
})();

// docs/datos/js/components/jobs.js
const JobsUI = (() => {
  const root = document.getElementById("jobs-root");
  const detailRoot = document.getElementById("job-detail-root");

  let filters = {
    jobId: "",
    botId: "",
    state: "",
    createdBy: "",
    day: "",
    month: "",
  };

  function controls() {
    const wrap = document.createElement("div");
    wrap.className = "panel";
    wrap.innerHTML = `
      <div class="row">
        <label style="min-width:160px">State
          <select id="f-state">
            <option value="">(any)</option>
            <option>queued</option>
            <option>running</option>
            <option>succeeded</option>
            <option>failed</option>
            <option>canceled</option>
          </select>
        </label>

        <label style="min-width:220px">Bot ID
          <input id="f-bot" placeholder="search-participants, ..." />
        </label>

        <label style="min-width:220px">Created By
          <input id="f-createdby" placeholder="name, email..." />
        </label>

        <label style="min-width:200px">Job ID (prefix or complete)
          <input id="f-job" placeholder="e.g. 9f12ab34..." />
        </label>

        <label style="min-width:170px">Day
          <input id="f-day" type="date" />
        </label>

        <label style="min-width:160px">Month
          <input id="f-month" type="month" />
        </label>

        <button id="btn-apply" class="secondary xtra-space">Apply</button>
        <button id="btn-clear" class="secondary xtra-space">Clear</button>
      </div>
    `;

    wrap.querySelector("#f-state").value = filters.state;
    wrap.querySelector("#f-bot").value = filters.botId;
    wrap.querySelector("#f-createdby").value = filters.createdBy;
    wrap.querySelector("#f-job").value = filters.jobId;
    wrap.querySelector("#f-day").value = filters.day;
    wrap.querySelector("#f-month").value = filters.month;

    function readFilters() {
      filters = {
        state: wrap.querySelector("#f-state").value || "",
        botId: (wrap.querySelector("#f-bot").value || "").trim(),
        createdBy: (wrap.querySelector("#f-createdby").value || "").trim(),
        jobId: (wrap.querySelector("#f-job").value || "").trim(),
        day: wrap.querySelector("#f-day").value || "",
        month: wrap.querySelector("#f-month").value || "",
      };
    }

    wrap.querySelector("#btn-apply").addEventListener("click", async () => {
      readFilters();
      await load();
    });

    wrap.querySelector("#btn-clear").addEventListener("click", async () => {
      filters = {
        jobId: "",
        botId: "",
        state: "",
        createdBy: "",
        day: "",
        month: "",
      };
      await load();
    });

    // Cambio rápido en state dispara carga inmediata
    wrap.querySelector("#f-state").addEventListener("change", async () => {
      readFilters();
      await load();
    });

    return wrap;
  }

  // defensivo para createdBy heterogéneo
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
      } catch {}
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
      <div class="muted">click in a row to see details.</div>
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

      const r = await DataAPI.listJobsDB({
        jobId: filters.jobId || undefined,
        botId: filters.botId || undefined,
        state: filters.state || undefined,
        createdBy: filters.createdBy || undefined,
        day: filters.day || undefined,
        month: filters.month || undefined,
        limit: 100,
        offset: 0,
      });

      const items = r?.jobs || r?.items || [];
      root.append(table(items));
    } catch (e) {
      root.innerHTML = `<div class="panel error">Error listing jobs: ${
        e?.message || e
      }</div>`;
    }
  }

  async function showDetail(jobId) {
    try {
      const j = await DataAPI.getJobDB(jobId);
      detailRoot.innerHTML = "";
      const frag = JobDetailUI.render(j);
      detailRoot.append(frag);
      const headerPanel = detailRoot.querySelector(".panel");
      (headerPanel || detailRoot).scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      });
    } catch (e) {
      detailRoot.innerHTML = `<div class="panel error">Error getting job: ${
        e?.message || e
      }</div>`;
    }
  }

  function start() {
    load();
  }
  function stop() {}

  return { start, stop, load, showDetail };
})();

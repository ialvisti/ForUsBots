// docs/admin/js/components/job-detail.js
const JobDetailUI = (() => {
  function codeBlock(obj) {
    const el = document.createElement("pre");
    el.className = "code";
    el.textContent =
      typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
    return el;
  }

  function stagesTable(stages = []) {
    if (!Array.isArray(stages) || !stages.length)
      return document.createTextNode("");
    const wrap = document.createElement("div");
    wrap.className = "panel";
    const rows = stages
      .map(
        (s) => `
      <tr>
        <td>${s.name}</td>
        <td>${s.status}</td>
        <td>${s.startedAt || ""}</td>
        <td>${s.endedAt || ""}</td>
        <td>${s.durationMs ?? ""}</td>
        <td>${s.meta ? "<code>…</code>" : ""}</td>
      </tr>
    `
      )
      .join("");
    wrap.innerHTML = `
      <h3>Stages</h3>
      <table>
        <thead><tr><th>Name</th><th>Status</th><th>Start</th><th>End</th><th>ms</th><th>meta</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    return wrap;
  }

  function headerRow(job) {
    const wrap = document.createElement("div");
    wrap.className = "panel";
    wrap.innerHTML = `
      <h3>Job ${job.jobId}</h3>
      <div class="row">
        <span class="badge">${job.botId}</span>
        <span class="badge ${
          job.state === "succeeded"
            ? "ok"
            : job.state === "failed"
            ? "err"
            : job.state === "running"
            ? "warn"
            : ""
        }">${job.state}</span>
        <span class="muted">Accepted: ${job.acceptedAt || "—"}</span>
        <span class="muted">Started: ${job.startedAt || "—"}</span>
        <span class="muted">Finished: ${job.finishedAt || "—"}</span>
        <span class="muted">Total(s): ${job.totalSeconds ?? "—"}</span>
      </div>
    `;
    return wrap;
  }

  function metaBlocks(job) {
    const wrap = document.createElement("div");
    wrap.className = "panel";
    wrap.innerHTML = `<h3>Payload</h3>`;
    const cols = document.createElement("div");
    cols.className = "grid";
    const meta = codeBlock(job.meta || {});
    const result = codeBlock(job.result || {});
    const stagesList = codeBlock(job.stages || job.stagesList || []);
    cols.append(meta, result, stagesList);
    wrap.append(cols);
    return wrap;
  }

  function actions(job) {
    const wrap = document.createElement("div");
    wrap.className = "panel";
    wrap.innerHTML = `
      <h3>Actions</h3>
      <div class="row">
        <button id="btn-cancel">Cancel Job</button>
        <span class="muted">Only applies if still queued.</span>
      </div>
    `;
    const btn = wrap.querySelector("#btn-cancel");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const r = await AdminAPI.cancelJob(job.jobId);
        alert(`Cancel result: ${JSON.stringify(r)}`);
      } catch (e) {
        alert(`Error: ${e?.message || e}`);
      } finally {
        btn.disabled = false;
      }
    });
    return wrap;
  }

  function render(job) {
    const frag = document.createDocumentFragment();
    frag.append(headerRow(job));
    frag.append(stagesTable(job.stages || job.stagesList || []));
    frag.append(metaBlocks(job));
    frag.append(actions(job));
    return frag;
  }

  return { render };
})();

// docs/admin/js/components/settings.js
const SettingsUI = (() => {
  const root = document.getElementById("settings-root");

  function renderPanel(data, capacity) {
    const wrap = document.createElement("div");
    wrap.className = "panel";
    const flags = (data.settings && data.settings.flags) || {};
    const maxConc =
      data.settings?.maxConcurrency ?? capacity?.maxConcurrency ?? 3;

    wrap.innerHTML = `
      <h3>Settings</h3>
      <div class="row">
        <label style="min-width:220px">Max Concurrency
          <input id="set-maxc" type="number" min="1" value="${maxConc}" />
        </label>
        <button id="btn-apply" class="secondary xtra-space">Apply</button>
        <button id="btn-closectx" class="xtra-space">Close Shared Context</button>
        <button id="btn-purge" class="danger xtra-space" title="Delete ALL rows in jobs, job_stages and job_events">Purge DB (jobs)</button>
      </div>
      <h4 class="muted">Flags</h4>
      <div class="row">
        <label><input id="flag-statusPublic" type="checkbox" ${
          flags.statusPublic ? "checked" : ""
        }/> statusPublic</label>
        <label><input id="flag-statusAdminOnly" type="checkbox" ${
          flags.statusAdminOnly ? "checked" : ""
        }/> statusAdminOnly</label>
        <label><input id="flag-evidencePublic" type="checkbox" ${
          flags.evidencePublic ? "checked" : ""
        }/> evidencePublic</label>
        <label><input id="flag-evidenceAdminOnly" type="checkbox" ${
          flags.evidenceAdminOnly ? "checked" : ""
        }/> evidenceAdminOnly</label>
      </div>
      <div class="muted">Changes are applied dynamically; concurrency attempts to start new jobs if slots are available.</div>
      <div class="muted">“Purge DB (jobs)” borra todos los registros de auditoría (jobs, stages y events). Acción irreversible.</div>
    `;

    // Apply settings
    wrap.querySelector("#btn-apply").addEventListener("click", async () => {
      const patch = {
        maxConcurrency: Math.max(
          1,
          parseInt(wrap.querySelector("#set-maxc").value || "1", 10)
        ),
        flags: {
          statusPublic: !!wrap.querySelector("#flag-statusPublic").checked,
          statusAdminOnly: !!wrap.querySelector("#flag-statusAdminOnly")
            .checked,
          evidencePublic: !!wrap.querySelector("#flag-evidencePublic").checked,
          evidenceAdminOnly: !!wrap.querySelector("#flag-evidenceAdminOnly")
            .checked,
        },
      };
      try {
        await AdminAPI.patchSettings(patch);
        alert("Settings updated.");
        render(); // reload
      } catch (e) {
        alert("Error applying settings: " + (e?.message || e));
      }
    });

    // Close context
    wrap.querySelector("#btn-closectx").addEventListener("click", async () => {
      if (!confirm("¿Cerrar el contexto Playwright compartido?")) return;
      try {
        await AdminAPI.closeContext();
        alert("Contexto cerrado.");
      } catch (e) {
        alert("Error: " + (e?.message || e));
      }
    });

    // Purge DB
    const purgeBtn = wrap.querySelector("#btn-purge");
    purgeBtn.addEventListener("click", async () => {
      if (
        !confirm(
          "CAUTION! This will delete ALL records of jobs, stages, and events.\nDo you wish to continue?"
        )
      )
        return;

      const prev = purgeBtn.textContent;
      purgeBtn.disabled = true;
      purgeBtn.textContent = "Purging…";

      try {
        const r = await AdminAPI.purgeJobsDB();
        const msg = r?.removed
          ? `Purge OK.\nJobs: ${r.removed.jobs}\nStages: ${r.removed.stages}\nEvents: ${r.removed.events}`
          : "Purge OK.";
        alert(msg);

        try {
          // refresca la tabla de Jobs (aunque la pestaña no esté activa)
          if (window.JobsUI && typeof JobsUI.load === "function") {
            await JobsUI.load();
          }

          // refresca el Dashboard (métricas); como no hay auto-polling, basta con start()
          if (window.MetricsUI && typeof MetricsUI.start === "function") {
            MetricsUI.start();
          }
        } catch (_) {
          /* no-op si alguna UI no está cargada aún */
        }
        
      } catch (e) {
        alert("Error purging DB: " + (e?.message || e));
      } finally {
        purgeBtn.disabled = false;
        purgeBtn.textContent = prev;
      }
    });

    return wrap;
  }

  async function render() {
    root.innerHTML = "";
    try {
      const [settings, ver] = await Promise.all([
        AdminAPI.getSettings(),
        AdminAPI.version(),
      ]);
      root.append(renderPanel(settings, settings.capacity));
      const vslot = document.getElementById("version-slot");
      if (ver?.ok && vslot) vslot.textContent = `${ver.name} v${ver.version}`;
    } catch (e) {
      root.innerHTML = `<div class="panel error">Error cargando settings: ${
        e?.message || e
      }</div>`;
    }
  }

  return { render };
})();

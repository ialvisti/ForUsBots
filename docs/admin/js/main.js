// docs/admin/js/main.js
const App = (() => {
  const tabs = document.querySelectorAll("nav.tabs button");
  const sections = {
    dashboard: document.getElementById("tab-dashboard"),
    jobs: document.getElementById("tab-jobs"),
    settings: document.getElementById("tab-settings"),
  };

  function activate(tabId) {
    tabs.forEach((b) => b.classList.toggle("active", b.dataset.tab === tabId));
    Object.entries(sections).forEach(([k, el]) => {
      el.classList.toggle("active", k === tabId);
    });
    // arrancar/parar auto-refresh según tab
    if (tabId === "dashboard") {
      MetricsUI.start();
      JobsUI.stop();
    } else if (tabId === "jobs") {
      MetricsUI.stop();
      JobsUI.start();
    } else {
      MetricsUI.stop();
      JobsUI.stop();
      SettingsUI.render();
    }
  }

  tabs.forEach((b) =>
    b.addEventListener("click", () => activate(b.dataset.tab))
  );

  async function onAuthed() {
    // arranque por defecto
    activate("dashboard");
    // precarga versión
    try {
      const ver = await AdminAPI.version();
      const vslot = document.getElementById("version-slot");
      if (ver?.ok && vslot) vslot.textContent = `${ver.name} v${ver.version}`;
    } catch {}
  }

  // boot
  (async () => {
    await AuthUI.check();
  })();

  return { onAuthed, activate };
})();

// docs/datos/js/main.js
const App = (() => {
  const tabs = document.querySelectorAll("nav.tabs button");
  const sections = {
    dashboard: document.getElementById("tab-dashboard"),
    jobs: document.getElementById("tab-jobs"),
  };

  function activate(tabId) {
    tabs.forEach((b) => b.classList.toggle("active", b.dataset.tab === tabId));
    Object.entries(sections).forEach(([k, el]) => {
      el.classList.toggle("active", k === tabId);
    });
    if (tabId === "dashboard") {
      MetricsUI.start();
      JobsUI.stop();
    } else if (tabId === "jobs") {
      MetricsUI.stop();
      JobsUI.start();
    } else {
      MetricsUI.stop();
      JobsUI.stop();
    }
  }

  tabs.forEach((b) =>
    b.addEventListener("click", () => activate(b.dataset.tab))
  );

  async function onAuthed() {
    activate("dashboard");
    try {
      const ver = await Api.req("/forusbot/version", { method: "GET" });
      const vslot = document.getElementById("version-slot");
      if (ver?.ok && vslot) vslot.textContent = `${ver.name} v${ver.version}`;
    } catch {}
  }

  (async () => {
    await AuthUI.check();
  })();

  return { onAuthed, activate };
})();

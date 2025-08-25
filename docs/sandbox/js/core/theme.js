// docs/sandbox/js/core/theme.js
export function initTheme(themeSwitch, themeLabel) {
  function applyTheme(mode) {
    document.documentElement.setAttribute("data-theme", mode);
    if (themeSwitch) themeSwitch.checked = mode === "light";
    if (themeLabel)
      themeLabel.textContent = mode === "light" ? "Light" : "Dark";
    try {
      localStorage.setItem("forusbots.theme", mode);
    } catch {}
  }

  (function init() {
    let mode = "dark";
    try {
      const saved = localStorage.getItem("forusbots.theme");
      if (saved === "light" || saved === "dark") {
        mode = saved;
      } else if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: light)").matches
      ) {
        mode = "light";
      }
    } catch {}
    applyTheme(mode);
  })();

  if (themeSwitch) {
    themeSwitch.addEventListener("change", () => {
      applyTheme(themeSwitch.checked ? "light" : "dark");
    });
  }
}

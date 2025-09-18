// docs/admin/js/auth.js
const AuthUI = (() => {
  const elLoginView = document.getElementById("login-view");
  const elAdminView = document.getElementById("admin-view");
  const form = document.getElementById("login-form");
  const inputToken = document.getElementById("admin-token");
  const errBox = document.getElementById("login-error");
  const btnLogout = document.getElementById("btn-logout");

  let logoutTimer = null;

  function showLogin() {
    elLoginView.classList.remove("hidden");
    elAdminView.classList.add("hidden");
    errBox.hidden = true;
    if (logoutTimer) {
      clearTimeout(logoutTimer);
      logoutTimer = null;
    }
  }
  function showAdmin() {
    elLoginView.classList.add("hidden");
    elAdminView.classList.remove("hidden");
    errBox.hidden = true;
  }

  function scheduleAutoLogout(ms) {
    if (logoutTimer) clearTimeout(logoutTimer);
    const delay = Math.max(0, Math.min(ms || 0, 6 * 60 * 60 * 1000)); // cap 6h por sanidad
    if (delay > 0) {
      logoutTimer = setTimeout(async () => {
        try {
          await AdminAPI.logout();
        } catch {}
        showLogin();
      }, delay);
    }
  }

  async function check() {
    try {
      // Si no hay token en memoria, whoami fallará y caemos a login
      const w = await AdminAPI.whoami();
      if (w && w.isAdmin) {
        showAdmin();
        const ttl = AdminAPI.getSessionTTLms();
        scheduleAutoLogout(ttl);
        App.onAuthed();
      } else {
        showLogin();
      }
    } catch {
      showLogin();
    }
  }

  // --- reemplaza el submit handler por este ---
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = (inputToken.value || "").trim();
    if (!token) return;

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    errBox.hidden = true;

    try {
      // Guarda el token en memoria (no cookies)
      await AdminAPI.login(token);

      // Valida inmediatamente contra el backend
      const w = await AdminAPI.whoami().catch((err) => {
        // Normalizamos el mensaje
        const msg =
          err?.data?.error ||
          err?.message ||
          "Unauthorized (check tokens.json)";
        throw new Error(msg);
      });

      if (!w || !w.isAdmin) {
        throw new Error(
          w && w.role
            ? `Your token has "${w.role}" role but "admin" is required.`
            : "Token not valid or expired."
        );
      }

      // OK: entrar al panel
      inputToken.value = "";
      AuthUI.showAdmin();
      App.onAuthed();
    } catch (err) {
      // Limpia el token en memoria para no dejarlo colgado
      try {
        await AdminAPI.logout();
      } catch {}
      errBox.textContent = err?.message || "Login error";
      errBox.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  btnLogout?.addEventListener("click", async () => {
    try {
      await AdminAPI.logout();
    } catch {}
    showLogin();
  });

  return { check, showLogin, showAdmin };
})();

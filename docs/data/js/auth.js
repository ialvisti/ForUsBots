// docs/datos/js/auth.js
const AuthUI = (() => {
  const elLoginView = document.getElementById("login-view");
  const elDataView = document.getElementById("data-view");
  const form = document.getElementById("login-form");
  const inputToken = document.getElementById("data-token");
  const errBox = document.getElementById("login-error");
  const btnLogout = document.getElementById("btn-logout");

  function showLogin() {
    elLoginView.classList.remove("hidden");
    elDataView.classList.add("hidden");
    errBox.hidden = true;
  }
  function showData() {
    elLoginView.classList.add("hidden");
    elDataView.classList.remove("hidden");
    errBox.hidden = true;
  }

  async function check() {
    try {
      const w = await DataAPI.whoami();
      if (w && w.role) {
        showData();
        App.onAuthed();
      } else {
        showLogin();
      }
    } catch {
      showLogin();
    }
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = (inputToken.value || "").trim();
    if (!token) return;

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    errBox.hidden = true;

    try {
      await DataAPI.login(token);

      const w = await DataAPI.whoami().catch((err) => {
        const msg =
          err?.data?.error ||
          err?.message ||
          "Unauthorized (check tokens.json)";
        throw new Error(msg);
      });

      // En /datos basta con que el token sea reconocido (rol válido cualquiera)
      if (!w || !w.role) throw new Error("Token inválido o no reconocido.");

      inputToken.value = "";
      showData();
      App.onAuthed();
    } catch (err) {
      try {
        await DataAPI.logout();
      } catch {}
      errBox.textContent = err?.message || "Login error";
      errBox.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  btnLogout?.addEventListener("click", async () => {
    try {
      await DataAPI.logout();
    } catch {}
    showLogin();
  });

  return { check, showLogin, showData };
})();

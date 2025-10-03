// Js/builder/builderUtils.js
// Utilidades compartidas para el Article Builder

/* ------------------------------------------------------
   Text formatting y folder-style tabs
------------------------------------------------------ */
function formatText(text) {
  return String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/_(.*?)_/g, "<u>$1</u>")
    .replace(/\n/g, "<br>");
}
function initTabs(root) {
  const frames = root.querySelectorAll(".tab-frame");
  frames.forEach((frame) => {
    const tabs = frame.querySelectorAll(".tab-nav button");
    const panels = frame.querySelectorAll(".tab-panel");
    tabs.forEach((btn, i) => {
      btn.classList.toggle("active", i === 0);
      panels[i].classList.toggle("active", i === 0);
      btn.addEventListener("click", () => {
        tabs.forEach((b) => b.classList.remove("active"));
        panels.forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        panels[i].classList.add("active");
      });
    });
  });
}

/* ------------------------------------------------------
   HTML/text helpers
------------------------------------------------------ */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}
function renderMaybeHtml(text) {
  return /<\/?[a-z][\s\S]*>/i.test(text) ? text : formatText(text);
}

/* ------------------------------------------------------
   Name & link helpers
------------------------------------------------------ */
function shortName(full) {
  const s = String(full || "").trim();
  if (!s) return "";
  const parts = s.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0],
    last = parts[parts.length - 1];
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}
function makeArticleLinkHref(articleId, dropdownId) {
  const aidRaw = String(articleId || "").trim();
  const didRaw = String(dropdownId || "").trim();
  const aid = encodeURIComponent(aidRaw);
  const did = encodeURIComponent(didRaw);
  const currentId =
    (window.BuilderState &&
      window.BuilderState.builderState &&
      window.BuilderState.builderState.id) ||
    "";
  if (aidRaw && currentId && aidRaw === currentId) return `#${did}`;
  return `article.html?q=${aid}#${did}`;
}

/* ------------------------------------------------------
   Roles / Auth helpers
------------------------------------------------------ */
const LEAD_ROLES = new Set([
  "admin",
  "pa_lead",
  "rm_lead",
  "ops_lead",
  "imp_lead",
]);

// Overlay simple para pedir token
function createTokenOverlay(
  title = "Authentication",
  subtitle = "Ingresa tu token para continuar."
) {
  const wrap = document.createElement("div");
  wrap.id = "token-overlay";
  wrap.style.position = "fixed";
  wrap.style.inset = "0";
  wrap.style.background = "rgba(0,0,0,0.55)";
  wrap.style.display = "grid";
  wrap.style.placeItems = "center";
  wrap.style.zIndex = "9999";
  const card = document.createElement("div");
  card.style.background = "var(--bg, #fff)";
  card.style.color = "var(--text, #222)";
  card.style.padding = "1.25rem";
  card.style.borderRadius = "12px";
  card.style.minWidth = "320px";
  card.style.maxWidth = "92vw";
  card.style.boxShadow = "0 8px 30px rgba(0,0,0,.2)";
  card.innerHTML = `
    <h3 style="margin:0 0 .75rem 0;">${escapeHtml(title)}</h3>
    <p style="margin:.25rem 0 .75rem 0; font-size:.95rem;">${escapeHtml(
      subtitle
    )}</p>
    <label style="display:block; margin-bottom:.5rem;">
      <span style="display:block; font-size:.85rem; margin-bottom:.25rem;">Token</span>
      <input id="auth-token-input" type="password" style="width:100%; padding:.5rem; border-radius:8px; border:1px solid #ddd;">
    </label>
    <div style="display:flex; gap:.5rem; justify-content:flex-end;">
      <button id="auth-token-ok" style="padding:.5rem .9rem; border-radius:8px;">Continuar</button>
    </div>
    <div id="auth-token-msg" style="margin-top:.6rem; font-size:.85rem; color:#b00;"></div>`;
  wrap.appendChild(card);
  return wrap;
}
async function promptTokenForAction(actionLabel) {
  return new Promise((resolve) => {
    const ov = createTokenOverlay(
      "Authentication required",
      `Ingresa tu token para "${actionLabel}".`
    );
    document.body.appendChild(ov);
    const input = ov.querySelector("#auth-token-input");
    const ok = ov.querySelector("#auth-token-ok");
    const msg = ov.querySelector("#auth-token-msg");
    const done = () => {
      const v = (input.value || "").trim();
      if (!v) {
        msg.textContent = "El token es requerido.";
        return;
      }
      ov.remove();
      resolve(v);
    };
    ok.addEventListener("click", done);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") done();
      if (e.key === "Escape") {
        ov.remove();
        resolve(null);
      }
    });
    setTimeout(() => input.focus(), 0);
  });
}

// /forusbot/auth/whoami
async function whoAmI(token) {
  try {
    const r = await fetch("/forusbot/auth/whoami", {
      headers: { "x-auth-token": token },
      cache: "no-store",
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, role: null, user: null };
    return { ok: true, role: j.role || null, user: j.user || null };
  } catch {
    return { ok: false, role: null, user: null };
  }
}

// Verifica rol permitido para una acción (si provided)
async function requireRoleForAction(token, allowedRoles) {
  const info = await whoAmI(token);
  if (!info.ok)
    return { ok: false, role: null, error: "Token inválido o no autorizado." };
  if (allowedRoles && allowedRoles.size) {
    if (!allowedRoles.has(String(info.role || "").toLowerCase())) {
      return {
        ok: false,
        role: info.role || null,
        error: "No tienes permisos para esta acción.",
      };
    }
  }
  return { ok: true, role: info.role || null };
}

/* ------------------------------------------------------
   ID utilities
------------------------------------------------------ */
function normalizeId(value) {
  const withoutAccents = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return withoutAccents
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "_");
}
function slugifyTitleToId(title, taken) {
  const base = normalizeId(title);
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}
function extractLucidId(input) {
  if (!input) return "";
  const m = String(input).match(/[a-f0-9\-]{8,}/i);
  return m ? m[0] : String(input).trim();
}

/* ------------------------------------------------------
   UI helpers
------------------------------------------------------ */
function announce(el, message) {
  if (el) el.textContent = message;
}

/* ------------------------------------------------------
   API client
------------------------------------------------------ */
async function _json(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || "Request error");
  return data;
}
function _headersWithToken(token, extra = {}) {
  const h = { ...extra };
  if (token) h["x-auth-token"] = token;
  return h;
}

const BuilderAPI = {
  // Drafts
  async listDrafts(token) {
    return _json(
      await fetch("/forusbot/articles-draft", {
        headers: _headersWithToken(token),
      })
    );
  },
  async getDraft(id, token) {
    return _json(
      await fetch(`/forusbot/articles-draft/${encodeURIComponent(id)}`, {
        headers: _headersWithToken(token),
      })
    );
  },
  async upsertDraft(article, token) {
    return _json(
      await fetch("/forusbot/articles-draft", {
        method: "POST",
        headers: _headersWithToken(token, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(article),
      })
    );
  },
  async renameDraft(id, newId, token) {
    return _json(
      await fetch(`/forusbot/articles-draft/${encodeURIComponent(id)}/rename`, {
        method: "POST",
        headers: _headersWithToken(token, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ newId }),
      })
    );
  },
  async deleteDraft(id, token) {
    return _json(
      await fetch(`/forusbot/articles-draft/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: _headersWithToken(token),
      })
    );
  },
  async publishDraft(id, token) {
    return _json(
      await fetch(
        `/forusbot/articles-draft/${encodeURIComponent(id)}/publish`,
        { method: "POST", headers: _headersWithToken(token) }
      )
    );
  },
  // Published
  async listPublished(token) {
    return _json(
      await fetch("/forusbot/articles-draft/_published", {
        headers: _headersWithToken(token),
      })
    );
  },
  async getPublished(id, token) {
    return _json(
      await fetch(
        `/forusbot/articles-draft/_published/${encodeURIComponent(id)}`,
        { headers: _headersWithToken(token) }
      )
    );
  },
  // Users
  async listUsers(token) {
    return _json(
      await fetch("/forusbot/users", { headers: _headersWithToken(token) })
    );
  },
  // Auth helpers
  async whoAmI(token) {
    return whoAmI(token);
  },
};

// Export
if (typeof window !== "undefined") {
  window.BuilderUtils = {
    formatText,
    initTabs,
    escapeHtml,
    escapeAttr,
    renderMaybeHtml,
    shortName,
    makeArticleLinkHref,
    normalizeId,
    slugifyTitleToId,
    extractLucidId,
    announce,
    promptTokenForAction,
    requireRoleForAction,
    LEAD_ROLES,
  };
  window.BuilderAPI = BuilderAPI;
}

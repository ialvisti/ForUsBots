// Js/builderPreview.js
// Live preview rendering (clona layout de article.html)

// Estado local: cuáles dropdowns están abiertos (clave por id o por "gi:ii")
const __openMap = new Map();
// Estado local: pestaña activa por bloque tabs (key = data-uid, val = índice)
const __tabsActive = new Map();

/* ------------------------------------------------------
   Helpers
------------------------------------------------------ */
function keyForItem(item, gi, ii) {
  return item && item.id ? item.id : `${gi}:${ii}`;
}

function getCurrentArticleId() {
  return (
    (window.BuilderState &&
      window.BuilderState.builderState &&
      window.BuilderState.builderState.id) ||
    ""
  );
}

/* Tabs helpers: aplicar/recordar pestaña activa */
function applyActiveToTabFrame(frame, idx) {
  const buttons = frame.querySelectorAll(".tab-nav button");
  const panels = frame.querySelectorAll(".tab-panel");
  const n = Math.max(0, Math.min(idx, buttons.length - 1));
  buttons.forEach((b, i) => b.classList.toggle("active", i === n));
  panels.forEach((p, i) => p.classList.toggle("active", i === n));
}

function initTabsWithState(scopeEl) {
  const frames = scopeEl.querySelectorAll(".tab-frame");
  frames.forEach((frame) => {
    const uid = frame.dataset.uid || "";
    const defaultIdx = __tabsActive.has(uid) ? __tabsActive.get(uid) : 0;
    applyActiveToTabFrame(frame, defaultIdx);

    const buttons = frame.querySelectorAll(".tab-nav button");
    buttons.forEach((btn, i) => {
      btn.addEventListener("click", () => {
        applyActiveToTabFrame(frame, i);
        if (uid) __tabsActive.set(uid, i);
      });
    });
  });
}

/* ------------------------------------------------------
   Dropdown animation helpers (preview)
------------------------------------------------------ */
function expandDropdownContent(el) {
  if (!el) return;
  el.classList.add("show");
  el.style.display = "block";
  el.style.overflow = "hidden";
  el.style.opacity = "0";
  el.style.paddingTop = "0";
  el.style.paddingBottom = "0";
  el.style.height = "0px";
  void el.offsetHeight;
  const target = el.scrollHeight;
  el.style.transition =
    "height 300ms ease, opacity 300ms ease, padding 300ms ease";
  el.style.height = target + "px";
  el.style.opacity = "1";
  el.style.paddingTop = "";
  el.style.paddingBottom = "";
  const onEnd = () => {
    el.style.height = "";
    el.style.overflow = "visible";
    el.style.transition = "";
    el.removeEventListener("transitionend", onEnd);
  };
  el.addEventListener("transitionend", onEnd);
}

function collapseDropdownContent(el) {
  if (!el) return;
  const current = el.scrollHeight;
  el.style.height = current + "px";
  el.style.overflow = "hidden";
  el.style.transition =
    "height 260ms ease, opacity 260ms ease, padding 260ms ease";
  void el.offsetHeight;
  el.style.height = "0px";
  el.style.opacity = "0";
  el.style.paddingTop = "0";
  el.style.paddingBottom = "0";
  const onEnd = () => {
    el.classList.remove("show");
    el.style.display = "none";
    el.style.height = "";
    el.style.opacity = "";
    el.style.paddingTop = "";
    el.style.paddingBottom = "";
    el.style.overflow = "";
    el.style.transition = "";
    el.removeEventListener("transitionend", onEnd);
  };
  el.addEventListener("transitionend", onEnd);
}

/* ------------------------------------------------------
   Abrir dropdown por id (y opcionalmente hacer scroll)
------------------------------------------------------ */
function openDropdownById(id, { scroll = true } = {}) {
  if (!id) return false;

  const root = document.getElementById("builderPreview");
  if (!root) return false;

  // Buscar por id (o por data-key como fallback)
  const dd =
    root.querySelector(`.dropdown#${CSS.escape(id)}`) ||
    Array.from(root.querySelectorAll(".dropdown")).find(
      (n) => n.dataset.key === id
    );

  if (!dd) return false;

  const btn = dd.querySelector(".dropbtn");
  const cont = dd.querySelector(".dropdown-content");
  if (!btn || !cont) return false;

  // Abrir en estado final (sin animación en navegación directa)
  cont.classList.add("show");
  cont.style.display = "block";
  cont.style.opacity = "1";
  btn.style.background = "var(--button-text)";
  btn.style.color = "var(--button)";
  __openMap.set(id, true);

  if (scroll) dd.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

/* ------------------------------------------------------
   Hash navigation: abrir dropdown al que apunta el hash
------------------------------------------------------ */
function handleHashNavigation() {
  const raw = window.location.hash || "";
  const id = raw.startsWith("#") ? raw.slice(1) : raw;
  if (!id) return;
  openDropdownById(decodeURIComponent(id), { scroll: false });
}

/* ------------------------------------------------------
   Preview Rendering
------------------------------------------------------ */
function triggerPreview() {
  if (window.BuilderState.builderState)
    renderBuilderPreview(window.BuilderState.builderState);
}

function renderBuilderPreview(articleObj) {
  const root = document.getElementById("builderPreview");
  if (!root) return;

  const titleEl = root.querySelector("#title");
  const descEl = root.querySelector("#desc");
  const ddContainer = root.querySelector("#dropdowns");
  const roles = root.querySelector("#rolesContainer");

  if (titleEl) titleEl.textContent = articleObj.title || "";
  if (descEl)
    descEl.innerHTML = window.BuilderUtils.formatText(articleObj.desc || "");

  if (ddContainer) {
    // Capturar estado abierto antes de re-render
    Array.from(ddContainer.querySelectorAll(".dropdown")).forEach((dd) => {
      const id = dd.id || dd.dataset.key;
      const open = dd
        .querySelector(".dropdown-content")
        ?.classList.contains("show");
      if (id) __openMap.set(id, !!open);
    });

    // Capturar pestañas activas por data-uid antes del re-render
    Array.from(ddContainer.querySelectorAll(".tab-frame")).forEach((frame) => {
      const uid = frame.dataset.uid;
      if (!uid) return;
      const buttons = frame.querySelectorAll(".tab-nav button");
      let activeIdx = 0;
      buttons.forEach((b, i) => {
        if (b.classList.contains("active")) activeIdx = i;
      });
      __tabsActive.set(uid, activeIdx);
    });

    ddContainer.innerHTML = "";
    (articleObj.dropdownGroups || []).forEach((group, gi) => {
      const h1 = document.createElement("h1");
      h1.textContent = group.topic || "";
      ddContainer.appendChild(h1);

      (group.items || []).forEach((item, ii) => {
        const dd = document.createElement("div");
        dd.className = "dropdown";
        const k = keyForItem(item, gi, ii);
        if (item.id) dd.id = item.id;
        else dd.dataset.key = k;

        const btn = document.createElement("button");
        btn.className = "dropbtn";

        // Numeración dinámica [n] dentro del grupo
        const number = ii + 1;
        const label = `[${number}] ${item.title || "Untitled"}`;
        btn.innerHTML = window.BuilderUtils.formatText(label);

        const cont = document.createElement("div");
        cont.className = "dropdown-content";
        const txt = (item.detail || "").trim();
        cont.innerHTML = /<\/?[a-z][\s\S]*>/i.test(txt)
          ? txt
          : window.BuilderUtils.formatText(txt);

        // Inicializar tabs con preservación de estado
        window.BuilderUtils.initTabs(cont);
        initTabsWithState(cont);

        // Estado inicial: cerrado. Mantener estado si existe.
        const idKey = item.id || k;
        if (__openMap.get(idKey)) {
          cont.classList.add("show");
          cont.style.display = "block";
          cont.style.opacity = "1";
          btn.style.background = "var(--button-text)";
          btn.style.color = "var(--button)";
        }

        btn.addEventListener("click", () => {
          const isOpen = cont.classList.contains("show");
          if (isOpen) {
            collapseDropdownContent(cont);
            __openMap.set(idKey, false);
            btn.style.background = "";
            btn.style.color = "";
          } else {
            expandDropdownContent(cont);
            __openMap.set(idKey, true);
            btn.style.background = "var(--button-text)";
            btn.style.color = "var(--button)";
          }
        });

        dd.append(btn, cont);
        ddContainer.appendChild(dd);
      });

      ddContainer.appendChild(document.createElement("br"));
    });

    /* --------------------------------------------------
       Delegación de clicks en enlaces internos
    --------------------------------------------------- */
    ddContainer.addEventListener("click", (ev) => {
      const a = ev.target.closest("a");
      if (!a) return;

      const href = a.getAttribute("href") || "";
      if (!href) return;

      try {
        // Caso 1: ancla pura
        if (href.startsWith("#")) {
          ev.preventDefault();
          const id = href.slice(1);
          history.replaceState(null, "", `#${encodeURIComponent(id)}`);
          openDropdownById(id);
          return;
        }

        // Caso 2: mismo artículo con hash
        const url = new URL(href, window.location.origin);
        const isArticle = /article\.html$/i.test(url.pathname);
        const q = url.searchParams.get("q") || url.searchParams.get("id") || "";
        const h = (url.hash || "").replace(/^#/, "");
        const sameArticle = q && q === getCurrentArticleId();

        if (isArticle && sameArticle && h) {
          ev.preventDefault();
          history.replaceState(null, "", `#${encodeURIComponent(h)}`);
          openDropdownById(h);
          return;
        }
      } catch {
        // si el parseo falla, dejamos que el navegador maneje el link
      }
    });
  }

  if (roles) {
    roles.innerHTML = "";
    const makeBox = (label, list) => {
      const box = document.createElement("div");
      box.className = "role-box";
      const h4 = document.createElement("h4");
      h4.textContent = label;
      const profs = document.createElement("div");
      profs.className = "profiles";
      (Array.isArray(list) ? list : []).forEach((x) => {
        const wrap = document.createElement("div");
        wrap.style.display = "inline-flex";
        wrap.style.flexDirection = "column";
        wrap.style.alignItems = "center";
        wrap.style.marginRight = ".35rem";

        const img = document.createElement("img");
        img.src = x.img || "/docs/knowledge-database/Images/people/default.png";
        img.alt = x.name || x.id || "user";
        img.title = x.name || x.id || "";

        const cap = document.createElement("small");
        cap.textContent = window.BuilderUtils.shortName(x.name || x.id || "");

        wrap.append(img, cap);
        profs.appendChild(wrap);
      });
      box.append(h4, profs);
      roles.appendChild(box);
    };
    makeBox("Article owners: ", articleObj.owners);
    makeBox("Subject experts: ", articleObj.experts);
  }

  // Si hay hash presente tras render, abrir el dropdown objetivo
  handleHashNavigation();
}

// Reaccionar a cambios del hash (p. ej., usuario pega un #id)
window.addEventListener("hashchange", handleHashNavigation);

// Export para uso en otros módulos
if (typeof window !== "undefined") {
  window.BuilderPreview = {
    triggerPreview,
    renderBuilderPreview,
    openDropdownById, // útil si quieres abrir desde otros módulos
  };
}

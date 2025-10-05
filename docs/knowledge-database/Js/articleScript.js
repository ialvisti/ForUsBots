// Js/articleScript.js (solo API)
import { initSearchComponent, loadArticlesList } from "./searchComponent.js";

function formatText(text) {
  return String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/_(.*?)_/g, "<u>$1</u>")
    .replace(/\n/g, "<br>");
}

/* ---------------------------
   Tabs (simple)
---------------------------- */
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

/* ---------------------------
   Dropdown animation helpers
   - Sin límites de altura, sin scroll interno
---------------------------- */
function expandDropdownContent(el) {
  if (!el) return;
  el.classList.add("show"); // estado visual final
  el.style.display = "block"; // debe estar visible para medir
  el.style.overflow = "hidden"; // sin scroll durante animación
  el.style.opacity = "0";
  el.style.paddingTop = "0";
  el.style.paddingBottom = "0";
  el.style.height = "0px";

  // forzar reflow antes de animar
  void el.offsetHeight;

  const target = el.scrollHeight;
  el.style.transition =
    "height 300ms ease, opacity 300ms ease, padding 300ms ease";
  el.style.height = target + "px";
  el.style.opacity = "1";
  el.style.paddingTop = "";
  el.style.paddingBottom = "";

  const onEnd = () => {
    el.style.height = ""; // altura auto
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
  // reflow
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

/* ---------------------------
   Data
---------------------------- */
async function fetchArticleById(id) {
  const res = await fetch(`/forusbot/articles/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Article HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.article || null;
}

function showNotFound(id) {
  document.getElementById("title").textContent = "Article not found";
  document.getElementById("articleTitle").textContent = "Article not found";
  document.getElementById(
    "desc"
  ).innerHTML = `We couldn’t find <code>${id}</code>. Check that <code>docs/Knwoledge_Database/Articles/${id}.json</code> exists or was uploaded via API.`;
}

/* ---------------------------
   Render
---------------------------- */
async function renderArticle() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id) return showNotFound("(missing id)");

  const art = await fetchArticleById(id);
  if (!art) return showNotFound(id);

  // Pre-carga lista para el buscador (no bloqueante)
  loadArticlesList().catch(() => {});

  // Título & descripción
  document.getElementById("title").textContent = art.title;
  document.getElementById("articleTitle").textContent = art.title;
  document.getElementById("desc").innerHTML = formatText(art.desc);

  // Cuerpo
  const container = document.getElementById("dropdowns");
  container.innerHTML = "";
  (art.dropdownGroups || []).forEach((group) => {
    const h1 = document.createElement("h1");
    h1.textContent = group.topic;
    container.appendChild(h1);

    (group.items || []).forEach((item, ii) => {
      const dd = document.createElement("div");
      dd.className = "dropdown";
      if (item.id) dd.id = item.id;

      const btn = document.createElement("button");
      btn.className = "dropbtn";
      // Numeración dinámica [n] dentro del grupo
      btn.innerHTML = formatText(`[${ii + 1}] ${item.title}`);

      const cont = document.createElement("div");
      cont.className = "dropdown-content";
      const txt = String(item.detail || "").trim();
      cont.innerHTML = /<\/?[a-z][\s\S]*>/i.test(txt) ? txt : formatText(txt);

      initTabs(cont);

      // click con animación
      btn.addEventListener("click", () => {
        const isOpen = cont.classList.contains("show");
        if (isOpen) {
          collapseDropdownContent(cont);
          btn.style.background = "";
          btn.style.color = "";
        } else {
          expandDropdownContent(cont);
          btn.style.background = "var(--button-text)";
          btn.style.color = "var(--button)";
        }
      });

      dd.append(btn, cont);
      container.appendChild(dd);
    });
    container.appendChild(document.createElement("br"));
  });

  // Owners & Experts
  const roles = document.getElementById("rolesContainer");
  roles.innerHTML = "";
  const makeBox = (label, list) => {
    list = Array.isArray(list) ? list : [];
    const box = document.createElement("div");
    box.className = "role-box";
    const h4 = document.createElement("h4");
    h4.textContent = label + list.map((x) => x.name).join(", ");
    const profs = document.createElement("div");
    profs.className = "profiles";
    list.forEach((x) => {
      const img = document.createElement("img");
      img.src = x.img;
      img.alt = x.name;
      profs.appendChild(img);
    });
    box.append(h4, profs);
    roles.appendChild(box);
  };
  makeBox("Article owners: ", art.owners);
  makeBox("Subject experts: ", art.experts);

  openDropdownFromHash();
}

/* ---------------------------
   Hash open (sin animación forzada)
---------------------------- */
function openDropdownFromHash() {
  const hash = window.location.hash;
  if (!hash) return;
  const target = document.getElementById(hash.slice(1));
  if (!target) return;
  const content = target.querySelector(".dropdown-content");
  const button = target.querySelector(".dropbtn");
  if (content && button && !content.classList.contains("show")) {
    // abrir en estado final (sin animar para asegurar scrollIntoView correcto)
    content.classList.add("show");
    content.style.display = "block";
    content.style.opacity = "1";
    button.style.background = "var(--button-text)";
    button.style.color = "var(--button)";
    setTimeout(
      () => target.scrollIntoView({ behavior: "smooth", block: "center" }),
      50
    );
  }
}

/* ---------------------------
   Bootstrap
---------------------------- */
function initArticle() {
  initSearchComponent();
  renderArticle();
  window.addEventListener("hashchange", () =>
    setTimeout(openDropdownFromHash, 50)
  );
  document.body.addEventListener("click", (ev) => {
    const link = ev.target.closest("a");
    if (!link || !link.hash) return;
    if (document.getElementById(link.hash.slice(1))) {
      setTimeout(openDropdownFromHash, 50);
    }
  });
}

window.addEventListener("DOMContentLoaded", initArticle);

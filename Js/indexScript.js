// Js/indexScript.js (solo API)
import { initSearchComponent, loadArticlesList } from "./searchComponent.js";

function formatText(text) {
  return String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/_(.*?)_/g, "<u>$1</u>")
    .replace(/\n/g, "<br>");
}

function renderIndex(list) {
  // Suggested
  const sugList = document.getElementById("suggestedList");
  sugList.innerHTML = "";
  list.slice(0, 3).forEach((a) => {
    const li = document.createElement("li");
    li.innerHTML = `<a href="article.html?id=${encodeURIComponent(
      a.id
    )}">${formatText(a.title)}</a>`;
    sugList.appendChild(li);
  });

  // All (respeta búsqueda previa)
  let display = list;
  const stored = localStorage.getItem("searchResults");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) display = parsed;
    } catch {}
    localStorage.removeItem("searchResults");
  }
  const allList = document.getElementById("articlesList");
  allList.innerHTML = "";
  if (!display.length) {
    allList.innerHTML = `<li style="opacity:.7">No articles yet. Add JSON files under <code>docs/Knwoledge_Database/Articles/</code>.</li>`;
    return;
  }
  display.forEach((a) => {
    const li = document.createElement("li");
    li.innerHTML = `<a href="article.html?id=${encodeURIComponent(
      a.id
    )}">${formatText(a.title)}</a>`;
    allList.appendChild(li);
  });
}

async function initIndex() {
  initSearchComponent();
  try {
    const list = await loadArticlesList();
    renderIndex(list);
  } catch (err) {
    console.error("[index] load error", err);
    renderIndex([]); // mensaje “no articles”
  }
}

document.addEventListener("DOMContentLoaded", initIndex);

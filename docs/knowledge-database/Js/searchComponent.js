// Js/searchComponent.js (solo API)
window.kbArticles = []; // cache en memoria para buscador
let _currentFocus = -1;

export async function loadArticlesList() {
  const res = await fetch("/forusbot/articles", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Articles HTTP ${res.status}`);
  const json = await res.json();
  window.kbArticles = Array.isArray(json.articles) ? json.articles : [];
  return window.kbArticles;
}

export function initSearchComponent() {
  // Estilo para highlight
  if (!document.getElementById("autocomplete-style")) {
    const style = document.createElement("style");
    style.id = "autocomplete-style";
    style.textContent = `.autocomplete-active{background-color:var(--hover);color:inherit}`;
    document.head.appendChild(style);
  }
  const input = document.getElementById("searchInput");
  input.addEventListener("input", (e) => showSuggestions(e.target.value));
  input.addEventListener("keydown", handleKeyDown);
  document.getElementById("searchBtn").addEventListener("click", doSearch);
  document.addEventListener("click", closeSuggestions);
}

function getSourceArticles() {
  return Array.isArray(window.kbArticles) ? window.kbArticles : [];
}

function showSuggestions(query) {
  const list = document.getElementById("autocomplete-list");
  list.innerHTML = "";
  _currentFocus = -1;
  if (!query) return;
  const matches = getSourceArticles().filter((a) =>
    String(a.title || "")
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  matches.forEach((a) => {
    const div = document.createElement("div");
    div.textContent = a.title;
    div.classList.add("autocomplete-item");
    div.addEventListener("click", () => selectSuggestion(a.id));
    list.appendChild(div);
  });
}

function selectSuggestion(id) {
  window.location.href = `article.html?id=${encodeURIComponent(id)}`;
}

function closeSuggestions(e) {
  if (!e.target.matches("#searchInput")) {
    document.getElementById("autocomplete-list").innerHTML = "";
  }
}

function doSearch() {
  const q = document.getElementById("searchInput").value.toLowerCase();
  const found = getSourceArticles().filter(
    (a) =>
      String(a.title || "")
        .toLowerCase()
        .includes(q) ||
      String(a.desc || "")
        .toLowerCase()
        .includes(q)
  );
  localStorage.setItem("searchResults", JSON.stringify(found));
  window.location.href = "index.html";
}

function addActive(items) {
  if (!items) return false;
  removeActive(items);
  if (_currentFocus >= items.length) _currentFocus = 0;
  if (_currentFocus < 0) _currentFocus = items.length - 1;
  items[_currentFocus].classList.add("autocomplete-active");
}

function removeActive(items) {
  Array.from(items).forEach((i) => i.classList.remove("autocomplete-active"));
}

function handleKeyDown(e) {
  const list = document.getElementById("autocomplete-list");
  const items = list.getElementsByClassName("autocomplete-item");
  if (e.key === "ArrowDown") {
    _currentFocus++;
    addActive(items);
    e.preventDefault();
  } else if (e.key === "ArrowUp") {
    _currentFocus--;
    addActive(items);
    e.preventDefault();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (_currentFocus > -1 && items[_currentFocus])
      items[_currentFocus].click();
    else doSearch();
  }
}

// Js/indexScript.js
// Asume que Js/articlesData.js y Js/searchComponent.js ya fueron cargados antes

/**
 * Convierte markdown ligero a HTML
 */
function formatText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/_(.*?)_/g, '<u>$1</u>')
    .replace(/\n/g, '<br>');
}

/**
 * Renderiza la lista de Suggested y All Articles
 */
function renderIndex() {
  // Suggested (primeros 3)
  const sugList = document.getElementById('suggestedList');
  sugList.innerHTML = '';
  articles.slice(0, 3).forEach(a => {
    const li = document.createElement('li');
    li.innerHTML = `<a href="article.html?id=${a.id}">${formatText(a.title)}</a>`;
    sugList.appendChild(li);
  });

  // All Articles (aplica filtro si existe)
  let display = articles;
  const stored = localStorage.getItem('searchResults');
  if (stored) {
    try { display = JSON.parse(stored); } catch {}
    localStorage.removeItem('searchResults');
  }
  const allList = document.getElementById('articlesList');
  allList.innerHTML = '';
  display.forEach(a => {
    const li = document.createElement('li');
    li.innerHTML = `<a href="article.html?id=${a.id}">${formatText(a.title)}</a>`;
    allList.appendChild(li);
  });
}

/**
 * Inicializa la página de índice
 */
function initIndex() {
  initSearchComponent();
  renderIndex();
}

document.addEventListener('DOMContentLoaded', initIndex);

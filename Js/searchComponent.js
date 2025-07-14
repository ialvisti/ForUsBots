// Js/searchComponent.js

let _currentFocus = -1;

/**
 * Inicializa el componente de búsqueda:
 * - Listeners de input y teclado
 * - Botón Search
 * - Click fuera para cerrar sugerencias
 * - Inyecta estilo para el highlight
 */
function initSearchComponent() {
  // Inyectamos la clase .autocomplete-active para el highlight
  if (!document.getElementById('autocomplete-style')) {
    const style = document.createElement('style');
    style.id = 'autocomplete-style';
    style.textContent = `
      .autocomplete-active {
        background-color: #e0e0e0;
        color: inherit;
      }
    `;
    document.head.appendChild(style);
  }

  const input = document.getElementById('searchInput');
  input.addEventListener('input', e => showSuggestions(e.target.value));
  input.addEventListener('keydown', handleKeyDown);
  document.getElementById('searchBtn')
          .addEventListener('click', doSearch);
  document.addEventListener('click', closeSuggestions);
}

/**
 * Muestra coincidencias en #autocomplete-list
 */
function showSuggestions(query) {
  const list = document.getElementById('autocomplete-list');
  list.innerHTML = '';
  _currentFocus = -1;
  if (!query) return;
  const matches = articles.filter(a =>
    a.title.toLowerCase().includes(query.toLowerCase())
  );
  matches.forEach(a => {
    const div = document.createElement('div');
    div.textContent = a.title;
    div.classList.add('autocomplete-item');
    div.addEventListener('click', () => selectSuggestion(a.id));
    list.appendChild(div);
  });
}

/**
 * Navega a article.html?id=...
 */
function selectSuggestion(id) {
  window.location.href = `article.html?id=${id}`;
}

/**
 * Cierra la lista si haces click fuera del input
 */
function closeSuggestions(e) {
  if (!e.target.matches('#searchInput')) {
    document.getElementById('autocomplete-list').innerHTML = '';
  }
}

/**
 * Si presionas Enter sin un item activo, realiza búsqueda completa
 */
function doSearch() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const found = articles.filter(a =>
    a.title.toLowerCase().includes(q) ||
    a.desc.toLowerCase().includes(q)
  );
  localStorage.setItem('searchResults', JSON.stringify(found));
  window.location.href = 'index.html';
}

/**
 * Marca con la clase .autocomplete-active el item resaltado
 */
function addActive(items) {
  if (!items) return false;
  removeActive(items);
  if (_currentFocus >= items.length) _currentFocus = 0;
  if (_currentFocus < 0) _currentFocus = items.length - 1;
  items[_currentFocus].classList.add('autocomplete-active');
}

/**
 * Quita el highlight de todos
 */
function removeActive(items) {
  Array.from(items).forEach(i =>
    i.classList.remove('autocomplete-active')
  );
}

/**
 * Maneja flechas Arriba/Abajo y Enter
 */
function handleKeyDown(e) {
  const list = document.getElementById('autocomplete-list');
  const items = list.getElementsByClassName('autocomplete-item');
  if (e.key === 'ArrowDown') {
    _currentFocus++;
    addActive(items);
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    _currentFocus--;
    addActive(items);
    e.preventDefault();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (_currentFocus > -1 && items[_currentFocus]) {
      items[_currentFocus].click();
    } else {
      doSearch();
    }
  }
}

// Exportar para su uso, si usas módulos:
// export { initSearchComponent };

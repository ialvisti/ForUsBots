// Js/articleScript.js
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
 * Inicializa cualquier tab-frame dentro de un contenedor dado
 */
function initTabs(root) {
  const frames = root.querySelectorAll('.tab-frame');
  frames.forEach(frame => {
    const tabs = frame.querySelectorAll('.tab-nav button');
    const panels = frame.querySelectorAll('.tab-panel');
    tabs.forEach((btn, i) => {
      btn.classList.toggle('active', i === 0);
      panels[i].classList.toggle('active', i === 0);
      btn.addEventListener('click', () => {
        tabs.forEach(b => b.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        panels[i].classList.add('active');
      });
    });
  });
}

/**
 * Renderiza un solo artículo y sus dropdownGroups
 */
function renderArticle() {
  const params = new URLSearchParams(window.location.search);
  const art = articles.find(a => a.id === params.get('id'));
  if (!art) return;

  // 1) Título & descripción
  document.getElementById('title').textContent = art.title;
  document.getElementById('articleTitle').textContent = art.title;
  document.getElementById('desc').innerHTML = formatText(art.desc);

  // 2) Renderiza cada grupo en #dropdowns
  const container = document.getElementById('dropdowns');
  container.innerHTML = '';

  art.dropdownGroups.forEach(group => {
    const h1 = document.createElement('h1');
    h1.textContent = group.topic;
    container.appendChild(h1);

    group.items.forEach(item => {
      const dd = document.createElement('div');
      dd.className = 'dropdown';
      dd.id = item.id;  // usa el id definido en articlesData.js

      const btn = document.createElement('button');
      btn.className = 'dropbtn';
      btn.innerHTML = formatText(item.title);

      const cont = document.createElement('div');
      cont.className = 'dropdown-content';
      const txt = item.detail.trim();
      cont.innerHTML = /<\/?[a-z][\s\S]*>/i.test(txt)
        ? txt
        : formatText(txt);

      initTabs(cont);

      // click para toggle dropdown + invertir colores
      btn.addEventListener('click', () => {
        const isOpen = cont.classList.toggle('show');
        if (isOpen) {
          btn.style.background = 'var(--button-text)';
          btn.style.color = 'var(--button)';
        } else {
          btn.style.background = '';
          btn.style.color = '';
        }
      });

      dd.append(btn, cont);
      container.appendChild(dd);
    });

    container.appendChild(document.createElement('br'));
  });

  // 3) Owners & Experts
  const roles = document.getElementById('rolesContainer');
  roles.innerHTML = '';
  const makeBox = (label, list) => {
    const box = document.createElement('div');
    box.className = 'role-box';
    const h4 = document.createElement('h4');
    h4.textContent = label + list.map(x => x.name).join(', ');
    const profs = document.createElement('div');
    profs.className = 'profiles';
    list.forEach(x => {
      const img = document.createElement('img');
      img.src = x.img;
      img.alt = x.name;
      profs.appendChild(img);
    });
    box.append(h4, profs);
    roles.appendChild(box);
  };
  makeBox('Article owners: ', art.owners);
  makeBox('Subject experts: ', art.experts);

  // tras renderizar, abre y hace scroll si hay hash
  openDropdownFromHash();
}

/**
 * Abre y despliega un dropdown específico según el hash de la URL
 */
function openDropdownFromHash() {
  const hash = window.location.hash;
  if (!hash) return;

  const targetDropdown = document.getElementById(hash.slice(1));
  if (!targetDropdown) return;

  const content = targetDropdown.querySelector('.dropdown-content');
  const button = targetDropdown.querySelector('.dropbtn');

  if (content && button && !content.classList.contains('show')) {
    content.classList.add('show');
    button.style.background = 'var(--button-text)';
    button.style.color = 'var(--button)';

    // scroll suave
    setTimeout(() => {
      targetDropdown.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }
}

/**
 * Inicializa la página de artículo y engancha listeners
 */
function initArticle() {
  initSearchComponent();
  renderArticle();

  // listener para hashchange (cuando el hash cambia)
  window.addEventListener('hashchange', () => {
    setTimeout(openDropdownFromHash, 50);
  });

  // listener para clicks en links con hash,
  // incluso si el hash NO cambia
  document.body.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link || !link.hash) return;
    // si el hash apunta a un dropdown existente
    if (document.getElementById(link.hash.slice(1))) {
      // dejamos que el navegador actualice el scroll,
      // luego abrimos el dropdown
      setTimeout(openDropdownFromHash, 50);
    }
  });
}

// Arranca todo al cargar el DOM
window.addEventListener('DOMContentLoaded', initArticle);

// src/extractors/forusall-plan/utils.js
function tidy(s) {
  return String(s == null ? '' : s)
    .replace(/\u00A0|\u2007|\u202F/g, ' ') // NBSP & co
    .replace(/\s+/g, ' ')
    .trim();
}

function isHidden(el) {
  if (!el) return true;
  const cs = window.getComputedStyle(el);
  if (!cs) return false;
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return true;
  if (el.offsetParent === null && cs.position !== 'fixed') return true;
  return false;
}

/**
 * Extrae pares label→valor de filas .row.field.form-group dentro de `root`.
 * También incluye campos hidden que NO están en .row.field.form-group
 */
function extractPairsUnder(root) {
  const out = {};
  const rows = root.querySelectorAll('.row.field.form-group');

  for (const row of rows) {
    if (isHidden(row)) continue;

    const labelEl = row.querySelector('label');
    const labelText = tidy(labelEl ? labelEl.textContent : '');
    if (!labelText) continue;

    let val = '';

    const control = row.querySelector('input, select, textarea');
    if (control) {
      const tag = (control.tagName || '').toLowerCase();
      const type = (control.getAttribute('type') || '').toLowerCase();

      if (tag === 'select') {
        const idx = control.selectedIndex;
        const opt = control.options && control.options[idx];
        val = tidy(opt ? opt.textContent : control.value);
      } else if (type === 'checkbox' || type === 'radio') {
        val = control.checked ? 'true' : 'false';
      } else {
        val = tidy(control.value);
      }
    }

    if (!val) {
      const valCol = row.querySelector('.left-align') || row.querySelector('.col-md-8, .col-md-4');
      if (valCol) {
        val = tidy(valCol.innerText || valCol.textContent || '');
      }
    }

    if (!val) {
      const clone = row.cloneNode(true);
      const lbl = clone.querySelector('label'); if (lbl && lbl.parentNode) lbl.parentNode.removeChild(lbl);
      clone.querySelectorAll('a, button').forEach(el => el.remove());
      val = tidy(clone.textContent || '');
    }

    const normLabel = labelText.replace(/\s*:\s*$/, '').replace(/\s+/g, ' ').trim();
    out[normLabel] = val;
  }

  return out;
}

/**
 * Extrae valor de un campo por ID (para campos hidden o específicos)
 */
function getValueById(id) {
  const el = document.querySelector(`#${id}`);
  if (!el) return '';
  
  const tag = (el.tagName || '').toLowerCase();
  const type = (el.getAttribute('type') || '').toLowerCase();

  if (tag === 'select') {
    const idx = el.selectedIndex;
    const opt = el.options && el.options[idx];
    return tidy(opt ? opt.textContent : el.value);
  } else if (type === 'checkbox' || type === 'radio') {
    return el.checked ? 'true' : 'false';
  } else {
    return tidy(el.value);
  }
}

module.exports = { tidy, extractPairsUnder, isHidden, getValueById };


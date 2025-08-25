// src/extractors/forusall-participant/modules/census.js

// Catálogo de campos soportados (nombres EXACTOS tal como salen del DOM)
const SUPPORTED_FIELDS = [
  "Partial SSN",
  "First Name",
  "Last Name",
  "Eligibility Status",
  "Crypto Enrollment",
  "Birth Date",
  "Hire Date",
  "Rehire Date",
  "Termination Date",
  "Projected Plan Entry Date",
  "Address 1",
  "Address 2",
  "City",
  "State",
  "Zip Code",
  "Primary Email",
  "Home Email",
  "Phone"
];

/**
 * Extrae pares del módulo Census. Permite filtrar por 'fields'.
 * @param {import('playwright').Page} page
 * @param {{ scope?: string|null, fields?: string[]|null }} opts
 * @returns {Promise<{data:Object, warnings:string[], unknownFields:string[]}>}
 */
async function extractCensus(page, opts = {}) {
  const scope = opts.scope || null;
  const fields = Array.isArray(opts.fields) && opts.fields.length ? opts.fields : null;

  const result = await page.evaluate(({ scopeSel }) => {
    function tidy(s) {
      return String(s == null ? '' : s)
        .replace(/\u00A0|\u2007|\u202F/g, ' ')
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
            let t = tidy(valCol.innerText || valCol.textContent || '');
            t = t.replace(/\(\s*age\s*\d+\s*\)\s*$/i, '').trim(); // remueve "(age 49)"
            t = t.replace(/\b(reveal|hide)\b/ig, '').trim();       // remueve links reveal/hide
            val = t;
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

    const root =
      (scopeSel && document.querySelector(scopeSel)) ||
      document.querySelector('#census-details') ||
      document.querySelector('#census') ||
      document;

    return { pairs: extractPairsUnder(root) };
  }, { scopeSel: scope });

  let data = result.pairs || {};
  const warnings = [];

  // Aplica filtro si se pidieron fields
  let unknownFields = [];
  if (fields) {
    const filtered = {};
    for (const k of fields) {
      if (Object.prototype.hasOwnProperty.call(data, k)) {
        filtered[k] = data[k];
      } else {
        unknownFields.push(k);
      }
    }
    data = filtered;
  }

  return { data, warnings, unknownFields };
}

module.exports = Object.assign(extractCensus, { SUPPORTED_FIELDS });

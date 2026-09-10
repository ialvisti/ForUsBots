// src/extractors/forusall-participant/modules/savings_rate.js

const { money, balance } = require("../valueContracts");

// Campos soportados (nombres EXACTOS como se mostrarán en el JSON)
const SUPPORTED_FIELDS = [
  "Current Pre-tax Percent",
  "Current Pre-tax Amount",
  "Current Roth Percent",
  "Current Roth Amount",
  "Record Keeper Site",
  "Employer Match Type",
  "Record Keeper",
  "Plan enrollment type",
  "Account Balance",
  "Account Balance As Of",
  "Employee Deferral Balance",
  "Roth Deferral Balance",
  "Rollover Balance",
  "Employer Match Balance",
  "Employer Match Vested Balance",
  "Loan Balance",
  "YTD Employee contributions",
  "YTD Employer contributions",
  "Maxed out",
  "Auto escalation rate",
  "Auto escalation rate limit",
  "Auto escalation timing"
];

/**
 * Extrae pares del módulo Savings Rate (ignorando el historial).
 * Soporta filtrado por 'fields'. Lee aunque el tab esté oculto.
 *
 * @param {import('playwright').Page} page
 * @param {{ scope?: string|null, fields?: string[]|null }} opts
 * @returns {Promise<{data:Object, warnings:string[], unknownFields:string[]}>}
 */
async function extractSavingsRate(page, opts = {}) {
  const scope = opts.scope || null;
  const fields = Array.isArray(opts.fields) && opts.fields.length ? opts.fields : null;

  const result = await page.evaluate(({ scopeSel }) => {
    function tidy(s) {
      return String(s == null ? '' : s)
        .replace(/\u00A0|\u2007|\u202F/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    function getImmediateCols(row) {
      // columnas directas típicas en estos paneles
      return Array.from(row.children).filter(c => {
        const cl = c && c.classList;
        return !!cl && (cl.contains('col-md-4') || cl.contains('col-md-8'));
      });
    }
    function textOf(el) {
      if (!el) return '';
      const a = el.querySelector('a');
      if (a && tidy(a.textContent)) return tidy(a.textContent);
      return tidy(el.innerText || el.textContent || '');
    }
    function looksLikeISODate(s) {
      return /^\d{4}-\d{2}-\d{2}$/.test(tidy(s || ''));
    }
    function isHistoryRow(row) {
      // Filas de historial tienen clases even/odd y/o primera columna con fecha ISO
      const cls = row.classList || {};
      if (cls.contains('even') || cls.contains('odd')) return true;
      const cols = getImmediateCols(row);
      const firstCol = cols[0];
      if (!firstCol) return false;
      const hasLabel = !!firstCol.querySelector('label');
      if (hasLabel) return false;
      const firstText = tidy(firstCol.innerText || firstCol.textContent || '');
      return looksLikeISODate(firstText);
    }

    const root =
      (scopeSel && document.querySelector(scopeSel)) ||
      document.querySelector('#savings-rate-details') ||
      document.querySelector('#savings-rate') ||
      document;

    const data = {};
    const processedRows = new Set();
    let inHistory = false;

    // --- Bloque de 3 columnas (label + percent + amount) ---
    const allRows = root.querySelectorAll('.row.field.form-group');
    for (const row of allRows) {
      // Nunca procesar filas del historial
      if (isHistoryRow(row)) continue;

      const cols = getImmediateCols(row);
      if (cols.length >= 3) {
        const firstCol = cols[0];
        // El label puede estar en <label> o como texto plano en la col
        const labelEl = firstCol ? firstCol.querySelector('label') : null;
        const rawLabel = labelEl ? tidy(labelEl.textContent) : tidy(firstCol && (firstCol.innerText || firstCol.textContent));
        const labelText = rawLabel.replace(/\s*:\s*$/, '');

        if (/^Current\s+Pre-?tax$/i.test(labelText) || /^Current\s+Roth$/i.test(labelText)) {
          const percentText = tidy(cols[1] ? (cols[1].innerText || cols[1].textContent) : '');
          const amountText  = tidy(cols[2] ? (cols[2].innerText || cols[2].textContent) : '');
          data[`${labelText} Percent`] = percentText;
          data[`${labelText} Amount`]  = amountText;
          processedRows.add(row);
        }
      }
    }

    // --- Pares simples: label (col-md-4) → valor (col-md-8.left-align o primera col sin label) ---
    for (const row of allRows) {
      // Salta todo lo que sea historial, y cualquier cosa luego del encabezado de historial
      if (isHistoryRow(row)) continue;

      const cols = getImmediateCols(row);
      const firstCol = cols.find(c => c.classList.contains('col-md-4')) || cols[0];
      const labelEl = firstCol ? firstCol.querySelector('label') : null;
      const rawLabel = labelEl ? tidy(labelEl.textContent) : tidy(firstCol && (firstCol.innerText || firstCol.textContent));
      const labelText = (rawLabel || '').replace(/\s*:\s*$/, '');

      // Si encontramos el encabezado "Savings Rate History", marcamos bandera y saltamos
      if (/^Savings\s+Rate\s+History$/i.test(labelText)) { inHistory = true; continue; }
      if (inHistory) continue;                 // ignora todo lo que venga después

      if (processedRows.has(row)) continue;
      if (!labelText) continue;

      // Evitar encabezados de la mini “tabla” Percent/Amount
      if (/^(percent|amount)$/i.test(labelText)) continue;

      let val = '';
      const left = row.querySelector('.left-align');
      if (left) {
        val = textOf(left);
      } else {
        const valCol = cols.find(el => !el.querySelector('label') && (el !== firstCol));
        if (valCol) val = tidy(valCol.innerText || valCol.textContent || '');
      }
      if (!val) continue;

      data[labelText] = val;
    }

    // Nota: se IGNORA “Savings Rate History” a propósito.
    return { data };
  }, { scopeSel: scope });

  // ---------- Post-procesamiento de valores extraídos ----------
  let data = result.data || {};
  const warnings = [];

  const diagnostics = { dataState: "ok", fields: {}, completeness: {
    complete: true, truncated: false, observedCount: Object.keys(data).length, returnedCount: 0,
  } };
  if (Object.prototype.hasOwnProperty.call(data, "Account Balance")) {
    const parsed = balance(data["Account Balance"]);
    data["Account Balance"] = parsed.amount;
    data["Account Balance As Of"] = parsed.asOf;
    diagnostics.fields["Account Balance"] = { dataState: parsed.dataState, sourceAsOf: parsed.asOf };
  }
  if (typeof data["Employer Match Balance"] === "string") {
    const raw = data["Employer Match Balance"];
    const vested = raw.match(/\(\s*(\$\s*[\d,]+(?:\.\d{1,2})?)\s*vested\s*\)/i);
    data["Employer Match Balance"] = money(raw.replace(/\s*\([^)]*\)\s*$/, ""));
    data["Employer Match Vested Balance"] = vested ? money(vested[1]) : null;
  }
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string" && value.includes("$")) data[key] = money(value);
    if (/Balance$/.test(key)) {
      diagnostics.fields[key] ||= { dataState: data[key] === null ? "missing" : "ok", sourceAsOf: null };
      if (data[key] === null) diagnostics.completeness.complete = false;
    }
  }
  if (Object.values(diagnostics.fields).some(field => field.dataState !== "ok")) {
    diagnostics.completeness.complete = false;
    diagnostics.completeness.reason = "balance_value_unavailable";
  }

  // Filtrado por campos solicitados (si 'fields' viene en la request)
  let unknownFields = [];
  if (fields) {
    const filtered = {};
    for (const f of fields) {
      if (Object.prototype.hasOwnProperty.call(data, f)) {
        filtered[f] = data[f];
      } else {
        unknownFields.push(f);
      }
    }
    data = filtered;
  }

  diagnostics.completeness.returnedCount = Object.keys(data).length;
  return { data, warnings, unknownFields, diagnostics };
}

module.exports = Object.assign(extractSavingsRate, { SUPPORTED_FIELDS });

// src/extractors/forusall-participant/modules/plan_details.js

// Campos soportados (nombres EXACTOS como se mostrarán en el JSON)
const SUPPORTED_FIELDS = [
  "Plan Documents",
  "Plan Type",
  "Status",
  "Participant Site",
  "Plan enrollment type",
  "Auto Enrollment Rate",
  "Minimum Age",
  "Service Months",
  "Service hours",
  "Plan Entry Frequency",
  "Profit Sharing",
  "Force-out Limit",
  "Maximum Number of Loans",
];

/**
 * Extrae pares del módulo Plan Details.
 * - "Plan Documents": toma el href del link (tal cual aparece en el DOM; si es relativo lo devuelve relativo).
 * - Pairs estándar label (col-md-4) → valor (col-md-8.left-align).
 * - SOLO convierte a número los valores con símbolo $ (aquí: Force-out Limit).
 *
 * @param {import('playwright').Page} page
 * @param {{ scope?: string|null, fields?: string[]|null }} opts
 * @returns {Promise<{data:Object, warnings:string[], unknownFields:string[]}>}
 */
async function extractPlanDetails(page, opts = {}) {
  const scope = opts.scope || null;
  const fields = Array.isArray(opts.fields) && opts.fields.length ? opts.fields : null;

  const result = await page.evaluate(({ scopeSel }) => {
    function tidy(s) {
      return String(s == null ? "" : s)
        .replace(/\u00A0|\u2007|\u202F/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    function getImmediateCols(row) {
      return Array.from(row.children).filter((c) => {
        const cl = c && c.classList;
        return !!cl && (cl.contains("col-md-4") || cl.contains("col-md-8") || cl.contains("col-md-12"));
      });
    }
    function textOf(el) {
      if (!el) return "";
      const a = el.querySelector("a");
      if (a && tidy(a.textContent)) return tidy(a.textContent);
      return tidy(el.innerText || el.textContent || "");
    }

    const root =
      (scopeSel && document.querySelector(scopeSel)) ||
      document.querySelector("#plan-details") ||
      document.querySelector("#plan") ||
      document;

    const data = {};

    // ---- Plan Documents (href del link) ----
    try {
      const a = Array
        .from(root.querySelectorAll("a[href]"))
        .find(el => /plan\s*documents/i.test(tidy(el.textContent || "")));
      if (a) {
        data["Plan Documents"] = tidy(a.getAttribute("href") || "");
      }
    } catch {}

    // ---- Pairs estándar ----
    const rows = root.querySelectorAll(".row.field.form-group");
    for (const row of rows) {
      const cols = getImmediateCols(row);
      if (!cols.length) continue;

      const firstCol = cols.find(c => c.classList.contains("col-md-4")) || cols[0];
      const labelEl = firstCol ? firstCol.querySelector("label") : null;
      const rawLabel = labelEl ? tidy(labelEl.textContent) : tidy(firstCol && (firstCol.innerText || firstCol.textContent));
      const label = (rawLabel || "").replace(/\s*:\s*$/, "");
      if (!label) continue;

      // Filtro de títulos/separadores: suelen ser col-md-12 sin valor asociado
      if (/^Requirements for Employee Contributions$/i.test(label)) continue;

      // Valor (preferimos .left-align)
      let val = "";
      const left = row.querySelector(".left-align");
      if (left) {
        const a = left.querySelector("a");
        val = a ? tidy(a.textContent) : tidy(left.innerText || left.textContent || "");
      } else {
        const valCol = cols.find(el => !el.querySelector("label") && el !== firstCol);
        if (valCol) val = tidy(valCol.innerText || valCol.textContent || "");
      }
      if (!val) continue;

      data[label] = val;
    }

    return { data };
  }, { scopeSel: scope });

  // ---------- Post-procesamiento ----------
  let data = result.data || {};
  const warnings = [];

  // SOLO valores con $ → numérico (en este módulo: Force-out Limit)
  if (typeof data["Force-out Limit"] === "string" && /\$/.test(data["Force-out Limit"])) {
    const n = Number(data["Force-out Limit"].replace(/[^0-9.-]/g, ""));
    if (!Number.isNaN(n)) data["Force-out Limit"] = n;
  }

  // Filtrado por fields (si se pidió)
  let unknownFields = [];
  if (fields) {
    const filtered = {};
    for (const f of fields) {
      if (Object.prototype.hasOwnProperty.call(data, f)) filtered[f] = data[f];
      else unknownFields.push(f);
    }
    data = filtered;
  }

  return { data, warnings, unknownFields };
}

module.exports = Object.assign(extractPlanDetails, { SUPPORTED_FIELDS });

// src/extractors/forusall-participant/modules/census.js
const { REVEAL_FULL_SSN, SSN_REVEAL_WAIT_MS } = require("../../../config");

// Catálogo de campos soportados (nombres EXACTOS tal como salen del DOM)
const BASE_SUPPORTED_FIELDS = [
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
  "Phone",
];

// Si la flag está ON, permitimos pedir "SSN" explícitamente
const SUPPORTED_FIELDS = REVEAL_FULL_SSN
  ? [...BASE_SUPPORTED_FIELDS, "SSN"]
  : [...BASE_SUPPORTED_FIELDS];

/**
 * Extrae pares del módulo Census. Permite filtrar por 'fields'.
 * Solo si REVEAL_FULL_SSN=ON **y** fields incluye "SSN", se hace click en #reveal.
 * @param {import('playwright').Page} page
 * @param {{ scope?: string|null, fields?: string[]|null }} opts
 * @returns {Promise<{data:Object, warnings:string[], unknownFields:string[]}>}
 */
async function extractCensus(page, opts = {}) {
  const scope = opts.scope || null;
  const fields =
    Array.isArray(opts.fields) && opts.fields.length ? opts.fields : null;

  // ¿Debemos revelar el SSN completo?
  const wantsFullSsn = !!(REVEAL_FULL_SSN && fields && fields.includes("SSN"));
  // ¿También solicitaron el parcial?
  const wantsPartial = !!(fields && fields.includes("Partial SSN"));

  // Si vamos a revelar, y también pidieron el parcial, guardamos el valor parcial ANTES del reveal
  let partialSsnBeforeReveal = null;
  if (wantsFullSsn && wantsPartial) {
    try {
      partialSsnBeforeReveal = await page.evaluate(
        ({ scopeSel }) => {
          function tidy(s) {
            return String(s == null ? "" : s)
              .replace(/\u00A0|\u2007|\u202F/g, " ")
              .replace(/\s+/g, " ")
              .trim();
          }
          const root =
            (scopeSel && document.querySelector(scopeSel)) ||
            document.querySelector("#census-details") ||
            document.querySelector("#census") ||
            document;

          const row = root.querySelector("#partial_ssn_row");
          if (!row) return null;
          const valCol =
            row.querySelector(".left-align") ||
            row.querySelector(".col-md-8, .col-md-4");
          if (!valCol) return null;

          // Limpia "reveal"
          let t = tidy(valCol.innerText || valCol.textContent || "");
          t = t.replace(/\b(reveal|hide)\b/gi, "").trim();
          return t || null;
        },
        { scopeSel: scope }
      );
    } catch (_) {}
  }

  // Hacemos click en #reveal SOLO si lo han pedido explícitamente y la flag está ON
  if (wantsFullSsn) {
    const root = scope ? page.locator(scope) : page;
    const reveal = root.locator("#reveal").first();
    try {
      if (await reveal.count()) {
        await reveal.click({ timeout: 1000 }).catch(() => {});
        // Espera a que #ssn_row esté visible (y #partial_ssn_row se oculte)
        await page
          .waitForSelector("#ssn_row", {
            state: "visible",
            timeout: SSN_REVEAL_WAIT_MS,
          })
          .catch(() => {});
      }
    } catch (_) {}
  }

  const result = await page.evaluate(
    ({ scopeSel }) => {
      function tidy(s) {
        return String(s == null ? "" : s)
          .replace(/\u00A0|\u2007|\u202F/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
      function isHidden(el) {
        if (!el) return true;
        const cs = window.getComputedStyle(el);
        if (!cs) return false;
        if (
          cs.display === "none" ||
          cs.visibility === "hidden" ||
          cs.opacity === "0"
        )
          return true;
        if (el.offsetParent === null && cs.position !== "fixed") return true;
        return false;
      }
      function extractPairsUnder(root) {
        const out = {};
        const rows = root.querySelectorAll(".row.field.form-group");
        for (const row of rows) {
          if (isHidden(row)) continue;

          const labelEl = row.querySelector("label");
          const labelText = tidy(labelEl ? labelEl.textContent : "");
          if (!labelText) continue;

          let val = "";
          const control = row.querySelector("input, select, textarea");
          if (control) {
            const tag = (control.tagName || "").toLowerCase();
            const type = (control.getAttribute("type") || "").toLowerCase();
            if (tag === "select") {
              const idx = control.selectedIndex;
              const opt = control.options && control.options[idx];
              val = tidy(opt ? opt.textContent : control.value);
            } else if (type === "checkbox" || type === "radio") {
              val = control.checked ? "true" : "false";
            } else {
              val = tidy(control.value);
            }
          }
          if (!val) {
            const valCol =
              row.querySelector(".left-align") ||
              row.querySelector(".col-md-8, .col-md-4");
            if (valCol) {
              let t = tidy(valCol.innerText || valCol.textContent || "");
              t = t.replace(/\(\s*age\s*\d+\s*\)\s*$/i, "").trim(); // remueve "(age 49)"
              t = t.replace(/\b(reveal|hide)\b/gi, "").trim(); // remueve links reveal/hide
              val = t;
            }
          }
          if (!val) {
            const clone = row.cloneNode(true);
            const lbl = clone.querySelector("label");
            if (lbl && lbl.parentNode) lbl.parentNode.removeChild(lbl);
            clone.querySelectorAll("a, button").forEach((el) => el.remove());
            val = tidy(clone.textContent || "");
          }

          const normLabel = labelText
            .replace(/\s*:\s*$/, "")
            .replace(/\s+/g, " ")
            .trim();
          out[normLabel] = val;
        }
        return out;
      }

      const root =
        (scopeSel && document.querySelector(scopeSel)) ||
        document.querySelector("#census-details") ||
        document.querySelector("#census") ||
        document;

      // Extraemos los pares visibles actuales (si se hizo reveal, incluirá "SSN" y ocultará "Partial SSN")
      return { pairs: extractPairsUnder(root) };
    },
    { scopeSel: scope }
  );

  let data = result.pairs || {};
  const warnings = [];

  // Si capturamos el parcial antes del reveal y además lo solicitaron, lo sobreescribimos en la salida
  if (wantsFullSsn && wantsPartial && partialSsnBeforeReveal) {
    data["Partial SSN"] = partialSsnBeforeReveal;
  }

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

// src/extractors/forusall-participant/modules/mfa.js
/**
 * MFA (Multi-Factor Authentication) Status Extractor
 *
 * Extracts MFA status information from participant pages.
 * Target URL: https://employer.forusall.com/participants/<PARTICIPANT_ID>
 *
 * Extracted Data:
 * - MFA Status: enrolled/not_enrolled/etc.
 */

const SUPPORTED_FIELDS = ["MFA Status"];

/**
 * Extract MFA data from the participant page
 *
 * @param {import('playwright').Page} page - Playwright page object
 * @param {{ scope?: string|null, fields?: string[]|null }} opts - Extraction options
 * @returns {Promise<{data:Object, warnings:string[], unknownFields:string[]}>}
 */
async function extractMFA(page, opts = {}) {
  const scope = opts.scope || null;
  const fields =
    Array.isArray(opts.fields) && opts.fields.length ? opts.fields : null;

  const result = await page.evaluate(
    ({ scopeSel }) => {
      function tidy(s) {
        return String(s == null ? "" : s)
          .replace(/\u00A0|\u2007|\u202F/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
      function getImmediateCols(row) {
        return Array.from(row.children).filter((c) => {
          const cl = c && c.classList;
          return (
            !!cl &&
            (cl.contains("col-md-4") ||
              cl.contains("col-md-8") ||
              cl.contains("col-md-12"))
          );
        });
      }

      const root =
        (scopeSel && document.querySelector(scopeSel)) ||
        document.querySelector("#mfa-details") ||
        document.querySelector("#mfa") ||
        document;

      const data = {};

      // ---- Pairs estándar (igual que plan_details) ----
      const rows = root.querySelectorAll(".row.field.form-group");
      for (const row of rows) {
        const cols = getImmediateCols(row);
        if (!cols.length) continue;

        const firstCol =
          cols.find((c) => c.classList.contains("col-md-4")) || cols[0];
        const labelEl = firstCol ? firstCol.querySelector("label") : null;
        const rawLabel = labelEl
          ? tidy(labelEl.textContent)
          : tidy(firstCol && (firstCol.innerText || firstCol.textContent));
        const label = (rawLabel || "").replace(/\s*:\s*$/, "");
        if (!label) continue;

        // Valor (preferimos .left-align)
        let val = "";
        const left = row.querySelector(".left-align");
        if (left) {
          const a = left.querySelector("a");
          val = a
            ? tidy(a.textContent)
            : tidy(left.innerText || left.textContent || "");
        } else {
          const valCol = cols.find(
            (el) => !el.querySelector("label") && el !== firstCol
          );
          if (valCol) val = tidy(valCol.innerText || valCol.textContent || "");
        }
        if (!val) continue;

        data[label] = val;
      }

      return { data };
    },
    { scopeSel: scope }
  );

  // ---------- Post-procesamiento (igual que plan_details) ----------
  let data = result.data || {};
  const warnings = [];

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

module.exports = Object.assign(extractMFA, { SUPPORTED_FIELDS });

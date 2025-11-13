// src/extractors/forusall-plan/modules/feature_flags.js

const SUPPORTED_FIELDS = [
  "payroll_xray",
  "payroll_issue",
  "simple_upload",
];

/**
 * Extrae feature flags del plan
 * Este módulo extrae todos los checkboxes del panel de feature flags
 * @param {import('playwright').Page} page
 * @param {{ scope?: string|null, fields?: string[]|null }} opts
 * @returns {Promise<{data:Object, warnings:string[], unknownFields:string[]}>}
 */
async function extractFeatureFlags(page, opts = {}) {
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

      const root =
        document.querySelector("#feature-flags") || document;

      const data = {};

      // Extraer todos los checkboxes del panel
      const checkboxes = root.querySelectorAll('input[type="checkbox"]');
      for (const checkbox of checkboxes) {
        const id = checkbox.id;
        if (!id) continue;
        
        // Solo tomar checkboxes que no sean hidden (los hidden son los valores "false" por defecto)
        if (checkbox.type === "checkbox") {
          const label = root.querySelector(`label[for="${id}"]`);
          const labelText = label ? tidy(label.textContent) : id;
          data[id] = checkbox.checked ? "true" : "false";
        }
      }

      return { data };
    },
    { scopeSel: scope }
  );

  let data = result.data || {};
  const warnings = [];

  // Filtrado por fields (si se pidió)
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

  return { data, warnings, unknownFields };
}

module.exports = Object.assign(extractFeatureFlags, { SUPPORTED_FIELDS });


// src/extractors/forusall-plan/modules/onboarding.js

const SUPPORTED_FIELDS = [
  "first_deferral_date",
  "special_participation_date",
  "enrollment_method",
  "blackout_begins_date",
  "blackout_ends_date",
  "website_live_date",
];

/**
 * Extrae información de onboarding
 * @param {import('playwright').Page} page
 * @param {{ scope?: string|null, fields?: string[]|null }} opts
 * @returns {Promise<{data:Object, warnings:string[], unknownFields:string[]}>}
 */
async function extractOnboarding(page, opts = {}) {
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

      const data = {};

      // Helper para extraer valor de input/select - buscar desde document
      function getValue(id) {
        const el = document.querySelector(`#${id}`);
        if (!el) return "";
        const tag = (el.tagName || "").toLowerCase();
        const type = (el.getAttribute("type") || "").toLowerCase();

        if (tag === "select") {
          const idx = el.selectedIndex;
          const opt = el.options && el.options[idx];
          return tidy(opt ? opt.textContent : el.value);
        } else if (type === "checkbox" || type === "radio") {
          return el.checked ? "true" : "false";
        } else {
          return tidy(el.value);
        }
      }

      // Extraer campos de onboarding
      data.first_deferral_date = getValue("first_deferral_date");
      data.special_participation_date = getValue("special_participation_date");
      data.enrollment_method = getValue("enrollment_method");
      data.blackout_begins_date = getValue("blackout_begins_date");
      data.blackout_ends_date = getValue("blackout_ends_date");
      data.website_live_date = getValue("website_live_date");

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

module.exports = Object.assign(extractOnboarding, { SUPPORTED_FIELDS });


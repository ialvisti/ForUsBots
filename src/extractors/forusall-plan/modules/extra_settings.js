// src/extractors/forusall-plan/modules/extra_settings.js

const SUPPORTED_FIELDS = [
  "rk_upload_mode",
  "plan_year_start",
  "er_contribution_eligibility",
  "er_match_eligibility_age",
  "er_match_eligibility_duration_value",
  "er_match_eligibility_duration_unit",
  "er_match_eligibility_hours_requirement",
  "er_match_plan_entry_frequency",
  "er_match_plan_entry_frequency_first_month",
  "er_match_plan_entry_frequency_second_month",
];

/**
 * Extrae configuración adicional del plan
 * @param {import('playwright').Page} page
 * @param {{ scope?: string|null, fields?: string[]|null }} opts
 * @returns {Promise<{data:Object, warnings:string[], unknownFields:string[]}>}
 */
async function extractExtraSettings(page, opts = {}) {
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

      // Extraer campos de extra-settings
      data.rk_upload_mode = getValue("rk_upload_mode");
      data.plan_year_start = getValue("plan_year_start");
      data.er_contribution_eligibility = getValue("er_contribution_eligibility");
      data.er_match_eligibility_age = getValue("er_match_eligibility_age");
      data.er_match_eligibility_duration_value = getValue(
        "er_match_eligibility_duration_value"
      );
      data.er_match_eligibility_duration_unit = getValue(
        "er_match_eligibility_duration_unit"
      );
      data.er_match_eligibility_hours_requirement = getValue(
        "er_match_eligibility_hours_requirement"
      );
      data.er_match_plan_entry_frequency = getValue(
        "er_match_plan_entry_frequency"
      );
      data.er_match_plan_entry_frequency_first_month = getValue(
        "er_match_plan_entry_frequency_first_month"
      );
      data.er_match_plan_entry_frequency_second_month = getValue(
        "er_match_plan_entry_frequency_second_month"
      );

      return { data };
    },
    { scopeSel: scope }
  );

  let data = result.data || {};
  const warnings = [];

  // Conversión numérica donde corresponda
  const numericFields = [
    "er_match_eligibility_age",
    "er_match_eligibility_duration_value",
    "er_match_eligibility_hours_requirement",
  ];

  for (const field of numericFields) {
    if (data[field] && data[field] !== "") {
      const n = Number(data[field]);
      if (!Number.isNaN(n)) {
        data[field] = n;
      }
    }
  }

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

module.exports = Object.assign(extractExtraSettings, { SUPPORTED_FIELDS });


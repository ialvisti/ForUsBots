// src/extractors/forusall-plan/modules/plan_design.js

const SUPPORTED_FIELDS = [
  "record_keeper_id",
  "rk_plan_id",
  "external_name",
  "lt_plan_type",
  "accept_covid19_amendment",
  "fund_lineup_id",
  "enrollment_type",
  "eligibility_min_age",
  "eligibility_duration_value",
  "eligibility_duration_unit",
  "eligibility_hours_requirement",
  "plan_entry_frequency",
  "plan_entry_frequency_first_month",
  "plan_entry_frequency_second_month",
  "employer_contribution",
  "er_contribution_monthly_cap",
  "employer_contribution_cap",
  "employer_contribution_timing",
  "employer_contribution_options_qaca",
  "default_savings_rate",
  "contribution_type",
  "autoescalate_rate",
  "support_aftertax",
  "alts_crypto",
  "alts_waitlist_crypto",
  "max_crypto_percent_balance",
];

/**
 * Extrae configuración de diseño del plan
 * @param {import('playwright').Page} page
 * @param {{ scope?: string|null, fields?: string[]|null }} opts
 * @returns {Promise<{data:Object, warnings:string[], unknownFields:string[]}>}
 */
async function extractPlanDesign(page, opts = {}) {
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
        } else if (type === "checkbox") {
          return el.checked ? "true" : "false";
        } else if (type === "radio") {
          return el.checked ? "true" : "false";
        } else {
          return tidy(el.value);
        }
      }

      // Extraer todos los campos del módulo plan-design
      data.record_keeper_id = getValue("record_keeper_id");
      data.rk_plan_id = getValue("rk_plan_id");
      data.external_name = getValue("external_name");
      data.lt_plan_type = getValue("lt_plan_type");
      data.accept_covid19_amendment = getValue("accept_covid19_amendment");
      data.fund_lineup_id = getValue("fund_lineup_id");
      data.enrollment_type = getValue("enrollment_type");
      data.eligibility_min_age = getValue("eligibility_min_age");
      data.eligibility_duration_value = getValue("eligibility_duration_value");
      data.eligibility_duration_unit = getValue("eligibility_duration_unit");
      data.eligibility_hours_requirement = getValue(
        "eligibility_hours_requirement"
      );
      data.plan_entry_frequency = getValue("plan_entry_frequency");
      data.plan_entry_frequency_first_month = getValue(
        "plan_entry_frequency_first_month"
      );
      data.plan_entry_frequency_second_month = getValue(
        "plan_entry_frequency_second_month"
      );
      data.employer_contribution = getValue("employer_contribution");
      data.er_contribution_monthly_cap = getValue("er_contribution_monthly_cap");
      data.employer_contribution_cap = getValue("employer_contribution_cap");
      data.employer_contribution_timing = getValue("employer_contribution_timing");
      data.employer_contribution_options_qaca = getValue(
        "employer_contribution_options_qaca"
      );
      data.default_savings_rate = getValue("default_savings_rate");
      data.contribution_type = getValue("contribution_type");
      data.autoescalate_rate = getValue("autoescalate_rate");
      data.support_aftertax = getValue("support_aftertax");
      data.alts_crypto = getValue("alts_crypto");
      data.alts_waitlist_crypto = getValue("alts_waitlist_crypto");
      data.max_crypto_percent_balance = getValue("max_crypto_percent_balance");

      return { data };
    },
    { scopeSel: scope }
  );

  let data = result.data || {};
  const warnings = [];

  // Conversión numérica donde corresponda
  const numericFields = [
    "eligibility_min_age",
    "eligibility_duration_value",
    "eligibility_hours_requirement",
    "er_contribution_monthly_cap",
    "employer_contribution_cap",
    "default_savings_rate",
    "autoescalate_rate",
    "max_crypto_percent_balance",
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

module.exports = Object.assign(extractPlanDesign, { SUPPORTED_FIELDS });


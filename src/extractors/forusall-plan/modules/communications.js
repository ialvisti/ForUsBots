// src/extractors/forusall-plan/modules/communications.js

const SUPPORTED_FIELDS = [
  "dave_text",
  "logo",
  "spanish_participants",
  "e_statement",
  "raffle_prize",
  "raffle_date",
];

/**
 * Extrae preferencias de comunicación
 * @param {import('playwright').Page} page
 * @param {{ scope?: string|null, fields?: string[]|null }} opts
 * @returns {Promise<{data:Object, warnings:string[], unknownFields:string[]}>}
 */
async function extractCommunications(page, opts = {}) {
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

      // Extraer campos de communications
      data.dave_text = getValue("dave_text");
      data.logo = getValue("logo");
      data.spanish_participants = getValue("spanish_participants");
      data.e_statement = getValue("e_statement");
      data.raffle_prize = getValue("raffle_prize");
      data.raffle_date = getValue("raffle_date");

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

module.exports = Object.assign(extractCommunications, { SUPPORTED_FIELDS });


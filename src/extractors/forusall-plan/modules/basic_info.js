// src/extractors/forusall-plan/modules/basic_info.js

const SUPPORTED_FIELDS = [
  "plan_id",
  "version_id",
  "Short Name",
  "Sfdc id",
  "Company Name",
  "Legal Plan Name",
  "Relationship Manager",
  "Implementation Manager",
  "Service Type",
  "Plan Type",
  "Active",
  "Status",
  "Status as of",
  "3(16) ONLY",
  "EIN",
  "Effective Date",
];

// Mapa de campos API a labels del DOM
const FIELD_MAP = {
  "plan_id": "plan_id",
  "version_id": "version_id",
  "symlink": "Short Name",
  "sfdc_id": "Sfdc id",
  "company_name": "Company Name",
  "official_plan_name": "Legal Plan Name",
  "rm_id": "Relationship Manager",
  "im_id": "Implementation Manager",
  "service_type": "Service Type",
  "plan_type": "Plan Type",
  "active": "Active",
  "status": "Status",
  "status_as_of": "Status as of",
  "is_3_16_only": "3(16) ONLY",
  "ein": "EIN",
  "effective_date": "Effective Date",
};

/**
 * Extrae información básica del plan (top-level fields antes de los tabs)
 * @param {import('playwright').Page} page
 * @param {{ scope?: string|null, fields?: string[]|null }} opts
 * @returns {Promise<{data:Object, warnings:string[], unknownFields:string[]}>}
 */
async function extractBasicInfo(page, opts = {}) {
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

      function isHidden(el) {
        if (!el) return true;
        const cs = window.getComputedStyle(el);
        if (!cs) return false;
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return true;
        if (el.offsetParent === null && cs.position !== 'fixed') return true;
        return false;
      }

      function extractPairs(root) {
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
              val = tidy(valCol.innerText || valCol.textContent || '');
            }
          }

          const normLabel = labelText.replace(/\s*:\s*$/, '').replace(/\s+/g, ' ').trim();
          out[normLabel] = val;
        }

        return out;
      }

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

      const root = document.querySelector("#bitemporal-plan-attrs") || document;
      
      // Extraer pares label-valor
      const pairs = extractPairs(root);
      
      // Extraer campos hidden por ID
      const data = {};
      data.plan_id = getValue("plan_id");
      data.version_id = getValue("version_id");
      data.symlink = pairs["Short Name"] || "";
      data.sfdc_id = getValue("sfdc_id");
      data.company_name = pairs["Company Name"] || "";
      data.official_plan_name = pairs["Legal Plan Name"] || "";
      data.rm_id = pairs["Relationship Manager"] || "";
      data.im_id = pairs["Implementation Manager"] || "";
      data.service_type = pairs["Service Type"] || "";
      data.plan_type = pairs["Plan Type"] || "";
      data.active = pairs["Active"] || "";
      data.status = pairs["Status"] || "";
      data.status_as_of = pairs["Status as of"] || getValue("status_as_of");
      data.is_3_16_only = pairs["3(16) ONLY"] || "";
      data.ein = pairs["EIN"] || "";
      data.effective_date = pairs["Effective Date"] || "";

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

module.exports = Object.assign(extractBasicInfo, { SUPPORTED_FIELDS });


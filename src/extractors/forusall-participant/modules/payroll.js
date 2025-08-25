// src/extractors/forusall-participant/modules/payroll.js

// ⚠️ Convención de filtrado de años:
// - Puedes pedir años vía fields con un token especial:
//     ["years:2025"]  → sólo 2025
//     ["years:2024,2025"]  → 2024 y 2025
//     ["years:all"]   → todos los disponibles
// - Si NO se especifica, se devuelve únicamente el año más reciente
//   (el primer .payroll-year-group del DOM).

// Campos soportados "estáticos" (los de cada año son dinámicos: "Payroll 2025", etc.)
const SUPPORTED_FIELDS = [
  "Payroll Frequency",
  "Next Schedule paycheck",
  "Available Years",
];

async function extractPayroll(page, opts = {}) {
  const scope = opts.scope || null;
  const fieldsIn = Array.isArray(opts.fields) && opts.fields.length ? opts.fields : null;

  // ---- Parseo de tokens de años en Node (fuera del evaluate) ----
  let yearsRequest = null; // null => por defecto (más reciente)
  let fieldsFilter = null;

  if (fieldsIn) {
    const yearTokens = fieldsIn.filter(f => /^years:/i.test(String(f)));
    if (yearTokens.length) {
      const tok = yearTokens[0].toLowerCase();
      if (tok === 'years:all') {
        yearsRequest = 'all';
      } else {
        // years:2024,2025
        const m = tok.match(/^years:([\d,\s]+)$/);
        if (m) {
          yearsRequest = m[1].split(',').map(s => s.trim()).filter(Boolean);
        }
      }
    }
    // el filtro real de campos excluye los tokens years:
    fieldsFilter = fieldsIn.filter(f => !/^years:/i.test(String(f)));
    if (!fieldsFilter.length) fieldsFilter = null;
  }

  const result = await page.evaluate(({ scopeSel, yearsRequest }) => {
    function tidy(s) {
      return String(s == null ? "" : s)
        .replace(/\u00A0|\u2007|\u202F/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    function textOf(el) {
      if (!el) return "";
      const a = el.querySelector("a");
      if (a && tidy(a.textContent)) return tidy(a.textContent);
      return tidy(el.innerText || el.textContent || "");
    }
    function moneyToNumber(s) {
      const t = tidy(s).replace(/\$/g, "").replace(/,/g, "");
      if (t === "" || t === "-") return 0;
      const n = Number(t);
      return Number.isFinite(n) ? n : 0;
    }
    function num(s) {
      const t = tidy(s).replace(/,/g, "");
      if (t === "" || t === "-") return 0;
      const n = Number(t);
      return Number.isFinite(n) ? n : 0;
    }
    function getImmediateCols(row) {
      return Array.from(row.children).filter((c) => {
        const cn = (c && c.className) || "";
        return /\bcol-md-\d+\b/.test(cn);
      });
    }

    const root =
      (scopeSel && document.querySelector(scopeSel)) ||
      document.querySelector("#payroll-details") ||
      document.querySelector("#payroll") ||
      document;

    const data = {};

    // -------- 1) Pares simples superiores (bloque 1) --------
    // Labels: Payroll Frequency, Next Schedule paycheck
    const topBlock = root.querySelector(".row.field.form-group.form-bound");
    if (topBlock) {
      const rows = topBlock.querySelectorAll(".row.field.form-group");
      for (const row of rows) {
        const cols = getImmediateCols(row);
        const first = cols[0];
        if (!first) continue;

        const lblEl = first.querySelector("label");
        const label = lblEl ? tidy(lblEl.textContent) : tidy(first.innerText || first.textContent);
        if (!label) continue;

        // valor: preferimos .left-align o la primera col que no tenga label
        let val = "";
        const left = row.querySelector(".left-align");
        if (left) {
          val = textOf(left);
        } else {
          const valCol = cols.find((el) => !el.querySelector("label"));
          if (valCol && valCol !== first) val = tidy(valCol.innerText || valCol.textContent || "");
        }
        if (!val) continue;

        if (/^Payroll\s+Frequency$/i.test(label)) {
          data["Payroll Frequency"] = val;
        } else if (/^Next\s+Schedule\s+paycheck$/i.test(label)) {
          data["Next Schedule paycheck"] = val; // YYYY-MM-DD
        }
      }
    }

    // -------- 2) Años disponibles --------
    const availableYears = [];
    const yearSelect = root.querySelector("#payroll_year");
    if (yearSelect) {
      yearSelect.querySelectorAll("option").forEach((opt) => {
        const v = tidy(opt.value);
        if (/^\d{4}$/.test(v)) availableYears.push(v);
      });
    }
    if (!availableYears.length) {
      // fallback: desde los IDs de los contenedores
      const groups = root.querySelectorAll(".payroll-year-group[id$='-payroll-values']");
      groups.forEach((g) => {
        const id = String(g.id || "");
        const m = id.match(/(\d{4})-payroll-values$/);
        if (m) availableYears.push(m[1]);
      });
    }
    if (availableYears.length) data["Available Years"] = availableYears.slice();

    // -------- 3) Determinar años a procesar --------
    let yearsToProcess = [];
    const allGroups = Array.from(root.querySelectorAll(".payroll-year-group[id$='-payroll-values']"));

    if (yearsRequest === "all") {
      yearsToProcess = availableYears.length ? availableYears : allGroups.map(g => (g.id.match(/(\d{4})/) || [null, null])[1]).filter(Boolean);
    } else if (Array.isArray(yearsRequest) && yearsRequest.length) {
      // Intersección con los disponibles
      const setAvail = new Set(availableYears.length ? availableYears : allGroups.map(g => (g.id.match(/(\d{4})/) || [null, null])[1]).filter(Boolean));
      yearsToProcess = yearsRequest.filter(y => setAvail.has(y));
    } else {
      // Por defecto: el primer grupo visible en DOM (más reciente)
      const first = allGroups[0];
      if (first) {
        const m = first.id.match(/(\d{4})/);
        if (m) yearsToProcess = [m[1]];
      }
    }

    // -------- 4) Parseo de cada año --------
    function parseYearGroup(year) {
      const group = root.querySelector(`[id="${year}-payroll-values"]`);
      if (!group) return null;

      const rows = Array.from(group.querySelectorAll(":scope > .row.field.form-group"));
      if (!rows.length) return { Total: null, Rows: [] };

      // Totales: normalmente es la PRIMERA fila tras un <hr>
      let totalsRow = null;
      for (const r of rows) {
        const cols = getImmediateCols(r);
        // primera columna en cursiva con "Total <year>" suele identificarla
        const firstTxt = tidy(cols[0] ? (cols[0].innerText || cols[0].textContent) : "");
        if (/^Total\b/i.test(firstTxt)) { totalsRow = r; break; }
      }

      const yearData = { Total: null, Rows: [] };

      if (totalsRow) {
        const c = getImmediateCols(totalsRow);
        // columnas por orden visual
        yearData.Total = {
          "Pre-tax":          moneyToNumber(c[1] ? c[1].innerText : ""),
          "Roth":             moneyToNumber(c[2] ? c[2].innerText : ""),
          "Employer Match":   moneyToNumber(c[3] ? c[3].innerText : ""),
          "Loan":             moneyToNumber(c[4] ? c[4].innerText : ""),
          "Plan comp":        moneyToNumber(c[5] ? c[5].innerText : ""),
          "Hours":            num(c[6] ? c[6].innerText : ""),
        };
      }

      // Filas detalle: todas las filas posteriores con 7 columnas (2,1,1,2,2,2,1)
      for (const r of rows) {
        if (r === totalsRow) continue;
        const c = getImmediateCols(r);
        if (c.length < 7) continue;

        const payDateLink = c[0] ? c[0].querySelector("a") : null;
        const payDate = payDateLink ? tidy(payDateLink.textContent) : tidy(c[0].innerText || c[0].textContent);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(payDate)) continue; // descarta filas raras

        yearData.Rows.push({
          "Pay Date":         payDate,
          "Pre-tax":          moneyToNumber(c[1] ? c[1].innerText : ""),
          "Roth":             moneyToNumber(c[2] ? c[2].innerText : ""),
          "Employer Match":   moneyToNumber(c[3] ? c[3].innerText : ""),
          "Loan":             moneyToNumber(c[4] ? c[4].innerText : ""),
          "Plan comp":        moneyToNumber(c[5] ? c[5].innerText : ""),
          "Hours":            num(c[6] ? c[6].innerText : ""),
          "Pay Date URL":     payDateLink ? payDateLink.getAttribute("href") : null,
        });
      }

      return yearData;
    }

    for (const y of yearsToProcess) {
      const parsed = parseYearGroup(y);
      if (parsed) {
        data[`Payroll ${y}`] = parsed;
      }
    }

    return { data };
  }, { scopeSel: scope, yearsRequest });

  // ---------- Post-procesamiento en Node ----------
  let data = result.data || {};
  const warnings = [];

  // Filtrado por campos solicitados (excluyendo los tokens years:)
  let unknownFields = [];
  if (fieldsFilter) {
    const filtered = {};
    for (const f of fieldsFilter) {
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

module.exports = Object.assign(extractPayroll, { SUPPORTED_FIELDS });

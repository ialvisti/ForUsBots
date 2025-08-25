// src/extractors/forusall-participant/modules/payroll.js

// ⚠️ Convención de filtrado de años (entrada de fields):
//   ["years:2025"]            → solo 2025
//   ["years:2024,2025"]       → 2024 y 2025
//   ["years:all"]             → todos los disponibles
//   ["Payroll 2024"]          → tabla del 2024 (campos dinámicos)
// Si NO se especifica nada de años, se devuelve únicamente el año más reciente
// (primer .payroll-year-group del DOM).

// Campos soportados "estáticos"
const SUPPORTED_FIELDS = [
  "Payroll Frequency",
  "Next Schedule paycheck",
  "Available Years",
];

// Política de campos para validación previa (en el registry / endpoint)
const FIELD_POLICY = {
  dynamicRegex: /^Payroll\s+(?<year>\d{4})$/i,              // e.g. "Payroll 2025"
  tokenRegex: /^years:(?<spec>all|[\d,\s]+)$/i,             // e.g. "years:2024,2025"
};

// Normalizador/validador de fields (lo usará el registry/endpoint)
function normalizeFields(fields) {
  const out = { normalized: [], errors: [], unknown: [] };
  const arr = Array.isArray(fields) ? fields : [];

  for (const raw of arr) {
    const f = String(raw || "").trim();
    if (!f) continue;

    // Estáticos exactos
    if (SUPPORTED_FIELDS.includes(f)) {
      out.normalized.push(f);
      continue;
    }

    // Dinámicos tipo "Payroll 2025"
    const mDyn = f.match(FIELD_POLICY.dynamicRegex);
    if (mDyn && mDyn.groups?.year) {
      out.normalized.push(`Payroll ${mDyn.groups.year}`);
      continue;
    }

    // Tokens years:
    const mTok = f.toLowerCase().match(FIELD_POLICY.tokenRegex);
    if (mTok) {
      // Se mantienen tal cual; el extractor aplicará el filtro de años
      out.normalized.push(f);
      continue;
    }

    // Formatos con intención pero inválidos → error de formato
    if (/^years:/i.test(f) || /^Payroll\s+/i.test(f)) {
      out.errors.push({ code: "invalid_field_format", field: f });
    } else {
      // Cualquier otra cosa → desconocido
      out.unknown.push(f);
    }
  }

  // Si no vino nada, indicamos que no hay filtro (se aplicará default en extractor)
  if (!out.normalized.length) out.normalized = null;

  return out;
}

async function extractPayroll(page, opts = {}) {
  const scope = opts.scope || null;
  const fieldsIn = Array.isArray(opts.fields) && opts.fields.length ? opts.fields : null;

  // ---- Parseo de años solicitado (en Node, fuera del evaluate) ----
  let yearsRequest = null; // null => por defecto (más reciente)

  // Años derivados de tokens years:
  if (fieldsIn) {
    const yearTokens = fieldsIn.filter((f) => /^years:/i.test(String(f)));
    if (yearTokens.length) {
      const tok = String(yearTokens[0]).toLowerCase();
      if (tok === "years:all") {
        yearsRequest = "all";
      } else {
        const m = tok.match(/^years:([\d,\s]+)$/);
        if (m) {
          yearsRequest = m[1].split(",").map((s) => s.trim()).filter(Boolean);
        }
      }
    }
  }

  // Años derivados de campos dinámicos "Payroll YYYY"
  if (!yearsRequest && fieldsIn) {
    const dynamicYears = [];
    for (const f of fieldsIn) {
      const m = String(f).match(FIELD_POLICY.dynamicRegex);
      if (m?.groups?.year) dynamicYears.push(m.groups.year);
    }
    if (dynamicYears.length) yearsRequest = dynamicYears;
  }

  // El filtro real de campos EXCLUYE los tokens years: (pero conserva "Payroll YYYY").
  // OJO: el filtrado final se hará abajo, pero aquí preparamos la lista sin tokens.
  let fieldsFilter = null;
  if (fieldsIn) {
    fieldsFilter = fieldsIn.filter((f) => !/^years:/i.test(String(f)));
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
      yearsToProcess = availableYears.length
        ? availableYears
        : allGroups.map(g => (g.id.match(/(\d{4})/) || [null, null])[1]).filter(Boolean);
    } else if (Array.isArray(yearsRequest) && yearsRequest.length) {
      const setAvail = new Set(
        availableYears.length
          ? availableYears
          : allGroups.map(g => (g.id.match(/(\d{4})/) || [null, null])[1]).filter(Boolean)
      );
      yearsToProcess = yearsRequest.filter((y) => setAvail.has(y));
    } else {
      // Por defecto: el primer grupo en DOM (más reciente)
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
        const firstTxt = tidy(cols[0] ? (cols[0].innerText || cols[0].textContent) : "");
        if (/^Total\b/i.test(firstTxt)) { totalsRow = r; break; }
      }

      const yearData = { Total: null, Rows: [] };

      if (totalsRow) {
        const c = getImmediateCols(totalsRow);
        yearData.Total = {
          "Pre-tax":        moneyToNumber(c[1] ? c[1].innerText : ""),
          "Roth":           moneyToNumber(c[2] ? c[2].innerText : ""),
          "Employer Match": moneyToNumber(c[3] ? c[3].innerText : ""),
          "Loan":           moneyToNumber(c[4] ? c[4].innerText : ""),
          "Plan comp":      moneyToNumber(c[5] ? c[5].innerText : ""),
          "Hours":          num(c[6] ? c[6].innerText : ""),
        };
      }

      // Filas detalle
      for (const r of rows) {
        if (r === totalsRow) continue;
        const c = getImmediateCols(r);
        if (c.length < 7) continue;

        const payDateLink = c[0] ? c[0].querySelector("a") : null;
        const payDate = payDateLink ? tidy(payDateLink.textContent) : tidy(c[0].innerText || c[0].textContent);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(payDate)) continue;

        yearData.Rows.push({
          "Pay Date":       payDate,
          "Pre-tax":        moneyToNumber(c[1] ? c[1].innerText : ""),
          "Roth":           moneyToNumber(c[2] ? c[2].innerText : ""),
          "Employer Match": moneyToNumber(c[3] ? c[3].innerText : ""),
          "Loan":           moneyToNumber(c[4] ? c[4].innerText : ""),
          "Plan comp":      moneyToNumber(c[5] ? c[5].innerText : ""),
          "Hours":          num(c[6] ? c[6].innerText : ""),
          "Pay Date URL":   payDateLink ? payDateLink.getAttribute("href") : null,
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

  // --- Reconstruir intención de años pedidos (tokens/dinámicos) ---
  const available = (data["Available Years"] || []).map(String);
  let requestedAll = false;
  const requestedYears = new Set();

  if (Array.isArray(fieldsIn)) {
    for (const f of fieldsIn) {
      const s = String(f);
      const mTok = s.toLowerCase().match(FIELD_POLICY.tokenRegex);
      if (mTok) {
        if (mTok.groups?.spec === "all") {
          requestedAll = true;
        } else {
          String(mTok.groups.spec)
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
            .forEach((y) => requestedYears.add(y));
        }
      }
      const mDyn = s.match(FIELD_POLICY.dynamicRegex);
      if (mDyn?.groups?.year) requestedYears.add(mDyn.groups.year);
    }
  }

  const effectiveYears = requestedAll
    ? available.slice()
    : [...requestedYears].filter((y) => available.includes(String(y)));

  // Warnings por años inexistentes
  if (!requestedAll && requestedYears.size) {
    const missingYears = [...requestedYears].filter((y) => !available.includes(String(y)));
    if (missingYears.length) warnings.push({ code: "year_not_available", years: missingYears });
  }

  // --- Filtrado final de claves a devolver ---
  // Regla:
  // - Si el cliente NO envió fields -> dejamos todo (comportamiento legacy).
  // - Si SÍ envió fields:
  //    • Mantenemos los campos estáticos/dinámicos solicitados (sin tokens).
  //    • Además, los tokens `years:*` IMPLICAN conservar `Payroll YYYY` de esos años.
  //    • Si solo hubo tokens (no hubo campos explícitos), devolvemos SOLO las tablas implicadas.
  let unknownFields = [];
  const clientSentFields = Array.isArray(fieldsIn) && fieldsIn.length > 0;

  if (clientSentFields) {
    const nonTokenRequested = (fieldsIn || []).filter((f) => !/^years:/i.test(String(f)));
    const keep = new Set(nonTokenRequested);

    // Implicar tablas por años pedidos
    for (const y of effectiveYears) keep.add(`Payroll ${y}`);

    // Construimos data filtrada
    const filtered = {};
    for (const k of Object.keys(data)) {
      if (keep.has(k)) filtered[k] = data[k];
    }
    data = filtered;

    // unknownFields: solo para los no-tokens explícitos
    unknownFields = nonTokenRequested.filter((f) => !Object.prototype.hasOwnProperty.call(result.data || {}, f));
  }

  return { data, warnings, unknownFields };
}

module.exports = Object.assign(extractPayroll, {
  SUPPORTED_FIELDS,
  FIELD_POLICY,
  normalizeFields,
});

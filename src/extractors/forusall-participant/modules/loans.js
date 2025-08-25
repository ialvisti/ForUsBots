// src/extractors/forusall-participant/modules/loans.js

// Campos soportados (nombres EXACTOS como se mostrarán en el JSON)
const SUPPORTED_FIELDS = [
  "Participant Site",
  "Maximum Number of Loans",
  "Account Balance",
  "Account Balance As Of",
  "Loan History"
];

/**
 * Extrae pares del módulo Loans.
 * - Siempre: Participant Site, Maximum Number of Loans, Account Balance
 *     - "Account Balance" => se remueven paréntesis finales
 *     - "Account Balance As Of" => se llena con el contenido del paréntesis si existe (idealmente fecha)
 * - Loan History:
 *     - Se identifica SIEMPRE en el segundo bloque ".form-bound" dentro de #loan-details:
 *         - Si ese bloque contiene el texto literal "No loan history found" ⇒
 *           "There's no Loan History for this Participant"
 *         - En caso contrario ⇒ se parsean las filas con 6 columnas .col-md-2 (sin <label>)
 *
 * Soporta filtrado por 'fields'.
 *
 * @param {import('playwright').Page} page
 * @param {{ scope?: string|null, fields?: string[]|null }} opts
 * @returns {Promise<{data:Object, warnings:string[], unknownFields:string[]}>}
 */
async function extractLoans(page, opts = {}) {
  const scope = opts.scope || null;
  const fields = Array.isArray(opts.fields) && opts.fields.length ? opts.fields : null;

  const result = await page.evaluate(({ scopeSel }) => {
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
    function getImmediateCols(row) {
      return Array.from(row.children).filter((c) => {
        const cn = (c && c.className) || "";
        return /\bcol-md-\d+\b/.test(cn);
      });
    }
    function colValueWithoutLabels(col) {
      if (!col) return "";
      // Elimina cualquier <label> interno para quedarnos con el valor visible
      let t = col.innerText || col.textContent || "";
      col.querySelectorAll("label").forEach((lb) => {
        const lt = lb ? (lb.innerText || lb.textContent || "") : "";
        if (lt) t = t.replace(lt, "");
      });
      return tidy(t);
    }

    const root =
      (scopeSel && document.querySelector(scopeSel)) ||
      document.querySelector("#loan-details") ||
      document.querySelector("#loan") ||
      document;

    const data = {};

    // -------- 1) Pares simples superiores --------
    //   col-md-4 > label | col-md-8.left-align (valor)
    const topRows = root.querySelectorAll(".row.field.form-group");
    for (const row of topRows) {
      const cols = getImmediateCols(row);
      if (!cols.length) continue;

      const firstCol = cols.find((c) => /\bcol-md-4\b/.test(c.className)) || cols[0];
      const labelEl = firstCol ? firstCol.querySelector("label") : null;
      const rawLabel = labelEl ? tidy(labelEl.textContent) : tidy(firstCol && (firstCol.innerText || firstCol.textContent));
      const label = (rawLabel || "").replace(/\s*:\s*$/, "");
      if (!label) continue;

      // Saltar posibles encabezados de la tabla (se gestionan en el bloque de history)
      if (/^(Start Date|End Date|Repayment Amount|Principal|Outstanding Balance|Balance as of Date)$/i.test(label)) {
        continue;
      }

      // Valor (preferir .left-align)
      let val = "";
      const left = row.querySelector(".left-align");
      if (left) {
        val = textOf(left);
      } else {
        const valCol = cols.find((el) => !el.querySelector("label") && el !== firstCol);
        if (valCol) val = tidy(valCol.innerText || valCol.textContent || "");
      }
      if (!val) continue;

      if (/^Account Balance$/i.test(label)) {
        // Extra: separar "(as of ...)" al final
        let balance = val;
        let asOf = null;

        const m = balance.match(/\(\s*as of\s*([^)]+?)\s*\)\s*$/i);
        if (m) {
          asOf = tidy(m[1]);
          balance = tidy(balance.replace(/\(\s*as of[^)]*\)\s*$/i, ""));
        } else {
          const m2 = balance.match(/\(\s*([^)]+?)\s*\)\s*$/);
          if (m2) {
            asOf = tidy(m2[1]);
            balance = tidy(balance.replace(/\([^)]*\)\s*$/, ""));
          }
        }

        data["Account Balance"] = balance;
        if (asOf) data["Account Balance As Of"] = asOf;
      } else if (/^Participant Site$/i.test(label)) {
        data["Participant Site"] = val;
      } else if (/^Maximum Number of Loans$/i.test(label)) {
        data["Maximum Number of Loans"] = val;
      }
    }

    // -------- 2) Loan History (regla explícita sobre el bloque) --------
    const blocks = root.querySelectorAll("#loan-details .row.field.form-group.form-bound");
    const historyBlock = blocks[blocks.length - 1] || null; // el segundo form-bound (después de los pares)

    const historyKey = "Loan History";

    if (historyBlock) {
      // (A) Caso SIN historial: el bloque contiene explícitamente el string
      const hasNoHistoryLiteral = Array
        .from(historyBlock.querySelectorAll(".col-md-12"))
        .some(el => /(^|\s)No\s+loan\s+history\s+found(\s|$)/i.test(tidy(el.textContent || "")));

      if (hasNoHistoryLiteral) {
        data[historyKey] = "There's no Loan History for this Participant";
      } else {
        // (B) Caso CON historial: parsear filas con 6 .col-md-2 sin <label>
        const candidateRows = Array.from(historyBlock.querySelectorAll(".row.field.form-group"))
          .filter((row) => {
            if (row.querySelector("label")) return false; // descarta el header de labels
            const cols = row.querySelectorAll(".col-md-2");
            return cols.length >= 6;
          });

        const records = candidateRows.map((row) => {
          const cols = Array.from(row.querySelectorAll(".col-md-2")).slice(0, 6);
          const colText = (i) => colValueWithoutLabels(cols[i] || null);
          const obj = {
            "Start Date": colText(0),
            "End Date": colText(1),
            "Repayment Amount": colText(2),
            "Principal": colText(3),
            "Outstanding Balance": colText(4),
            "Balance as of Date": colText(5),
          };
          // Al menos un valor no vacío
          return Object.values(obj).some(v => v !== "") ? obj : null;
        }).filter(Boolean);

        data[historyKey] = records.length ? records : "There's no Loan History for this Participant";
      }
    } // si no hay bloque, simplemente no seteamos la key

    return { data };
  }, { scopeSel: scope });

  // ---------- Post-procesamiento: normalización numérica para valores con "$" ----------
  let data = result.data || {};
  const warnings = [];

  const toNumber = (s) => {
    const num = parseFloat(String(s).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(num) ? num : s;
  };

  // Top-level: Account Balance (si trae $)
  if (typeof data["Account Balance"] === "string" && data["Account Balance"].includes("$")) {
    data["Account Balance"] = toNumber(data["Account Balance"]);
  }

  // Loan History: convertir montos a número si existe array
  if (Array.isArray(data["Loan History"])) {
    data["Loan History"] = data["Loan History"].map(rec => {
      if (rec && typeof rec === 'object') {
        for (const key of ["Repayment Amount", "Principal", "Outstanding Balance"]) {
          if (typeof rec[key] === "string" && rec[key].includes("$")) {
            rec[key] = toNumber(rec[key]);
          }
        }
      }
      return rec;
    });
  }

  // Filtrado por campos solicitados
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

module.exports = Object.assign(extractLoans, { SUPPORTED_FIELDS });

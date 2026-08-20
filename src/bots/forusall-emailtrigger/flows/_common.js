// src/bots/forusall-emailtrigger/flows/_common.js

async function waitOptionsCount(
  page,
  selectSel,
  { timeout = 8000, min = 1 } = {}
) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const n = await page
      .$$eval(selectSel, (els) => {
        const el = els && els[0];
        if (!el) return 0;
        return (el.options && el.options.length) || 0;
      })
      .catch(() => 0);
    if (n >= min) return true;
    await page.waitForTimeout(120);
  }
  return false;
}

async function optionExists(page, selectSel, value) {
  return await page
    .$$eval(
      selectSel,
      (els, v) => {
        const el = els && els[0];
        if (!el) return false;
        return Array.from(el.options || []).some(
          (o) => String(o.value) === String(v)
        );
      },
      value
    )
    .catch(() => false);
}

async function getSelectOptions(page, selectSel) {
  return await page
    .$$eval(selectSel, (els) => {
      const el = els && els[0];
      if (!el) return [];
      return Array.from(el.options || []).map((o) => ({
        value: String(o.value ?? ""),
        text: String(o.textContent ?? "").trim(),
      }));
    })
    .catch(() => []);
}

async function selectIfPresent(
  page,
  selectSel,
  value,
  { required = false, firstIfMissing = false } = {}
) {
  await page.waitForSelector(selectSel, { state: "visible", timeout: 8000 });
  const optionsReady = await waitOptionsCount(page, selectSel, {
    timeout: 8000,
  });
  if (!optionsReady) {
    throw new Error(`Select options did not load for ${selectSel}`);
  }
  const has = await optionExists(page, selectSel, value);
  if (has) {
    const selected = await page.selectOption(selectSel, String(value));
    if (
      !Array.isArray(selected) ||
      selected.length !== 1 ||
      String(selected[0]) !== String(value)
    ) {
      throw new Error(`Selection failed for ${selectSel}`);
    }
  } else if (firstIfMissing) {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el || !el.options || !el.options.length) {
        throw new Error("Select has no fallback option");
      }
      el.selectedIndex = 0;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, selectSel);
  } else if (required) {
    throw new Error(`Required option '${value}' not found for ${selectSel}`);
  } else {
    return false;
  }

  const readback = await page.inputValue(selectSel);
  if (has && String(readback) !== String(value)) {
    throw new Error(`Selection readback mismatch for ${selectSel}`);
  }
  if (firstIfMissing && !String(readback)) {
    throw new Error(`Fallback selection readback failed for ${selectSel}`);
  }
  return true;
}

async function setText(page, sel, value, { visible = true } = {}) {
  if (visible) {
    await page.waitForSelector(sel, { state: "visible", timeout: 8000 });
  } else {
    await page.waitForSelector(sel, { timeout: 8000 }).catch(() => {});
  }
  await page.fill(sel, String(value)).catch(() => {});
  await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur && el.blur();
  }, sel);
}

async function setCheckbox(page, sel, on) {
  await page.waitForSelector(sel, { timeout: 8000 });
  const isChecked = await page.isChecked(sel).catch(() => false);
  if (on && !isChecked) await page.check(sel).catch(() => {});
  if (!on && isChecked) await page.uncheck(sel).catch(() => {});
}

async function setRadioByValue(page, name, value) {
  await page
    .evaluate(
      ([n, v]) => {
        const el = document.querySelector(`input[name="${n}"][value="${v}"]`);
        if (el) el.click();
      },
      [name, value]
    )
    .catch(() => {});
}

function validateTime(hhmm) {
  return /^\d{2}:\d{2}$/.test(String(hhmm || ""));
}

function validateDate(ymd) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ""));
}

// === Helpers específicos de la página de preview (DataTables) === //
async function getPreviewFirstRowFileName(page) {
  return await page
    .evaluate(() => {
      const table = document.querySelector("#data_list");
      if (!table) return null;

      // Índice de la columna "File Name" en THEAD (aunque esté oculta)
      const ths = Array.from(table.querySelectorAll("thead th"));
      const fileNameColIdx = ths.findIndex((th) => {
        const txt = (th.textContent || "").trim().toLowerCase();
        return txt === "file name";
      });

      // Primera fila de datos
      const firstRow = table.querySelector('tbody tr[role="row"]');
      if (!firstRow) return null;

      const cells = Array.from(firstRow.querySelectorAll("td"));

      // 1) Intento: usar índice exacto
      if (fileNameColIdx >= 0 && fileNameColIdx < cells.length) {
        const txt = (cells[fileNameColIdx].textContent || "").trim();
        if (txt) return txt;
      }

      // 2) Fallback: primer <td> con pinta de .pdf
      const pdfCell = cells.find((td) =>
        /\.pdf(\s*)$/i.test((td.textContent || "").trim())
      );
      if (pdfCell) return (pdfCell.textContent || "").trim();

      return null;
    })
    .catch(() => null);
}

/**
 * Devuelve un elemento por cada fila de datos actualmente visible en el
 * preview. Los nombres ausentes se conservan como null para que el caller
 * pueda fallar cerrado en vez de ignorar silenciosamente una fila.
 */
async function getPreviewFileNames(page) {
  return await page.evaluate(() => {
    const table = document.querySelector("#data_list");
    if (!table) return [];

    const ths = Array.from(table.querySelectorAll("thead th"));
    const fileNameColIdx = ths.findIndex((th) => {
      const txt = (th.textContent || "").trim().toLowerCase();
      return txt === "file name";
    });

    return Array.from(table.querySelectorAll('tbody tr[role="row"]')).map(
      (row) => {
        const cells = Array.from(row.querySelectorAll("td"));

        if (fileNameColIdx >= 0 && fileNameColIdx < cells.length) {
          const txt = (cells[fileNameColIdx].textContent || "").trim();
          if (txt) return txt;
        }

        const pdfCell = cells.find((td) =>
          /\.pdf(\s*)$/i.test((td.textContent || "").trim())
        );
        return pdfCell ? (pdfCell.textContent || "").trim() : null;
      }
    );
  });
}

/**
 * Captura una referencia completa por cada fila visible. No intenta adivinar
 * columnas: ambas cabeceras forman parte del contrato observado del portal y
 * su ausencia debe detener el envío.
 */
async function getPreviewManifest(page) {
  return await page.evaluate(() => {
    const table = document.querySelector("#data_list");
    if (!table) return [];

    const headers = Array.from(table.querySelectorAll("thead th"));
    const headerIndex = (expected) =>
      headers.findIndex(
        (th) =>
          String(th.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase() === expected
      );
    const fileNameIndex = headerIndex("file name");
    const fileS3Index = headerIndex("file s3 loc");
    if (fileNameIndex < 0 || fileS3Index < 0) return [];

    return Array.from(table.querySelectorAll('tbody tr[role="row"]')).map(
      (row, index) => {
        const cells = Array.from(row.querySelectorAll("td"));
        const nameCell = cells[fileNameIndex] || null;
        const locationCell = cells[fileS3Index] || null;
        const anchor = locationCell?.querySelector?.("a[href]") || null;
        const fileName = String(nameCell?.textContent || "").trim() || null;
        const fileUrl =
          String(
            anchor?.href ||
              anchor?.getAttribute?.("href") ||
              locationCell?.textContent ||
              ""
          ).trim() || null;
        return { rowNumber: index + 1, fileName, fileUrl };
      }
    );
  });
}

async function getPreviewParticipantSelections(page) {
  return await page.evaluate(() => {
    const table = document.querySelector("#data_list");
    if (!table) {
      return { count: 0, checkedCount: 0, enabledCount: 0, values: [] };
    }
    const checkboxes = Array.from(
      table.querySelectorAll('tbody input.participant_checks[type="checkbox"]')
    );
    return {
      count: checkboxes.length,
      checkedCount: checkboxes.filter((item) => item.checked).length,
      enabledCount: checkboxes.filter((item) => !item.disabled).length,
      values: checkboxes.map((item) => String(item.value || "").trim()),
    };
  });
}

/**
 * Predicado ejecutado en el navegador para demostrar que DataTables muestra
 * el dataset completo, sin paginación ni filtros activos.
 *
 * @returns {false|{expectedTotal:number,rowCount:number}}
 */
function previewAllRowsReady() {
  const select = document.querySelector('select[name="data_list_length"]');
  if (select?.value !== "-1") return false;

  const processing = document.querySelector("#data_list_processing");
  if (processing) {
    const style = window.getComputedStyle(processing);
    if (style.display !== "none" && style.visibility !== "hidden") {
      return false;
    }
  }

  const rowCount = document.querySelectorAll(
    '#data_list tbody tr[role="row"]'
  ).length;
  const dataTablesApi = window.jQuery?.fn?.dataTable;
  if (dataTablesApi?.isDataTable?.("#data_list")) {
    const pageInfo = window.jQuery("#data_list").DataTable().page.info();
    const displayed = Number(pageInfo?.recordsDisplay);
    const total = Number(pageInfo?.recordsTotal);
    if (
      !Number.isInteger(displayed) ||
      !Number.isInteger(total) ||
      total <= 0 ||
      displayed !== total ||
      rowCount !== total
    ) {
      return false;
    }
    return { expectedTotal: total, rowCount };
  }

  const infoText = document.querySelector("#data_list_info")?.textContent || "";
  const displayedMatch = infoText.match(/of\s+([\d,]+)\s+entries/i);
  if (!displayedMatch) return false;

  const displayed = Number(displayedMatch[1].replaceAll(",", ""));
  const filteredMatch = infoText.match(
    /filtered\s+from\s+([\d,]+)\s+total\s+entries/i
  );
  const total = filteredMatch
    ? Number(filteredMatch[1].replaceAll(",", ""))
    : displayed;

  if (
    !Number.isInteger(displayed) ||
    !Number.isInteger(total) ||
    total <= 0 ||
    displayed !== total ||
    rowCount !== total
  ) {
    return false;
  }
  return { expectedTotal: total, rowCount };
}

async function waitForAllPreviewRows(page, { timeout = 10000 } = {}) {
  const handle = await page.waitForFunction(
    previewAllRowsReady,
    undefined,
    { timeout }
  );
  try {
    const state =
      typeof handle?.jsonValue === "function" ? await handle.jsonValue() : handle;
    if (
      !state ||
      !Number.isInteger(state.expectedTotal) ||
      state.expectedTotal <= 0 ||
      state.rowCount !== state.expectedTotal
    ) {
      throw new Error("Could not prove that all unfiltered preview rows loaded");
    }
    return state;
  } finally {
    await handle?.dispose?.();
  }
}

// (legacy) aceptar siguiente dialog si lo hubiera
function acceptNextDialog(page) {
  page.once("dialog", (d) => d.accept().catch(() => {}));
}

async function waitForUrl(page, re, { timeout = 15000 } = {}) {
  return await page.waitForURL(re, { timeout }).catch(() => null);
}

/**
 * Click en Preview y espera TOLERANTE a latencia hasta detectar:
 *  - URL /preview
 *  - #data_list (tabla)
 *  - #triggerEmail (botón propio del preview)
 *
 * @returns {Promise<{ok:boolean, tookMs:number}>}
 */
async function ensurePreviewLongWait(page, selectors = {}, jobCtx, opts = {}) {
  const clickSel = selectors.previewButton || "#previewEmail";
  const maxMs = Math.max(
    15000,
    parseInt(process.env.PREVIEW_NAV_MAX_MS || opts.timeoutMs || "90000", 10)
  );

  // Ya estamos en preview
  if (/\/preview(\?|$)/.test(page.url())) {
    return { ok: true, tookMs: 0 };
  }

  const t0 = Date.now();

  // Click una sola vez; no esperamos navegación aquí
  await page.click(clickSel, { noWaitAfter: true });

  // Bucle de espera con múltiples señales
  while (Date.now() - t0 < maxMs) {
    // 1) URL ya cambió
    if (/\/preview(\?|$)/.test(page.url())) {
      return { ok: true, tookMs: Date.now() - t0 };
    }

    // 2) Señales DOM exclusivas del preview (cuando ya renderizó)
    const hasTable = await page
      .$("#data_list")
      .then(Boolean)
      .catch(() => false);
    if (hasTable) {
      return { ok: true, tookMs: Date.now() - t0 };
    }
    const hasTrigger = await page
      .$("#triggerEmail")
      .then(Boolean)
      .catch(() => false);
    if (hasTrigger) {
      return { ok: true, tookMs: Date.now() - t0 };
    }

    // 3) Intento corto de waitForURL para capturar el salto si ocurre mientras dormimos
    const left = maxMs - (Date.now() - t0);
    const hop = Math.min(1500, Math.max(250, left));
    const got = await page
      .waitForURL(/\/preview(\?|$)/, { timeout: hop })
      .catch(() => null);
    if (got) {
      return { ok: true, tookMs: Date.now() - t0 };
    }

    // Pequeño respiro
    await page.waitForTimeout(400);
  }

  return { ok: false, tookMs: Date.now() - t0 };
}

/**
 * Verifica si la tabla del preview está vacía, basándose en:
 *  - Presencia de 'td.dataTables_empty'
 *  - Texto de '#data_list_info' indicando 0 entries / No participants found
 *  - Conteo de filas con role="row"
 */
async function isPreviewTableEmpty(page) {
  return await page
    .evaluate(() => {
      const table = document.querySelector("#data_list");
      if (!table) return { tablePresent: false, empty: false, rowCount: 0 };

      const rows = table.querySelectorAll('tbody tr[role="row"]').length;
      const emptyCell = !!table.querySelector("td.dataTables_empty");

      const info = document.querySelector("#data_list_info");
      const infoText =
        info && info.textContent ? info.textContent.trim().toLowerCase() : "";
      const infoZero =
        infoText.includes("0 to 0 of 0") ||
        infoText.includes("0 entries") ||
        infoText.includes("no participants found");

      return {
        tablePresent: true,
        empty: emptyCell || (rows === 0 && infoZero),
        rowCount: rows,
        hasEmptyCell: emptyCell,
        infoText,
      };
    })
    .catch(() => ({
      tablePresent: false,
      empty: false,
      rowCount: 0,
      hasEmptyCell: false,
      infoText: "",
    }));
}

/**
 * Espera a que la tabla del preview se resuelva en:
 *  - state: "rows"  => hay al menos una fila
 *  - state: "empty" => DataTables establemente vacío
 *  - state: "timeout" => no se pudo determinar en el tiempo dado
 */
async function waitTableOrEmpty(
  page,
  { timeout = 60000, stableEmptyMs = 1200 } = {}
) {
  const start = Date.now();
  let emptySince = null;

  // asegurarse de que #data_list aparezca
  await page.waitForSelector("#data_list", { timeout }).catch(() => {});

  while (Date.now() - start < timeout) {
    const st = await isPreviewTableEmpty(page);

    if (st.tablePresent && st.rowCount > 0) {
      return { state: "rows", waitedMs: Date.now() - start, rows: st.rowCount };
    }

    if (st.tablePresent && st.empty) {
      if (emptySince == null) emptySince = Date.now();
      if (Date.now() - emptySince >= stableEmptyMs) {
        return { state: "empty", waitedMs: Date.now() - start };
      }
    } else {
      emptySince = null; // perdió condición de vacío estable
    }

    await page.waitForTimeout(150);
  }

  return { state: "timeout", waitedMs: Date.now() - start };
}

module.exports = {
  waitOptionsCount,
  optionExists,
  getSelectOptions,
  selectIfPresent,
  setText,
  setCheckbox,
  setRadioByValue,
  validateTime,
  validateDate,
  getPreviewFirstRowFileName,
  getPreviewFileNames,
  getPreviewManifest,
  getPreviewParticipantSelections,
  previewAllRowsReady,
  waitForAllPreviewRows,
  acceptNextDialog,
  waitForUrl,
  ensurePreviewLongWait,
  // nuevos
  isPreviewTableEmpty,
  waitTableOrEmpty,
};

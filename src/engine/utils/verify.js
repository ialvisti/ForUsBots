// src/engine/utils/verify.js

/**
 * Verifica que el formulario haya quedado "limpio" después de Submit.
 * Regla: los campos que llenamos ya NO deben contener los valores enviados.
 * - Para selects (section/caption/status): deben ser distintos a lo enviado.
 * - Para effectiveDate: idealmente vacío (''), o al menos ≠ al enviado.
 * - Para file input: debe estar vacío (sin archivos).
 * - Para captionOtherText (si se usó): debe quedar vacío ''.
 *
 * Devuelve { ok, mismatches[], snapshot } y hace un pequeño poll hasta timeoutMs.
 *
 * @param {import('playwright').Page} page
 * @param {{ fsel: {section:string, caption:string, status:string, effectiveDate:string, customCaption?:string, container?:string}, fileInputSel: string, filled: {section:string, caption:string, status:string, effectiveDate:string, captionOtherText?:string|null} }} cfg
 * @param {{ timeoutMs?: number, pollMs?: number }} opts
 */
async function waitForFormCleared(page, cfg, opts = {}) {
  const { fsel, fileInputSel, filled } = cfg || {};
  const timeoutMs = Number(opts.timeoutMs ?? 4000);
  const pollMs = Number(opts.pollMs ?? 150);

  const mismatches = [];
  const deadline = Date.now() + timeoutMs;

  function tidy(s) {
    return String(s ?? "").trim();
  }

  async function safeEval(fn) {
    try {
      return await fn();
    } catch {
      return null;
    }
  }

  async function selectedText(sel) {
    return await safeEval(() =>
      page.$eval(sel, (el) => {
        const i = el.selectedIndex;
        const t =
          i >= 0 && el.options[i] ? el.options[i].textContent || "" : "";
        return (t || "").trim();
      })
    );
  }

  async function snapshot() {
    const sec = await selectedText(fsel.section);
    const cap = await selectedText(fsel.caption);
    const sta = await selectedText(fsel.status);
    const dateVal = await safeEval(() =>
      page.$eval(fsel.effectiveDate, (el) => el.value || "")
    );
    const fileEmpty = await safeEval(() =>
      page.$eval(fileInputSel, (el) => (el.files ? el.files.length : 0) === 0)
    );
    const otherVal =
      filled?.captionOtherText != null
        ? await safeEval(() =>
            page.$eval(
              fsel.customCaption || "#fv_document_customized_caption",
              (el) => el.value || ""
            )
          )
        : null;

    return {
      section: sec,
      caption: cap,
      status: sta,
      effectiveDate: dateVal,
      fileEmpty,
      captionOtherText: otherVal,
    };
  }

  while (Date.now() < deadline) {
    const snap = await snapshot();

    // Chequeos: deben ser distintos (o vacíos donde aplique)
    const want = {
      section: tidy(filled.section),
      caption: tidy(filled.caption),
      status: tidy(filled.status),
      effectiveDate: tidy(filled.effectiveDate || ""),
      captionOtherText:
        filled.captionOtherText != null ? tidy(filled.captionOtherText) : null,
    };

    const tests = [];

    // Selects: sección/caption/status ya NO deben igualar lo enviado
    if (snap.section != null) {
      tests.push([
        "section",
        tidy(snap.section) !== want.section,
        `Section aún = "${snap.section}"`,
      ]);
    }
    if (snap.caption != null) {
      tests.push([
        "caption",
        tidy(snap.caption) !== want.caption,
        `Caption aún = "${snap.caption}"`,
      ]);
    }
    if (snap.status != null) {
      tests.push([
        "status",
        tidy(snap.status) !== want.status,
        `Status aún = "${snap.status}"`,
      ]);
    }

    // Fecha: preferimos vacío, pero aceptamos “distinta a la enviada”
    const dateOk =
      snap.effectiveDate != null &&
      (tidy(snap.effectiveDate) === "" ||
        tidy(snap.effectiveDate) !== want.effectiveDate);
    tests.push([
      "effectiveDate",
      dateOk,
      `EffectiveDate aún = "${snap.effectiveDate}"`,
    ]);

    // Archivo: debe estar vacío
    const fileOk = snap.fileEmpty === true;
    tests.push(["file", fileOk, "File input sigue con archivo"]);

    // Caption Other (si se usó): debe quedar vacío
    if (want.captionOtherText != null) {
      const otherOk = tidy(snap.captionOtherText || "") === "";
      tests.push([
        "captionOtherText",
        otherOk,
        `Custom caption aún = "${snap.captionOtherText}"`,
      ]);
    }

    const bad = tests.filter(([, ok]) => !ok);
    if (bad.length === 0) {
      return { ok: true, mismatches: [], snapshot: snap };
    }

    // Poll corto
    await page.waitForTimeout(pollMs);
  }

  // Una última foto para el error
  const finalSnap = await (async () => {
    try {
      return await page.screenshot({ fullPage: true, encoding: "base64" });
    } catch {
      return null;
    }
  })();

  // Última lectura para explicar el fallo
  const snap = await snapshot();
  const want = {
    section: tidy(filled.section),
    caption: tidy(filled.caption),
    status: tidy(filled.status),
    effectiveDate: tidy(filled.effectiveDate || ""),
    captionOtherText:
      filled.captionOtherText != null ? tidy(filled.captionOtherText) : null,
  };

  const out = [];
  if (snap.section != null && tidy(snap.section) === want.section)
    out.push(`Section no se limpió (=${snap.section})`);
  if (snap.caption != null && tidy(snap.caption) === want.caption)
    out.push(`Caption no se limpió (=${snap.caption})`);
  if (snap.status != null && tidy(snap.status) === want.status)
    out.push(`Status no se limpió (=${snap.status})`);
  if (
    !(
      tidy(snap.effectiveDate || "") === "" ||
      tidy(snap.effectiveDate || "") !== want.effectiveDate
    )
  ) {
    out.push(`EffectiveDate no se limpió (=${snap.effectiveDate})`);
  }
  if (snap.fileEmpty !== true) out.push("File input no está vacío");
  if (
    want.captionOtherText != null &&
    tidy(snap.captionOtherText || "") !== ""
  ) {
    out.push(`Custom caption no se limpió (=${snap.captionOtherText})`);
  }

  return {
    ok: false,
    mismatches: out.length
      ? out
      : ["No se alcanzó estado “cleared” dentro del timeout"],
    snapshot: snap,
    finalShotBase64: finalSnap || undefined,
  };
}

/**
 * (Histórico) Verificador contra defaults fijos. Se deja por compatibilidad
 * pero ya no se usa en el flujo principal.
 */
async function verifyFormDefaults(
  page,
  { fsel, fileInputSel, containerSel },
  delayMs
) {
  const mismatches = [];
  const delay = Number(delayMs || 5000);

  async function withNavRetries(fn, { retries = 3, pause = 300 } = {}) {
    let lastErr;
    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (e) {
        const msg = String((e && e.message) || e);
        if (
          /Execution context was destroyed|Target closed|Navigating|Protocol error|Frame was detached/i.test(
            msg
          )
        ) {
          lastErr = e;
          try {
            await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
          } catch {}
          try {
            await page.waitForLoadState("networkidle", { timeout: 3000 });
          } catch {}
          await page.waitForTimeout(pause);
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  }

  await page.waitForTimeout(delay);

  const containerVisible = await withNavRetries(() =>
    page.waitForSelector(containerSel, { state: "visible", timeout: 15000 })
  )
    .then(() => true)
    .catch(() => false);

  if (!containerVisible) {
    mismatches.push(`El contenedor ${containerSel} no está visible`);
    return { ok: false, mismatches };
  }

  const expected = {
    section: "COVER LETTERS",
    caption: "Basic Plan Document",
    status: "Document Missing",
    dateEmpty: true,
    fileEmpty: true,
  };

  function tidy(s) {
    return String(s || "").trim();
  }

  async function selectedText(sel) {
    return await withNavRetries(async () => {
      return page.$eval(sel, (el) => {
        const i = el.selectedIndex;
        const t = i >= 0 && el.options[i] ? el.options[i].textContent : "";
        return (t || "").trim();
      });
    });
  }

  const sec = await selectedText(fsel.section).catch(() => null);
  const cap = await selectedText(fsel.caption).catch(() => null);
  const sta = await selectedText(fsel.status).catch(() => null);

  const dateVal = await withNavRetries(async () => {
    return page.$eval(fsel.effectiveDate, (el) => el.value || "");
  }).catch(() => null);

  const fileEmpty = await withNavRetries(async () => {
    return page.$eval(
      fileInputSel,
      (el) => (el.files ? el.files.length : 0) === 0
    );
  }).catch(() => null);

  if (tidy(sec) !== expected.section)
    mismatches.push(`Section="${sec}" (esperado "${expected.section}")`);
  if (tidy(cap) !== expected.caption)
    mismatches.push(`Caption="${cap}" (esperado "${expected.caption}")`);
  if (tidy(sta) !== expected.status)
    mismatches.push(`Status="${sta}" (esperado "${expected.status}")`);
  if (expected.dateEmpty && (dateVal || "").trim() !== "")
    mismatches.push(`EffectiveDate no vacío ("${dateVal}")`);
  if (expected.fileEmpty && fileEmpty !== true)
    mismatches.push("File input no está vacío");

  return { ok: mismatches.length === 0, mismatches };
}

module.exports = {
  waitForFormCleared,
  verifyFormDefaults, // se mantiene exportado por compat
};

// src/bots/forusall-emailtrigger/flows/summary_annual_notice.js
const {
  getPreviewFirstRowFileName,
  waitForUrl,
  ensurePreviewLongWait,
  waitTableOrEmpty,
} = require("./_common");

module.exports = async function runSummaryAnnualNotice({
  page,
  selectors: s,
  jobCtx,
}) {
  // A) Asegurar que estamos en /preview con espera tolerante a latencia
  jobCtx?.setStage?.("summary-annual:ensure-preview");
  const { ok, tookMs } = await ensurePreviewLongWait(page, s, jobCtx, {
    timeoutMs: 90000, // configurable por env PREVIEW_NAV_MAX_MS
  });

  jobCtx?.setStage?.("summary-annual:preview-arrival", { tookMs });

  if (!ok) {
    return {
      result: "Failed",
      reason:
        "Preview didn't load within the configured timeout (slow plan load).",
      details: { waitedMs: tookMs },
    };
  }

  // B) Resolver estado de la tabla: filas vs. vacío vs. timeout
  jobCtx?.setStage?.("summary-annual:wait-table-or-empty");
  const tableState = await waitTableOrEmpty(page, {
    timeout: 60000,
    stableEmptyMs: 1000,
  });

  if (tableState.state === "empty") {
    return {
      result: "Empty Plan",
      reason: "No Participants were found in such plan.",
      details: { waitedMs: tableState.waitedMs },
    };
  }

  if (tableState.state === "timeout") {
    return {
      result: "Failed",
      reason:
        "Preview table did not resolve to rows or empty within the timeout window.",
      details: { waitedMs: tableState.waitedMs },
    };
  }

  // C) Tomar "File Name" de la PRIMERA fila (sin expandir child-row)
  jobCtx?.setStage?.("summary-annual:read-filename");
  const fileName = await getPreviewFirstRowFileName(page);
  const lower = String(fileName || "").toLowerCase();

  const hasSar = lower.includes("sar");
  const has2024 = lower.includes("2024");

  if (!(hasSar && has2024)) {
    const reasons = [];
    if (!hasSar) reasons.push("'SAR'");
    if (!has2024) reasons.push("'2024'");

    return {
      result: "Failed",
      reason:
        reasons.length === 1
          ? `File name doesn't contain ${reasons[0]}`
          : `File name doesn't contain ${reasons.join(" and ")}`,
      details: { fileName: fileName || null, hasSar, has2024 },
    };
  }

  // D) Mostrar "All" filas
  jobCtx?.setStage?.("summary-annual:select-all-rows");
  await page
    .selectOption('select[name="data_list_length"]', "-1")
    .catch(() => {});
  await page
    .waitForFunction(
      () =>
        document.querySelector('select[name="data_list_length"]')?.value ===
        "-1",
      { timeout: 5000 }
    )
    .catch(() => {});
  await page.waitForTimeout(200);

  // E) Trigger Email + confirmar y esperar regresar a /trigger_emails
  jobCtx?.setStage?.("summary-annual:trigger-email");
  page.once("dialog", (d) => d.accept().catch(() => {})); // confirm(...)
  await page.click("#triggerEmail", { noWaitAfter: true }).catch(() => {});

  let redirected = await waitForUrl(page, /\/trigger_emails(\?|$)/, {
    timeout: 20000,
  });

  if (!redirected) {
    redirected = await waitForUrl(page, /\/trigger_emails(\?|$)/, {
      timeout: 15000,
    });
    if (!redirected) {
      const shell = await page
        .waitForSelector("#trigger-emails", { timeout: 8000 })
        .catch(() => null);
      if (!shell && !/\/trigger_emails/.test(page.url())) {
        return {
          result: "Failed",
          reason: "Did not return to /trigger_emails after Trigger Email",
        };
      }
    }
  }

  const completedAt = new Date().toISOString();
  return {
    result: "Succeeded",
    reason: `Succeeded on ${completedAt}`,
    details: { completedAt },
  };
};

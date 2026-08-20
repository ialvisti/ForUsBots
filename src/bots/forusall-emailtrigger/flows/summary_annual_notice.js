// src/bots/forusall-emailtrigger/flows/summary_annual_notice.js
const {
  getPreviewManifest,
  getPreviewParticipantSelections,
  waitForAllPreviewRows,
  waitForUrl,
  ensurePreviewLongWait,
  waitTableOrEmpty,
} = require("./_common");
const {
  assertPreviewObjectsStable,
  fingerprintPreviewManifest,
  fingerprintPreviewParticipantSelections,
  getDocumentGateConfig,
  normalizePreviewManifest,
  verifyPreviewDocuments,
} = require("../documentGate");
const { extractPlanIdentity } = require("../planIdentity");
const {
  normalizeReportYear,
  assertSummaryPreviewUrl,
  validateSummaryAnnualFileName,
} = require("../validation");

module.exports = async function runSummaryAnnualNotice({
  page,
  selectors: s,
  meta,
  jobCtx,
}) {
  const reportYear = normalizeReportYear(meta?.reportYear);
  if (reportYear === null) {
    return {
      result: "Failed",
      reason: "Invalid reportYear for summary annual notice",
    };
  }

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
  assertSummaryPreviewUrl(page.url(), { planId: meta.planId });

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

  // C) Mostrar "All" filas y esperar a que DataTables termine el redibujado.
  // Estas operaciones son barreras de seguridad: sus errores deben propagarse.
  jobCtx?.setStage?.("summary-annual:select-all-rows");
  await page.selectOption('select[name="data_list_length"]', "-1");
  const { expectedTotal } = await waitForAllPreviewRows(page, {
    timeout: 10000,
  });

  // D) Capturar todas las referencias que el portal usará. Una fila incompleta
  // falla cerrada; ni los nombres ni las URLs salen de este scope.
  jobCtx?.setStage?.("summary-annual:capture-preview-manifest");
  const manifest = await getPreviewManifest(page);
  const invalidFiles = manifest
    .map((entry, index) => {
      const validation = validateSummaryAnnualFileName(
        entry?.fileName,
        reportYear
      );
      return { rowNumber: index + 1, ...validation };
    })
    .filter(({ hasSar, hasReportYear }) => !(hasSar && hasReportYear));
  const countMatches = manifest.length === expectedTotal;
  const hasMissingFileName = manifest.some((entry) => !entry?.fileName);
  const hasMissingReference = manifest.some((entry) => !entry?.fileUrl);

  if (
    !countMatches ||
    hasMissingFileName ||
    hasMissingReference ||
    invalidFiles.length > 0
  ) {
    return {
      result: "Failed",
      reason:
        !countMatches
          ? "Preview row count changed after selecting All"
          : hasMissingReference
          ? "One or more preview rows has no document reference"
          : "One or more file names do not match the expected SAR report year",
      details: {
        reportYear,
        expectedTotal,
        fileCount: manifest.length,
        countMatches,
        hasMissingFileName,
        hasMissingReference,
        invalidFiles,
      },
    };
  }

  const selection = await getPreviewParticipantSelections(page);
  const selectionCountsMatch =
    selection.count === expectedTotal &&
    selection.checkedCount === expectedTotal &&
    selection.enabledCount === expectedTotal;
  let selectionFingerprint = null;
  try {
    if (selectionCountsMatch) {
      selectionFingerprint = fingerprintPreviewParticipantSelections(
        selection.values
      );
    }
  } catch {}
  if (!selectionCountsMatch || !selectionFingerprint) {
    return {
      result: "Failed",
      reason: "Preview participant selection is incomplete or ambiguous",
      details: {
        expectedTotal,
        selectionCount: selection.count,
        checkedCount: selection.checkedCount,
        enabledCount: selection.enabledCount,
        selectionValuesValid: Boolean(selectionFingerprint),
      },
    };
  }

  // E) Resolver identidad desde el propio plan y verificar los bytes exactos
  // referenciados por Preview con el servicio OCR privado.
  const config = getDocumentGateConfig();
  jobCtx?.setStage?.("summary-annual:extract-plan-identity");
  const planIdentity = await extractPlanIdentity(page, meta.planId);
  jobCtx?.setStage?.("summary-annual:verify-preview-documents", {
    documentReferences: manifest.length,
  });
  const verification = await verifyPreviewDocuments({
    manifest,
    expectedDocument: meta.expectedDocument,
    planIdentity,
  });

  // F) Segunda lectura independiente del manifest y re-HEAD del objeto S3.
  // Esto reduce el TOCTOU antes del click aunque el POST del portal no acepte
  // un document/version id que permita eliminar por completo esa ventana.
  jobCtx?.setStage?.("summary-annual:recheck-preview-documents");
  assertSummaryPreviewUrl(page.url(), { planId: meta.planId });
  const finalRows = await waitForAllPreviewRows(page, { timeout: 10000 });
  const finalManifest = normalizePreviewManifest(await getPreviewManifest(page), {
    maxRows: config.maxRows,
  });
  if (
    finalRows.expectedTotal !== expectedTotal ||
    finalManifest.length !== expectedTotal ||
    fingerprintPreviewManifest(finalManifest) !==
      verification.manifestFingerprint
  ) {
    const error = new Error("SAR preview document verification failed");
    error.code = "SAR_PREVIEW_MANIFEST_CHANGED";
    throw error;
  }
  const finalSelection = await getPreviewParticipantSelections(page);
  let finalSelectionFingerprint = null;
  try {
    if (
      finalSelection.count === expectedTotal &&
      finalSelection.checkedCount === expectedTotal &&
      finalSelection.enabledCount === expectedTotal
    ) {
      finalSelectionFingerprint = fingerprintPreviewParticipantSelections(
        finalSelection.values
      );
    }
  } catch {}
  if (finalSelectionFingerprint !== selectionFingerprint) {
    const error = new Error("SAR preview participant selection changed");
    error.code = "SAR_PREVIEW_SELECTION_CHANGED";
    throw error;
  }
  await assertPreviewObjectsStable(verification.objects, {
    timeoutMs: config.timeoutMs,
  });

  const documentGate = {
    ...verification.documentGate,
    manifestStable: true,
    objectVersionStable: true,
  };

  if (meta.mode === "verify_only") {
    jobCtx?.setStage?.("summary-annual:verified-only");
    return {
      result: "Succeeded",
      reason: "SAR preview documents verified without triggering email",
      details: {
        mode: "verify_only",
        emailTriggered: false,
        reportYear,
        fileCount: manifest.length,
        documentGate,
      },
    };
  }

  // G) Validar el elemento observado y sólo entonces instalar el handler de
  // confirmación. La rama verify_only anterior nunca llega a este punto.
  const triggerContract = await page.$eval("#triggerEmail", (element) => {
    const href = new URL(element.getAttribute("href") || "", location.origin);
    return {
      tagName: element.tagName,
      origin: href.origin,
      pathname: href.pathname,
    };
  });
  if (
    triggerContract.tagName !== "A" ||
    triggerContract.origin !== "https://employer.forusall.com" ||
    triggerContract.pathname !== "/preview"
  ) {
    return {
      result: "Failed",
      reason: "Trigger Email control did not match the verified portal contract",
      details: { triggerContractMatched: false },
    };
  }

  // H) Trigger Email + confirmar y esperar regresar a /trigger_emails
  jobCtx?.setStage?.("summary-annual:trigger-email", { reportYear });
  const acceptDialog = (dialog) =>
    Promise.resolve()
      .then(() => dialog.accept())
      .catch(() => {});
  page.once("dialog", acceptDialog); // confirm(...)
  try {
    await page.click("#triggerEmail", { noWaitAfter: true });
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
            result: "Unknown Outcome",
            reason: "Did not return to /trigger_emails after Trigger Email",
            details: { stage: "post-click-navigation" },
          };
        }
      }
    }

    // I) El redirect no prueba que el servidor haya enviado los correos.
    // Exigir el flash explícito y dar precedencia a cualquier alerta de error.
    jobCtx?.setStage?.("summary-annual:verify-success");
    const alert = await page
      .waitForSelector(
        ".alert.alert-success, .alert.alert-danger, .alert.alert-error",
        { timeout: 8000 }
      )
      .catch(() => null);

    const alertState = alert
      ? await page
          .evaluate(() => {
            const errorAlert = document.querySelector(
              ".alert.alert-danger, .alert.alert-error"
            );
            const successAlert = document.querySelector(
              ".alert.alert-success"
            );
            return {
              errorMessage: errorAlert
                ? (errorAlert.textContent || "").trim() || "Unknown error"
                : null,
              successMessage: successAlert
                ? (successAlert.textContent || "").trim() ||
                  "Email triggered successfully"
                : null,
            };
          })
          .catch(() => ({ errorMessage: null, successMessage: null }))
      : { errorMessage: null, successMessage: null };

    if (alertState.errorMessage) {
      return {
        result: "Failed",
        reason: "Email trigger failed with error alert",
        details: { portalErrorDetected: true },
      };
    }

    if (!alertState.successMessage) {
      return {
        result: "Unknown Outcome",
        reason: "No success confirmation alert found after redirect",
        details: { stage: "post-click-confirmation" },
      };
    }

    jobCtx?.setStage?.("summary-annual:done");
    const completedAt = new Date().toISOString();
    return {
      result: "Succeeded",
      reason: `Succeeded on ${completedAt}`,
      details: {
        completedAt,
        mode: "send",
        emailTriggered: true,
        reportYear,
        fileCount: manifest.length,
        successConfirmed: true,
        documentGate,
      },
    };
  } catch {
    return {
      result: "Unknown Outcome",
      reason: "An exception occurred after Trigger Email was initiated",
      details: { stage: "post-click-exception" },
    };
  } finally {
    try {
      page.off?.("dialog", acceptDialog);
    } catch {}
  }
};

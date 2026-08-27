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
  assertSummaryTriggerUrl,
  validateSummaryAnnualFileName,
} = require("../validation");

const TRUSTED_TRIGGER_EMAILS_ORIGIN = "https://employer.forusall.com";
const TRUSTED_TRIGGER_EMAILS_PATH = "/trigger_emails";

function isTrustedTriggerEmailsUrl(value) {
  try {
    const url = value instanceof URL ? value : new URL(String(value || ""));
    return (
      url.origin === TRUSTED_TRIGGER_EMAILS_ORIGIN &&
      url.pathname === TRUSTED_TRIGGER_EMAILS_PATH
    );
  } catch {
    return false;
  }
}

// Esta función se serializa y ejecuta en el frame principal de Playwright.
// Debe permanecer autocontenida: no puede cerrar sobre helpers de Node.
function clickVerifiedSummaryTrigger(element, expected) {
  if (
    !expected ||
    !Number.isSafeInteger(expected.expectedTotal) ||
    expected.expectedTotal <= 0 ||
    !Array.isArray(expected.manifest) ||
    expected.manifest.length !== expected.expectedTotal ||
    !Array.isArray(expected.selectionValues) ||
    expected.selectionValues.length !== expected.expectedTotal ||
    element.tagName !== "A" ||
    element.getAttribute("href") !== expected.href ||
    window.location.href !== expected.previewUrl ||
    document.querySelectorAll("#triggerEmail").length !== 1 ||
    document.querySelector("#triggerEmail") !== element
  ) {
    throw new Error("SAR_TRIGGER_BINDING_CHANGED");
  }

  const table = document.querySelector("#data_list");
  const headers = Array.from(table?.querySelectorAll("thead th") || []);
  const headerIndex = (name) =>
    headers.findIndex(
      (header) =>
        String(header.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase() === name
    );
  const fileNameIndex = headerIndex("file name");
  const fileS3Index = headerIndex("file s3 loc");
  const rows = Array.from(
    table?.querySelectorAll('tbody tr[role="row"]') || []
  );
  if (
    !table ||
    fileNameIndex < 0 ||
    fileS3Index < 0 ||
    rows.length !== expected.expectedTotal
  ) {
    throw new Error("SAR_PRE_CLICK_STATE_CHANGED");
  }

  let manifest;
  try {
    manifest = rows.map((row, index) => {
      const cells = Array.from(row.querySelectorAll("td"));
      const nameCell = cells[fileNameIndex] || null;
      const locationCell = cells[fileS3Index] || null;
      const anchor = locationCell?.querySelector?.("a[href]") || null;
      const fileName = String(nameCell?.textContent || "").trim();
      const rawFileUrl = String(
        anchor?.href ||
          anchor?.getAttribute?.("href") ||
          locationCell?.textContent ||
          ""
      ).trim();
      const fileUrl = new URL(rawFileUrl.replaceAll("&amp;", "&")).href;
      return { rowNumber: index + 1, fileName, fileUrl };
    });
  } catch {
    throw new Error("SAR_PRE_CLICK_STATE_CHANGED");
  }

  const checkboxes = Array.from(
    table.querySelectorAll('tbody input.participant_checks[type="checkbox"]')
  );
  const selectionValues = checkboxes.map((item) =>
    String(item.value || "").trim()
  );
  const selectionIsComplete =
    checkboxes.length === expected.expectedTotal &&
    checkboxes.every((item) => item.checked && !item.disabled);
  if (
    JSON.stringify(manifest) !== JSON.stringify(expected.manifest) ||
    !selectionIsComplete ||
    JSON.stringify(selectionValues) !== JSON.stringify(expected.selectionValues)
  ) {
    throw new Error("SAR_PRE_CLICK_STATE_CHANGED");
  }

  element.click();
}

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
        reportYear,
        meta.planId
      );
      return { rowNumber: index + 1, ...validation };
    })
    .filter(
      ({ hasSar, hasReportYear, hasPlanId }) =>
        !(hasSar && hasReportYear && hasPlanId)
    );
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
          : "One or more file names do not match the expected SAR plan and report year",
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

  // G) El enlace final debe seguir ligado exactamente a la Preview verificada.
  // El portal activa el envío cambiando únicamente force_send=false a true.
  // Esta barrera también se ejecuta en verify_only para que el dry-run pruebe
  // el mismo contrato que la rama de envío.
  jobCtx?.setStage?.("summary-annual:validate-trigger-contract");
  let triggerBinding;
  try {
    const previewUrl = page.url();
    const triggerControl = await page.$eval("#triggerEmail", (element) => ({
      tagName: element.tagName,
      href: element.getAttribute("href"),
    }));
    if (triggerControl.tagName !== "A") {
      throw new Error("Trigger Email control is not an anchor");
    }
    assertSummaryTriggerUrl(previewUrl, triggerControl.href, {
      planId: meta.planId,
    });
    triggerBinding = {
      previewUrl,
      href: triggerControl.href,
      expectedTotal,
      manifest: finalManifest,
      selectionValues: finalSelection.values,
    };
  } catch {
    return {
      result: "Failed",
      reason: "Trigger Email control did not match the verified portal contract",
      details: { triggerContractMatched: false },
    };
  }

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
        triggerContractMatched: true,
        documentGate,
      },
    };
  }

  // H) Trigger Email + confirmar y esperar regresar a /trigger_emails.
  jobCtx?.setStage?.("summary-annual:trigger-email", { reportYear });
  const acceptDialog = (dialog) =>
    Promise.resolve()
      .then(() => dialog.accept())
      .catch(() => {});
  page.once("dialog", acceptDialog); // confirm(...)
  try {
    // Comprobar y activar el mismo nodo dentro de una única tarea del browser
    // evita que el DOM cambie el href o la Preview entre la barrera y el click.
    await page.$eval(
      "#triggerEmail",
      clickVerifiedSummaryTrigger,
      triggerBinding
    );
    let redirected = await waitForUrl(page, isTrustedTriggerEmailsUrl, {
      timeout: 20000,
    });

    if (!redirected) {
      redirected = await waitForUrl(page, isTrustedTriggerEmailsUrl, {
        timeout: 15000,
      });
      if (!redirected) {
        const shell = await page
          .waitForSelector("#trigger-emails", { timeout: 8000 })
          .catch(() => null);
        if (!shell && !isTrustedTriggerEmailsUrl(page.url())) {
          return {
            result: "Unknown Outcome",
            reason:
              "Did not return to the trusted /trigger_emails page after Trigger Email",
            details: { stage: "post-click-navigation" },
          };
        }
      }
    }

    if (!isTrustedTriggerEmailsUrl(page.url())) {
      return {
        result: "Unknown Outcome",
        reason:
          "Did not return to the trusted /trigger_emails page after Trigger Email",
        details: { stage: "post-click-navigation" },
      };
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

    if (!isTrustedTriggerEmailsUrl(page.url())) {
      return {
        result: "Unknown Outcome",
        reason:
          "Post-click confirmation was not on the trusted /trigger_emails page",
        details: { stage: "post-click-confirmation-origin" },
      };
    }

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
        triggerContractMatched: true,
        documentGate,
      },
    };
  } catch (error) {
    if (String(error?.message || "").includes("SAR_PRE_CLICK_STATE_CHANGED")) {
      return {
        result: "Failed",
        reason: "Preview state changed after document verification",
        details: {
          manifestStable: false,
          selectionStable: false,
          emailTriggered: false,
        },
      };
    }
    if (String(error?.message || "").includes("SAR_TRIGGER_BINDING_CHANGED")) {
      return {
        result: "Failed",
        reason: "Trigger Email control changed after portal validation",
        details: { triggerContractMatched: false },
      };
    }
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

module.exports.clickVerifiedSummaryTrigger = clickVerifiedSummaryTrigger;
module.exports.isTrustedTriggerEmailsUrl = isTrustedTriggerEmailsUrl;

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
  assertSummaryJavascriptTriggerUrl,
  assertSummaryTriggerUrl,
  validateSummaryAnnualFileName,
} = require("../validation");

const TRUSTED_TRIGGER_EMAILS_ORIGIN = "https://employer.forusall.com";
const TRUSTED_TRIGGER_EMAILS_PATH = "/trigger_emails";
const TRUSTED_TRIGGER_PROCESS_PATH = "/trigger_email_process";
const TRIGGER_CLICK_ROUTE_PATTERN = "**/*";
const TRIGGER_CONTRACT_QUERY = "force_send_query_v1";
const TRIGGER_CONTRACT_JQUERY = "jquery_post_v1";
const TRIGGER_JQUERY_HANDLER_SOURCE_VERSION = "jquery_post_source_v1";
const TRIGGER_SUCCESS_MESSAGE =
  "Background job has been scheduled. You will receive an email shortly with the logs once the job completes.";
const MAX_TRIGGER_RESPONSE_BYTES = 2_000_000;
const TRIGGER_POST_KEYS = [
  "attachments",
  "conversation_id",
  "email_type",
  "enrolled",
  "generic_comm_type",
  "not_enrolled",
  "participants_list",
  "plan",
  "plan_snapshot",
  "prior_date",
  "quarter",
  "terminated",
  "year",
];
const TRIGGER_POST_PREVIEW_KEYS = [
  "attachments",
  "conversation_id",
  "enrolled",
  "generic_comm_type",
  "not_enrolled",
  "plan_snapshot",
  "quarter",
  "terminated",
  "year",
];

function isTrustedTriggerEmailsUrl(value) {
  try {
    const url = value instanceof URL ? value : new URL(String(value || ""));
    return (
      !url.username &&
      !url.password &&
      url.origin === TRUSTED_TRIGGER_EMAILS_ORIGIN &&
      url.pathname === TRUSTED_TRIGGER_EMAILS_PATH
    );
  } catch {
    return false;
  }
}

function isTrustedTriggerProcessRequest(request) {
  try {
    const url = new URL(request.url());
    return (
      request.method() === "POST" &&
      !url.username &&
      !url.password &&
      url.origin === TRUSTED_TRIGGER_EMAILS_ORIGIN &&
      url.pathname === TRUSTED_TRIGGER_PROCESS_PATH &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function isTrustedTriggerRedirectRequest(request, processRequest) {
  try {
    const url = new URL(request.url());
    return (
      request.method() === "GET" &&
      !url.username &&
      !url.password &&
      url.origin === TRUSTED_TRIGGER_EMAILS_ORIGIN &&
      url.pathname === TRUSTED_TRIGGER_EMAILS_PATH &&
      request.redirectedFrom() === processRequest &&
      isTrustedTriggerProcessRequest(processRequest)
    );
  } catch {
    return false;
  }
}

function isTrustedTriggerRedirectResponse(response) {
  try {
    const request = response.request();
    const redirectedFrom = request.redirectedFrom();
    return Boolean(
      redirectedFrom &&
        isTrustedTriggerRedirectRequest(request, redirectedFrom)
    );
  } catch {
    return false;
  }
}

function observePortalJavascriptTriggerResponses(
  page,
  { timeout = 60000, onTrustedRedirectResponse = null } = {}
) {
  let processResponse = null;
  let settled = false;
  let timeoutHandle = null;
  let resolveWait;
  let rejectWait;

  const cleanup = () => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    timeoutHandle = null;
    page.off?.("response", onResponse);
  };
  const settle = (callback, value) => {
    if (settled) return;
    settled = true;
    cleanup();
    callback(value);
  };
  const onResponse = (response) => {
    if (!processResponse && isTrustedTriggerProcessRequest(response.request())) {
      processResponse = response;
      return;
    }
    if (
      processResponse &&
      isTrustedTriggerRedirectResponse(response) &&
      response.request().redirectedFrom() === processResponse.request()
    ) {
      if (
        typeof onTrustedRedirectResponse === "function" &&
        onTrustedRedirectResponse(response) !== true
      ) {
        settle(rejectWait, new Error("SAR_TRIGGER_REDIRECT_GUARD_MISMATCH"));
        return;
      }
      settle(resolveWait, { processResponse, redirectResponse: response });
    }
  };
  const promise = new Promise((resolve, reject) => {
    resolveWait = resolve;
    rejectWait = reject;
  });

  page.on("response", onResponse);
  timeoutHandle = setTimeout(
    () => settle(rejectWait, new Error("SAR_TRIGGER_RESPONSE_TIMEOUT")),
    timeout
  );

  return {
    promise,
    cancel() {
      settle(resolveWait, null);
    },
  };
}

function validatePortalJavascriptTriggerRequest(request, expected) {
  try {
    const expectedPostValues = expected?.expectedPostValues;
    if (
      !expected ||
      !expectedPostValues ||
      typeof expectedPostValues !== "object" ||
      Object.keys(expectedPostValues).sort().some(
        (key, index) => key !== TRIGGER_POST_KEYS[index]
      ) ||
      Object.keys(expectedPostValues).length !== TRIGGER_POST_KEYS.length ||
      !isTrustedTriggerProcessRequest(request)
    ) {
      return { matched: false, failureCode: "trigger_request_contract_mismatch" };
    }
    const postData = request.postData();
    if (typeof postData !== "string" || !postData) {
      return { matched: false, failureCode: "trigger_request_body_missing" };
    }
    const params = new URLSearchParams(postData);
    const postKeys = [...new Set(params.keys())].sort();
    if (
      postKeys.length !== TRIGGER_POST_KEYS.length ||
      postKeys.some((key, index) => key !== TRIGGER_POST_KEYS[index]) ||
      TRIGGER_POST_KEYS.some((key) => params.getAll(key).length !== 1)
    ) {
      return { matched: false, failureCode: "trigger_request_shape_mismatch" };
    }
    const exact = (key, value) => params.get(key) === String(value);
    if (
      !exact("plan", expected.expectedPlanId) ||
      !exact("email_type", expected.expectedEmailType) ||
      !exact("year", expected.expectedPreviewYear) ||
      !exact("participants_list", expected.selectionValues.join(","))
    ) {
      return { matched: false, failureCode: "trigger_request_identity_mismatch" };
    }
    if (
      TRIGGER_POST_KEYS.some(
        (key) => !exact(key, expectedPostValues[key])
      )
    ) {
      return { matched: false, failureCode: "trigger_request_value_mismatch" };
    }
    return { matched: true, failureCode: null };
  } catch {
    return { matched: false, failureCode: "trigger_request_validation_failed" };
  }
}

async function installPortalJavascriptTriggerRequestGuard(page, expected) {
  const mainFrame = page.mainFrame?.();
  if (!mainFrame) {
    throw new Error("SAR_TRIGGER_MAIN_FRAME_UNAVAILABLE");
  }
  let allowedRequestCount = 0;
  let blockedRequestCount = 0;
  let suppressedAfterRedirectCount = 0;
  let allowedProcessRequest = null;
  let redirectObserved = false;
  let removed = false;
  let notifyBlocked;
  const blocked = new Promise((resolve) => {
    notifyBlocked = resolve;
  });
  const handler = async (route) => {
    try {
      const request = route.request();
      const initiatorMatched =
        request.resourceType?.() === "xhr" &&
        request.isNavigationRequest?.() === false &&
        request.frame?.() === mainFrame;
      const contract = initiatorMatched
        ? validatePortalJavascriptTriggerRequest(request, expected)
        : {
            matched: false,
            failureCode: "trigger_request_initiator_mismatch",
          };
      if (
        contract.matched &&
        allowedRequestCount === 0 &&
        blockedRequestCount === 0
      ) {
        allowedRequestCount += 1;
        allowedProcessRequest = request;
        await route.continue();
        return;
      }

      if (redirectObserved) {
        const resourceType = String(request.resourceType?.() || "");
        const safePageResource =
          ["font", "image", "media", "script", "stylesheet"].includes(
            resourceType
          ) && ["GET", "HEAD"].includes(request.method());
        if (safePageResource) {
          suppressedAfterRedirectCount += 1;
          await route.abort("blockedbyclient");
          return;
        }
      }

      blockedRequestCount += 1;
      await route.abort("blockedbyclient");
      notifyBlocked(
        (contract.matched && "trigger_request_duplicate") ||
          contract.failureCode ||
          (allowedProcessRequest
            ? "trigger_unexpected_request_before_redirect"
            : "trigger_unexpected_request_before_post")
      );
    } catch {
      blockedRequestCount += 1;
      await route.abort("blockedbyclient").catch(() => {});
      notifyBlocked("trigger_request_guard_failed");
    }
  };

  await page.route(TRIGGER_CLICK_ROUTE_PATTERN, handler);
  return {
    blocked,
    markRedirectObserved(response) {
      if (
        redirectObserved ||
        !allowedProcessRequest ||
        !isTrustedTriggerRedirectResponse(response) ||
        response.request().redirectedFrom() !== allowedProcessRequest
      ) {
        return false;
      }
      redirectObserved = true;
      return true;
    },
    snapshot() {
      return {
        allowedRequestCount,
        redirectObserved,
        blockedRequestCount,
        suppressedAfterRedirectCount,
      };
    },
    async remove() {
      if (removed) return;
      removed = true;
      await page.unroute(TRIGGER_CLICK_ROUTE_PATTERN, handler);
    },
  };
}

async function validatePortalJavascriptTriggerResponse(
  processResponse,
  redirectResponse,
  expected
) {
  try {
    if (
      !processResponse ||
      !redirectResponse ||
      !expected ||
      !isTrustedTriggerRedirectResponse(redirectResponse) ||
      redirectResponse.request().redirectedFrom() !== processResponse.request() ||
      ![302, 303].includes(processResponse.status()) ||
      redirectResponse.status() !== 200
    ) {
      return { matched: false, failureCode: "trigger_response_contract_mismatch" };
    }

    const requestContract = validatePortalJavascriptTriggerRequest(
      processResponse.request(),
      expected
    );
    if (!requestContract.matched) return requestContract;

    const headers = await processResponse.headers();
    const location = new URL(
      String(headers.location || ""),
      processResponse.url()
    );
    if (
      location.username ||
      location.password ||
      location.origin !== TRUSTED_TRIGGER_EMAILS_ORIGIN ||
      location.pathname !== TRUSTED_TRIGGER_EMAILS_PATH
    ) {
      return { matched: false, failureCode: "trigger_redirect_location_mismatch" };
    }

    const body = await redirectResponse.text();
    if (
      typeof body !== "string" ||
      Buffer.byteLength(body, "utf8") > MAX_TRIGGER_RESPONSE_BYTES
    ) {
      return { matched: false, failureCode: "trigger_success_not_confirmed" };
    }
    const escapedSuccessMessage = TRIGGER_SUCCESS_MESSAGE.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
    const exactSuccessFlash = new RegExp(
      `<div\\s+id=["']flash_notice["']\\s*>\\s*${escapedSuccessMessage}\\s*</div>`,
      "u"
    );
    const failureFlash = /id=["']flash_(?:error|warning)["']/u;
    if (failureFlash.test(body)) {
      return { matched: false, failureCode: "trigger_error_flash_present" };
    }
    if (!exactSuccessFlash.test(body)) {
      return { matched: false, failureCode: "trigger_success_not_confirmed" };
    }
    return { matched: true, failureCode: null };
  } catch {
    return { matched: false, failureCode: "trigger_response_validation_failed" };
  }
}

// Esta función se serializa y ejecuta en el frame principal de Playwright.
// Sólo devuelve señales allowlisted; nunca expone el source del handler.
async function inspectSummaryTriggerControl(element) {
  let jqueryHandlerMatched = false;
  let directClickHandlerCount = 0;
  let jqueryHandlerSourceVersion = null;
  try {
    const events = window.jQuery?._data?.(element, "events") || {};
    const clickHandlers = Array.isArray(events.click) ? events.click : [];
    const directHandlers = clickHandlers.filter((entry) => !entry?.selector);
    directClickHandlerCount = directHandlers.length;
    if (directHandlers.length === 1 && window.crypto?.subtle) {
      const source = Function.prototype.toString.call(
        directHandlers[0].handler
      );
      const digest = await window.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(source)
      );
      const sourceSha256 = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("");
      jqueryHandlerMatched =
        sourceSha256 ===
        "e07143f923433949732f572fb892ddd6ebec2068e660c0a1f6e381293c39d118";
    }
    if (jqueryHandlerMatched) {
      jqueryHandlerSourceVersion = "jquery_post_source_v1";
    }
  } catch {}
  return {
    tagName: element.tagName,
    href: element.getAttribute("href"),
    jqueryHandlerMatched,
    jqueryHandlerSourceVersion,
    directClickHandlerCount,
    planValue: document.querySelector("#plan")?.value ?? null,
    emailTypeValue: document.querySelector("#email_type")?.value ?? null,
    conversationIdValue:
      document.querySelector("#conversation_id")?.value ?? null,
    priorDateValue: document.querySelector("#prior_date")?.value ?? null,
  };
}

// Esta función se serializa y ejecuta en el frame principal de Playwright.
// Debe permanecer autocontenida: no puede cerrar sobre helpers de Node.
async function clickVerifiedSummaryTrigger(element, expected) {
  const triggerContractIsQuery =
    expected?.triggerContractVersion === "force_send_query_v1";
  const triggerContractIsJquery =
    expected?.triggerContractVersion === "jquery_post_v1";
  if (
    !expected ||
    !Number.isSafeInteger(expected.expectedTotal) ||
    expected.expectedTotal <= 0 ||
    !Array.isArray(expected.manifest) ||
    expected.manifest.length !== expected.expectedTotal ||
    !Array.isArray(expected.selectionValues) ||
    expected.selectionValues.length !== expected.expectedTotal ||
    (!triggerContractIsQuery && !triggerContractIsJquery) ||
    element.tagName !== "A" ||
    element.getAttribute("href") !== expected.href ||
    window.location.href !== expected.previewUrl ||
    document.querySelectorAll("#triggerEmail").length !== 1 ||
    document.querySelector("#triggerEmail") !== element
  ) {
    throw new Error("SAR_TRIGGER_BINDING_CHANGED");
  }

  let verifiedJqueryHandler = null;
  if (triggerContractIsJquery) {
    let jqueryHandlerMatched = false;
    let triggerUrl;
    try {
      const previewUrl = new URL(expected.previewUrl);
      triggerUrl = new URL(element.getAttribute("href"), previewUrl);
      const events = window.jQuery?._data?.(element, "events") || {};
      const clickHandlers = Array.isArray(events.click) ? events.click : [];
      const directHandlers = clickHandlers.filter((entry) => !entry?.selector);
      if (directHandlers.length === 1) {
        verifiedJqueryHandler = directHandlers[0]?.handler || null;
      }
      let sourceSha256 = null;
      if (verifiedJqueryHandler && window.crypto?.subtle) {
        const source = Function.prototype.toString.call(verifiedJqueryHandler);
        const digest = await window.crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(source)
        );
        sourceSha256 = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0")
        ).join("");
      }
      jqueryHandlerMatched = Boolean(
        verifiedJqueryHandler &&
          expected.jqueryHandlerSourceVersion === "jquery_post_source_v1" &&
          sourceSha256 ===
            "e07143f923433949732f572fb892ddd6ebec2068e660c0a1f6e381293c39d118"
      );
      const planInputs = document.querySelectorAll("#plan");
      const emailTypeInputs = document.querySelectorAll("#email_type");
      const conversationInputs = document.querySelectorAll("#conversation_id");
      const priorDateInputs = document.querySelectorAll("#prior_date");
      if (
        triggerUrl.origin !== previewUrl.origin ||
        triggerUrl.pathname !== previewUrl.pathname ||
        triggerUrl.search !== "" ||
        triggerUrl.hash !== "" ||
        !jqueryHandlerMatched ||
        planInputs.length !== 1 ||
        emailTypeInputs.length !== 1 ||
        conversationInputs.length !== 1 ||
        priorDateInputs.length !== 1 ||
        String(planInputs[0].value || "") !== String(expected.expectedPlanId) ||
        String(emailTypeInputs[0].value || "") !== expected.expectedEmailType ||
        String(conversationInputs[0].value || "") !==
          expected.expectedPostValues?.conversation_id ||
        String(priorDateInputs[0].value || "") !==
          expected.expectedPostValues?.prior_date
      ) {
        throw new Error("SAR_TRIGGER_BINDING_CHANGED");
      }
    } catch {
      throw new Error("SAR_TRIGGER_BINDING_CHANGED");
    }
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
  const globalParticipantChecks = Array.from(
    document.querySelectorAll(".participant_checks")
  );
  const selectionValues = checkboxes.map((item) =>
    String(item.value || "").trim()
  );
  const selectionIsComplete =
    checkboxes.length === expected.expectedTotal &&
    checkboxes.every((item) => item.checked && !item.disabled);
  const participantNodeSetIsExact =
    globalParticipantChecks.length === checkboxes.length &&
    globalParticipantChecks.every((item, index) => item === checkboxes[index]);
  if (
    JSON.stringify(manifest) !== JSON.stringify(expected.manifest) ||
    !selectionIsComplete ||
    !participantNodeSetIsExact ||
    JSON.stringify(selectionValues) !== JSON.stringify(expected.selectionValues)
  ) {
    throw new Error("SAR_PRE_CLICK_STATE_CHANGED");
  }

  if (triggerContractIsJquery) verifiedJqueryHandler.call(element);
  else element.click();
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
  const fileNameValidations = manifest.map((entry, index) => {
    const validation = validateSummaryAnnualFileName(
      entry?.fileName,
      reportYear,
      meta.planId
    );
    return { rowNumber: index + 1, ...validation };
  });
  // verify_only may continue without a plan id in the filename so the stronger
  // content gate can classify the exact PDF. Live send remains strict until a
  // collision audit proves that portal identity + EIN + year is unique.
  const requireFileNamePlanId = meta?.mode !== "verify_only";
  const invalidFiles = fileNameValidations.filter(
    ({ hasSar, hasReportYear, hasPlanId }) =>
      !(hasSar && hasReportYear && (hasPlanId || !requireFileNamePlanId))
  );
  const filenamePlanIdUnmatchedCount = fileNameValidations.filter(
    ({ hasSar, hasReportYear, hasPlanId }) =>
      hasSar && hasReportYear && !hasPlanId
  ).length;
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

  if (meta?.mode === "verify_only" && filenamePlanIdUnmatchedCount > 0) {
    jobCtx?.setStage?.("summary-annual:filename-plan-id-unmatched-advisory", {
      count: filenamePlanIdUnmatchedCount,
    });
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

  // G) El control final debe seguir ligado exactamente a la Preview verificada.
  // Se aceptan el contrato query legacy o el único handler jQuery oficial.
  // Esta barrera también se ejecuta en verify_only para que el dry-run pruebe
  // el mismo contrato que la rama de envío.
  jobCtx?.setStage?.("summary-annual:validate-trigger-contract");
  let triggerBinding;
  let triggerContractDiagnostic = {
    matched: false,
    failureCode: "trigger_control_lookup_failed",
  };
  try {
    const previewUrl = page.url();
    const triggerControl = await page.$eval(
      "#triggerEmail",
      inspectSummaryTriggerControl
    );
    if (triggerControl.tagName !== "A") {
      triggerContractDiagnostic = {
        matched: false,
        failureCode: "trigger_control_not_anchor",
      };
      throw new Error("Trigger Email control is not an anchor");
    }
    if (typeof triggerControl.href !== "string" || !triggerControl.href.trim()) {
      triggerContractDiagnostic = {
        matched: false,
        failureCode: "trigger_control_href_missing",
      };
      throw new Error("Trigger Email control has no href");
    }
    let triggerContractVersion = TRIGGER_CONTRACT_QUERY;
    try {
      assertSummaryTriggerUrl(previewUrl, triggerControl.href, {
        planId: meta.planId,
      });
    } catch (error) {
      triggerContractDiagnostic = error?.safeDiagnostic || {
        matched: false,
        failureCode: "trigger_url_contract_mismatch",
      };
      if (
        !triggerControl.jqueryHandlerMatched ||
        triggerControl.jqueryHandlerSourceVersion !==
          TRIGGER_JQUERY_HANDLER_SOURCE_VERSION ||
        triggerControl.directClickHandlerCount !== 1
      ) {
        throw error;
      }
      try {
        assertSummaryJavascriptTriggerUrl(previewUrl, triggerControl.href, {
          planId: meta.planId,
        });
      } catch {
        triggerContractDiagnostic = {
          matched: false,
          failureCode: "javascript_trigger_location_mismatch",
        };
        throw error;
      }
      if (String(triggerControl.planValue || "") !== String(meta.planId)) {
        triggerContractDiagnostic = {
          matched: false,
          failureCode: "javascript_trigger_plan_mismatch",
        };
        throw error;
      }
      if (triggerControl.emailTypeValue !== "summary_annual_notice") {
        triggerContractDiagnostic = {
          matched: false,
          failureCode: "javascript_trigger_email_type_mismatch",
        };
        throw error;
      }
      triggerContractVersion = TRIGGER_CONTRACT_JQUERY;
    }
    const previewParams = new URL(previewUrl).searchParams;
    const previewYearValues = previewParams.getAll("year");
    if (previewYearValues.length !== 1 || !/^\d{4}$/.test(previewYearValues[0])) {
      triggerContractDiagnostic = {
        matched: false,
        failureCode: "preview_trigger_year_ambiguous",
      };
      throw new Error("Preview trigger year is ambiguous");
    }
    let expectedPostValues = null;
    if (triggerContractVersion === TRIGGER_CONTRACT_JQUERY) {
      const previewPostValues = {};
      for (const key of TRIGGER_POST_PREVIEW_KEYS) {
        const values = previewParams.getAll(key);
        if (values.length !== 1) {
          triggerContractDiagnostic = {
            matched: false,
            failureCode: "preview_trigger_post_context_ambiguous",
          };
          throw new Error("Preview trigger POST context is ambiguous");
        }
        previewPostValues[key] = values[0];
      }
      if (
        String(triggerControl.conversationIdValue ?? "") !==
        previewPostValues.conversation_id
      ) {
        triggerContractDiagnostic = {
          matched: false,
          failureCode: "javascript_trigger_conversation_mismatch",
        };
        throw new Error("Preview conversation binding changed");
      }
      expectedPostValues = {
        ...previewPostValues,
        participants_list: finalSelection.values.join(","),
        plan: String(meta.planId),
        email_type: "summary_annual_notice",
        prior_date: String(triggerControl.priorDateValue ?? ""),
      };
    }
    triggerBinding = {
      previewUrl,
      href: triggerControl.href,
      triggerContractVersion,
      expectedTotal,
      manifest: finalManifest,
      selectionValues: finalSelection.values,
      expectedPlanId: meta.planId,
      expectedEmailType: "summary_annual_notice",
      expectedPreviewYear: previewYearValues[0],
      expectedPostValues,
      jqueryHandlerSourceVersion:
        triggerContractVersion === TRIGGER_CONTRACT_JQUERY
          ? triggerControl.jqueryHandlerSourceVersion
          : null,
    };
  } catch {
    jobCtx?.setStage?.(
      "summary-annual:trigger-contract-rejected",
      triggerContractDiagnostic
    );
    return {
      result: "Failed",
      reason: `Trigger Email control did not match the verified portal contract (${triggerContractDiagnostic.failureCode})`,
      details: {
        triggerContractMatched: false,
        triggerContractDiagnostic,
      },
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
        filenamePlanIdUnmatchedCount,
        triggerContractMatched: true,
        triggerContractVersion: triggerBinding.triggerContractVersion,
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
  let triggerResponseObserver = null;
  let triggerRequestGuard = null;
  try {
    if (triggerBinding.triggerContractVersion === TRIGGER_CONTRACT_JQUERY) {
      triggerRequestGuard =
        await installPortalJavascriptTriggerRequestGuard(page, triggerBinding);
      triggerResponseObserver = observePortalJavascriptTriggerResponses(page, {
        onTrustedRedirectResponse: (response) =>
          triggerRequestGuard.markRedirectObserved(response),
      });
    }
    // Comprobar y activar el mismo nodo dentro de una única tarea del browser
    // evita que el DOM cambie el href o la Preview entre la barrera y el click.
    await page.$eval(
      "#triggerEmail",
      clickVerifiedSummaryTrigger,
      triggerBinding
    );
    if (triggerBinding.triggerContractVersion === TRIGGER_CONTRACT_JQUERY) {
      const observed = await Promise.race([
        triggerResponseObserver.promise.then((capturedResponses) => ({
          kind: "responses",
          capturedResponses,
        })),
        triggerRequestGuard.blocked.then((failureCode) => ({
          kind: "blocked",
          failureCode,
        })),
      ]);
      if (observed.kind === "blocked") {
        return {
          result: "Unknown Outcome",
          reason: "Portal trigger request was blocked before reaching the server",
          details: {
            stage: "pre-network-request-contract",
            failureCode: observed.failureCode,
          },
        };
      }
      const { capturedResponses } = observed;
      if (!capturedResponses) throw new Error("SAR_TRIGGER_RESPONSE_CANCELLED");
      const { processResponse, redirectResponse } = capturedResponses;
      const responseContract = await validatePortalJavascriptTriggerResponse(
        processResponse,
        redirectResponse,
        triggerBinding
      );
      jobCtx?.setStage?.(
        "summary-annual:verify-trigger-response",
        responseContract
      );
      if (!responseContract.matched) {
        return {
          result: "Unknown Outcome",
          reason:
            "Portal trigger response did not prove that the background job was scheduled",
          details: {
            stage: "post-click-response-contract",
            failureCode: responseContract.failureCode,
          },
        };
      }
      await page.waitForTimeout?.(100);
      const requestGuardState = triggerRequestGuard.snapshot();
      if (
        requestGuardState.allowedRequestCount !== 1 ||
        requestGuardState.redirectObserved !== true ||
        requestGuardState.blockedRequestCount !== 0
      ) {
        return {
          result: "Unknown Outcome",
          reason: "Portal trigger emitted an unexpected number of requests",
          details: {
            stage: "post-click-request-count",
            failureCode: "trigger_request_count_mismatch",
          },
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
          triggerContractVersion: triggerBinding.triggerContractVersion,
          documentGate,
        },
      };
    }
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
        filenamePlanIdUnmatchedCount,
        successConfirmed: true,
        triggerContractMatched: true,
        triggerContractVersion: triggerBinding.triggerContractVersion,
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
    triggerResponseObserver?.cancel();
    if (triggerRequestGuard) {
      await triggerRequestGuard.remove().catch(() => {});
    }
    try {
      page.off?.("dialog", acceptDialog);
    } catch {}
  }
};

module.exports.clickVerifiedSummaryTrigger = clickVerifiedSummaryTrigger;
module.exports.inspectSummaryTriggerControl = inspectSummaryTriggerControl;
module.exports.isTrustedTriggerEmailsUrl = isTrustedTriggerEmailsUrl;
module.exports.isTrustedTriggerProcessRequest = isTrustedTriggerProcessRequest;
module.exports.isTrustedTriggerRedirectRequest = isTrustedTriggerRedirectRequest;
module.exports.isTrustedTriggerRedirectResponse = isTrustedTriggerRedirectResponse;
module.exports.observePortalJavascriptTriggerResponses =
  observePortalJavascriptTriggerResponses;
module.exports.validatePortalJavascriptTriggerRequest =
  validatePortalJavascriptTriggerRequest;
module.exports.installPortalJavascriptTriggerRequestGuard =
  installPortalJavascriptTriggerRequestGuard;
module.exports.validatePortalJavascriptTriggerResponse =
  validatePortalJavascriptTriggerResponse;

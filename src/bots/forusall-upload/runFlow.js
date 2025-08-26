// src/bots/forusall-upload/runFlow.js
const speakeasy = require("speakeasy");
const {
  launchBrowser,
  createContext,
  safeClose,
} = require("../../engine/browser");
const {
  SITE_USER,
  SITE_PASS,
  TOTP_SECRET,
  TOTP_STEP_SECONDS,
} = require("../../config"); // incluye step
const { buildUploadUrl } = require("../../engine/utils/url");
const { saveEvidence } = require("../../engine/evidence");
const {
  waitForOptionFlex,
  selectByText,
} = require("../../engine/utils/select");
const { setEffectiveDate } = require("../../engine/utils/date");
const { waitForFormCleared } = require("../../engine/utils/verify"); // ⬅️ nuevo verificador post-submit

// Login lock / introspección
const {
  acquireLogin,
  waitNewTotpWindowIfNeeded,
  markTotpUsed,
} = require("../../engine/loginLock");

/**
 * Ejecuta el flujo completo del bot de upload.
 * @param {{ meta, localFilePath?: string, filePayload?: {name, mimeType, buffer}, warnings?: string[], jobCtx?: {jobId, setStage(name, meta?)} }} args
 */
module.exports = async function runFlow({
  meta,
  localFilePath,
  filePayload,
  warnings = [],
  jobCtx,
}) {
  const { loginUrl, uploadUrlTemplate, planId, selectors, formData, options } =
    meta;

  if (!SITE_USER || !SITE_PASS || !TOTP_SECRET) {
    throw new Error(
      "Faltan SITE_USER, SITE_PASS o TOTP_SECRET en variables de entorno"
    );
  }

  let browser, context, page;
  try {
    browser = await launchBrowser();
    context = await createContext(browser);
    page = await context.newPage();
    page.on("dialog", (d) => d.dismiss().catch(() => {}));

    // ---------- Login ----------
    jobCtx?.setStage?.("login");
    await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
    await page.fill(selectors.user, SITE_USER);
    await page.fill(selectors.pass, SITE_PASS);

    await Promise.all([
      page.waitForLoadState("networkidle"),
      page.click(selectors.loginButton),
    ]);

    // ---------- OTP (serializado por usuario + evita reusar el mismo step) ----------
    jobCtx?.setStage?.("otp", { otpLock: "waiting" });
    const otpWaitStart = Date.now();

    const release = await acquireLogin(SITE_USER);
    try {
      const waitedSec = Math.floor((Date.now() - otpWaitStart) / 1000);
      jobCtx?.setStage?.("otp", {
        otpLock: "holder",
        waitedSeconds: waitedSec,
      });

      await waitNewTotpWindowIfNeeded(SITE_USER);

      await page.waitForSelector(selectors.otpInput, { timeout: 30000 });
      let otpOk = false;

      const step = Number(TOTP_STEP_SECONDS || 30);
      const candidates = [
        speakeasy.totp({
          secret: TOTP_SECRET,
          encoding: "base32",
          step,
          window: 0,
        }),
        speakeasy.totp({
          secret: TOTP_SECRET,
          encoding: "base32",
          step,
          window: 1,
        }),
      ];

      for (const code of candidates) {
        await page.fill(selectors.otpInput, code);
        await page.click(selectors.otpSubmit);
        try {
          await page.waitForLoadState("networkidle", { timeout: 5000 });
          otpOk = true;
          break;
        } catch {}
      }

      if (!otpOk) throw new Error("No fue posible validar el OTP");

      markTotpUsed(SITE_USER);
    } finally {
      release();
    }

    const loginShot = await saveEvidence(page, "login", options);

    // ---------- Página de carga ----------
    jobCtx?.setStage?.("goto-upload");
    const uploadUrl = buildUploadUrl(uploadUrlTemplate, planId);
    await page.goto(uploadUrl, { waitUntil: "domcontentloaded" });

    const fsel = selectors.form || {};

    // ---------- Form ----------
    jobCtx?.setStage?.("fill-form", {
      section: formData.section,
      caption: formData.caption,
      status: formData.status,
      effectiveDate: formData.effectiveDate,
    });

    await selectByText(
      page,
      fsel.section || "#fv_header_title",
      formData.section
    );

    const captionSel = fsel.caption || "#caption";
    const capIdx = await waitForOptionFlex(
      page,
      captionSel,
      formData.caption,
      20000
    );
    if (capIdx < 0) {
      const opts = await page
        .$eval(captionSel, (el) =>
          Array.from(el.options).map((o) => (o.textContent || "").trim())
        )
        .catch(() => []);
      throw new Error(
        `Caption "${formData.caption}" no disponible después de seleccionar Section "${formData.section}". ` +
          `Opciones: ${opts.join(" | ") || "[vacío]"}`
      );
    }
    await selectByText(page, captionSel, formData.caption);

    const isOther =
      String(formData.caption || "")
        .trim()
        .toLowerCase() === "other";
    if (isOther) {
      const customSel = fsel.customCaption || "#fv_document_customized_caption";
      const otherInput = page.locator(customSel).first();
      await otherInput.waitFor({ timeout: 7000 });
      await otherInput.click({ clickCount: 3 });
      await otherInput.fill(formData.captionOtherText || "");
      await otherInput.evaluate((el) => {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.blur && el.blur();
      });
    }

    await selectByText(page, fsel.status || "#status", formData.status);

    const effectiveSel =
      fsel.effectiveDate ||
      (await page
        .locator('label:has-text("Effective Date")')
        .locator("xpath=following::input[1]")
        .evaluate((el) => (el?.id ? `#${el.id}` : null))
        .catch(() => null)) ||
      'input[name="effective_date"]';

    await setEffectiveDate(page, effectiveSel, formData.effectiveDate);

    // ---------- Archivo ----------
    jobCtx?.setStage?.("upload-file", {
      filename: filePayload?.name || localFilePath,
    });
    if (filePayload && filePayload.buffer) {
      await page.setInputFiles(selectors.fileInput, filePayload);
    } else if (localFilePath) {
      await page.setInputFiles(selectors.fileInput, localFilePath);
    } else {
      throw new Error(
        "No se recibió archivo para subir (ni filePayload ni localFilePath)"
      );
    }

    // ---------- Submit (sin esperar navegación/respuestas) ----------
    const submitSel =
      selectors.fileSubmit ||
      "#add-new-document-record-form > div:nth-child(7) > input";
    const containerSel =
      (fsel && fsel.container) || "form#add-new-document-record-form";

    await page.waitForSelector(submitSel, { state: "visible", timeout: 10000 });
    await page.evaluate(
      (s) => document.querySelector(s)?.scrollIntoView({ block: "center" }),
      submitSel
    );

    jobCtx?.setStage?.("submit");
    await page.click(submitSel);
    const uploadShot = await saveEvidence(page, "after_submit", options);

    // ---------- Verificar “form cleared” y terminar ----------
    jobCtx?.setStage?.("verify-cleared");

    const clearWaitMs = Number((options && options.clearWaitMs) || 4000); // timeout corto por defecto
    const pollMs = Number((options && options.clearPollMs) || 150);

    const cleared = await waitForFormCleared(
      page,
      {
        fsel,
        fileInputSel: selectors.fileInput,
        filled: {
          section: formData.section,
          caption: formData.caption,
          status: formData.status,
          effectiveDate: formData.effectiveDate,
          captionOtherText: isOther ? formData.captionOtherText || "" : null,
        },
      },
      { timeoutMs: clearWaitMs, pollMs }
    );

    if (!cleared.ok) {
      // evidencia opcional para diagnósticos
      await saveEvidence(page, "verify_cleared_failed", options);
      throw new Error(
        `El formulario no se vació tras el submit: ${cleared.mismatches.join(
          " | "
        )}`
      );
    }

    // ¡Listo! No esperamos nada más; salir rápido.
    jobCtx?.setStage?.("done");

    return {
      ok: true,
      message: "Archivo cargado",
      postSubmitResult: "cleared",
      clearedSnapshot: cleared.snapshot, // por si quieres auditar qué quedó seleccionado
      warnings,
      evidence: {
        loginShotBase64:
          options && options.returnEvidenceBase64
            ? loginShot.base64
            : undefined,
        uploadShotBase64:
          options && options.returnEvidenceBase64
            ? uploadShot.base64
            : undefined,
        loginShotPath: loginShot.path,
        uploadShotPath: uploadShot.path,
      },
    };
  } finally {
    // cierre inmediato (safeClose ya fuerza SIGKILL si hace falta)
    await safeClose(page, context, browser);
  }
};

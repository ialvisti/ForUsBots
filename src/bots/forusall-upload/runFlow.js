// src/bots/forusall-upload/runFlow.js
const speakeasy = require('speakeasy');
const { launchBrowser, createContext, safeClose } = require('../../engine/browser');
const { SITE_USER, SITE_PASS, TOTP_SECRET, TOTP_STEP_SECONDS } = require('../../config'); // incluye step
const { buildUploadUrl } = require('../../engine/utils/url');
const { saveEvidence } = require('../../engine/evidence');
const { waitForOptionFlex, selectByText } = require('../../engine/utils/select');
const { setEffectiveDate } = require('../../engine/utils/date');
const { verifyFormDefaults } = require('../../engine/utils/verify');

// Login lock / introspección
const {
  acquireLogin,
  waitNewTotpWindowIfNeeded,
  markTotpUsed,
} = require('../../engine/loginLock');

/**
 * Ejecuta el flujo completo del bot de upload.
 * @param {{ meta, localFilePath?: string, filePayload?: {name, mimeType, buffer}, warnings?: string[], jobCtx?: {jobId, setStage(name, meta?)} }} args
 */
module.exports = async function runFlow({ meta, localFilePath, filePayload, warnings = [], jobCtx }) {
  const { loginUrl, uploadUrlTemplate, planId, selectors, formData, options } = meta;

  if (!SITE_USER || !SITE_PASS || !TOTP_SECRET) {
    throw new Error('Faltan SITE_USER, SITE_PASS o TOTP_SECRET en variables de entorno');
  }

  let browser, context, page;
  try {
    browser = await launchBrowser();
    context = await createContext(browser);
    page = await context.newPage();
    page.on('dialog', d => d.dismiss().catch(() => {}));

    // ---------- Login ----------
    jobCtx?.setStage?.('login');
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
    await page.fill(selectors.user, SITE_USER);
    await page.fill(selectors.pass, SITE_PASS);

    await Promise.all([
      page.waitForLoadState('networkidle'),
      page.click(selectors.loginButton)
    ]);

    // ---------- OTP (serializado por usuario + evita reusar el mismo step) ----------
    // marcamos que entramos a OTP y estamos esperando el lock
    jobCtx?.setStage?.('otp', { otpLock: 'waiting' });
    const otpWaitStart = Date.now();

    const release = await acquireLogin(SITE_USER);
    try {
      // ahora somos el holder del lock
      const waitedSec = Math.floor((Date.now() - otpWaitStart) / 1000);
      jobCtx?.setStage?.('otp', { otpLock: 'holder', waitedSeconds: waitedSec });

      // Si el último login ya usó el step actual, espera al próximo
      await waitNewTotpWindowIfNeeded(SITE_USER);

      await page.waitForSelector(selectors.otpInput, { timeout: 30000 });
      let otpOk = false;

      const step = Number(TOTP_STEP_SECONDS || 30);
      const candidates = [
        speakeasy.totp({ secret: TOTP_SECRET, encoding: 'base32', step, window: 0 }),
        speakeasy.totp({ secret: TOTP_SECRET, encoding: 'base32', step, window: 1 }),
      ];

      for (const code of candidates) {
        await page.fill(selectors.otpInput, code);
        await page.click(selectors.otpSubmit);
        try {
          await page.waitForLoadState('networkidle', { timeout: 5000 });
          otpOk = true;
          break;
        } catch {}
      }

      if (!otpOk) throw new Error('No fue posible validar el OTP');

      // Marca que consumimos el step TOTP en este usuario (evita reuso en paralelo)
      markTotpUsed(SITE_USER);
    } finally {
      release(); // libera el candado para el próximo login
    }

    const loginShot = await saveEvidence(page, 'login', options);

    // ---------- Página de carga ----------
    jobCtx?.setStage?.('goto-upload');
    const uploadUrl = buildUploadUrl(uploadUrlTemplate, planId);
    await page.goto(uploadUrl, { waitUntil: 'domcontentloaded' });

    const fsel = selectors.form || {};

    // ---------- Form ----------
    jobCtx?.setStage?.('fill-form', {
      section: formData.section,
      caption: formData.caption,
      status: formData.status,
      effectiveDate: formData.effectiveDate,
    });

    await selectByText(page, fsel.section || '#fv_header_title', formData.section);

    const captionSel = fsel.caption || '#caption';
    const capIdx = await waitForOptionFlex(page, captionSel, formData.caption, 20000);
    if (capIdx < 0) {
      const opts = await page.$eval(captionSel, el =>
        Array.from(el.options).map(o => (o.textContent || '').trim())
      ).catch(() => []);
      throw new Error(
        `Caption "${formData.caption}" no disponible después de seleccionar Section "${formData.section}". ` +
        `Opciones: ${opts.join(' | ') || '[vacío]'}`
      );
    }
    await selectByText(page, captionSel, formData.caption);

    const isOther = String(formData.caption || '').trim().toLowerCase() === 'other';
    if (isOther) {
      const customSel = fsel.customCaption || '#fv_document_customized_caption';
      const otherInput = page.locator(customSel).first();
      await otherInput.waitFor({ timeout: 7000 });
      await otherInput.click({ clickCount: 3 });
      await otherInput.fill(formData.captionOtherText || '');
      await otherInput.evaluate(el => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur && el.blur();
      });
    }

    await selectByText(page, fsel.status || '#status', formData.status);

    const effectiveSel =
      fsel.effectiveDate ||
      (await page
        .locator('label:has-text("Effective Date")')
        .locator('xpath=following::input[1]')
        .evaluate(el => el?.id ? `#${el.id}` : null)
        .catch(() => null)) ||
      'input[name="effective_date"]';

    await setEffectiveDate(page, effectiveSel, formData.effectiveDate);

    // ---------- Archivo ----------
    jobCtx?.setStage?.('upload-file', { filename: filePayload?.name || localFilePath });
    if (filePayload && filePayload.buffer) {
      await page.setInputFiles(selectors.fileInput, filePayload);
    } else if (localFilePath) {
      await page.setInputFiles(selectors.fileInput, localFilePath);
    } else {
      throw new Error('No se recibió archivo para subir (ni filePayload ni localFilePath)');
    }

    // ---------- Submit ----------
    const submitSel    = selectors.fileSubmit || '#add-new-document-record-form > div:nth-child(7) > input';
    const containerSel = (fsel && fsel.container) || 'form#add-new-document-record-form';
    const successSel   = (fsel && fsel.success) || null;

    const formAction = await page.$eval('form#add-new-document-record-form', f => f.action).catch(() => null);

    await page.waitForSelector(submitSel, { state: 'visible', timeout: 10000 });
    await page.evaluate(s => document.querySelector(s)?.scrollIntoView({ block: 'center', behavior: 'instant' }), submitSel);

    const beforeUrl = page.url();
    let postSubmitResult = 'pending';

    jobCtx?.setStage?.('submit');
    await page.click(submitSel);
    const uploadShot = await saveEvidence(page, 'after_submit', options);

    try {
      await page.waitForURL(u => u.toString() !== beforeUrl, { timeout: 12000 });
      postSubmitResult = 'url-change';
    } catch {
      try {
        await page.waitForResponse(resp => {
          const m = resp.request().method();
          const okMethod = (m === 'POST' || m === 'PUT');
          const matchUrl = formAction ? resp.url().startsWith(formAction) : /fv_document/i.test(resp.url());
          return okMethod && matchUrl && resp.status() >= 200 && resp.status() < 400;
        }, { timeout: 12000 });
        postSubmitResult = 'http-2xx';
      } catch {
        if (successSel) {
          try { await page.waitForSelector(successSel, { timeout: 10000 }); postSubmitResult = 'success-selector'; } catch {}
        }
        if (postSubmitResult === 'pending') {
          try {
            await page.waitForSelector(containerSel, { state: 'hidden', timeout: 15000 });
            await page.waitForSelector(containerSel, { state: 'visible', timeout: 15000 });
            postSubmitResult = 'form-reset';
            await saveEvidence(page, 'after_form_reset', options);
          } catch {}
        }
        if (postSubmitResult === 'pending') {
          const errorsText = await page.$$eval(
            '.alert-danger, .error, .field_with_errors, .help-block, .invalid-feedback',
            els => els.map(e => e.textContent.trim()).filter(Boolean)
          ).catch(() => []);
          if (errorsText.length) {
            throw new Error(`Errores de validación tras submit: ${errorsText.join(' | ')}`);
          }
        }
        if (postSubmitResult === 'pending') {
          if (!(options && options.suppressSameUrlWarning)) {
            warnings.push('No hubo navegación tras el submit; confirmación heurística. Revisa evidencia after_submit.');
          }
          postSubmitResult = 'same-url';
        }
      }
    }

    async function stabilizeAfterSubmit() {
      const settleMs = Number((options && options.settleMsAfterSubmit) || 1200);
      try { await page.waitForLoadState('domcontentloaded', { timeout: 5000 }); } catch {}
      try { await page.waitForLoadState('networkidle', { timeout: 3000 }); } catch {}
      try { await page.waitForSelector(containerSel, { state: 'visible', timeout: 15000 }); } catch {}
      await page.waitForTimeout(settleMs);
    }
    await stabilizeAfterSubmit();

    jobCtx?.setStage?.('verify');
    const confirmDelay = options && options.fastExit ? 1500 : ((options && options.confirmDelayMs) || 5000);
    const verify = await verifyFormDefaults(page, {
      fsel,
      fileInputSel: selectors.fileInput,
      containerSel,
    }, confirmDelay);

    if (!verify.ok) {
      await saveEvidence(page, 'verify_defaults_mismatch', options);
      throw new Error(`Verificación post-submit falló: ${verify.mismatches.join(' | ')}`);
    } else if (options && options.evidenceOnSuccess) {
      await saveEvidence(page, 'verify_defaults_ok', options);
    }

    const newUrl = page.url();
    warnings = warnings.filter(w => !/No hubo navegación tras el submit/.test(w));

    jobCtx?.setStage?.('done');
    return {
      ok: true,
      message: 'Archivo cargado',
      newUrl,
      postSubmitResult,
      defaultsVerified: true,
      warnings,
      evidence: {
        loginShotBase64: options && options.returnEvidenceBase64 ? loginShot.base64 : undefined,
        uploadShotBase64: options && options.returnEvidenceBase64 ? uploadShot.base64 : undefined,
        loginShotPath: loginShot.path,
        uploadShotPath: uploadShot.path,
      },
    };
  } finally {
    await safeClose(page, context, browser);
  }
};

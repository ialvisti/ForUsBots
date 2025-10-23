// src/bots/forusall-upload/runFlow.js
const { getPageFromPool, releasePage } = require("../../engine/sharedContext");
const { SITE_USER, SITE_PASS, TOTP_SECRET } = require("../../config");
const { buildUploadUrl } = require("../../engine/utils/url");
const { saveEvidence } = require("../../engine/evidence");
const {
  waitForOptionFlex,
  selectByText,
} = require("../../engine/utils/select");
const { setEffectiveDate } = require("../../engine/utils/date");
const { waitForFormCleared } = require("../../engine/utils/verify");
const { ensureAuthForTarget } = require("../../engine/auth/loginOtp");

const PW_DEFAULT_TIMEOUT = Math.max(
  2000,
  parseInt(process.env.PW_DEFAULT_TIMEOUT || "6000", 10)
);

/**
 * Verificador rápido en el propio DOM (1 sola evaluación en el frame).
 * Comprueba que los valores del form YA no coinciden con los enviados (o están vacíos).
 * Devuelve { ok, snapshot } si lo logra en el timeout, o null si no.
 */
async function waitClearedFast(
  page,
  { fsel, fileInputSel, filled },
  { timeoutMs = 2500, pollMs = 60 } = {}
) {
  try {
    const res = await page.waitForFunction(
      ({ fsel, fileInputSel, filled }) => {
        function tidy(s) {
          return String(s ?? "").trim();
        }
        function selectedText(sel) {
          const el = document.querySelector(sel);
          if (!el) return null;
          const i = el.selectedIndex;
          const t =
            i >= 0 && el.options[i] ? el.options[i].textContent || "" : "";
          return tidy(t);
        }

        const snap = {
          section: fsel.section ? selectedText(fsel.section) : null,
          caption: fsel.caption ? selectedText(fsel.caption) : null,
          status: fsel.status ? selectedText(fsel.status) : null,
          effectiveDate: fsel.effectiveDate
            ? tidy(
                (document.querySelector(fsel.effectiveDate) || {}).value || ""
              )
            : null,
          fileEmpty: (function () {
            const el = document.querySelector(fileInputSel);
            if (!el || !el.files) return null;
            return el.files.length === 0;
          })(),
          captionOtherText:
            filled.captionOtherText != null
              ? tidy(
                  (
                    document.querySelector(
                      fsel.customCaption || "#fv_document_customized_caption"
                    ) || {}
                  ).value || ""
                )
              : null,
        };

        // Reglas (idénticas a verify.js pero en una sola pasada DOM):
        const want = {
          section: tidy(filled.section),
          caption: tidy(filled.caption),
          status: tidy(filled.status),
          effectiveDate: tidy(filled.effectiveDate || ""),
          captionOtherText:
            filled.captionOtherText != null
              ? tidy(filled.captionOtherText)
              : null,
        };

        // Selects: deben ser distintos a lo enviado
        const secOk =
          snap.section == null || tidy(snap.section) !== want.section;
        const capOk =
          snap.caption == null || tidy(snap.caption) !== want.caption;
        const staOk = snap.status == null || tidy(snap.status) !== want.status;

        // Fecha: preferimos vacío, o al menos distinta a la enviada
        const dateOk =
          snap.effectiveDate == null ||
          tidy(snap.effectiveDate) === "" ||
          tidy(snap.effectiveDate) !== want.effectiveDate;

        // Archivo: vacío
        const fileOk = snap.fileEmpty === true;

        // Custom caption (si aplicó): debe quedar vacío
        const otherOk =
          want.captionOtherText == null ||
          tidy(snap.captionOtherText || "") === "";

        const ok = secOk && capOk && staOk && dateOk && fileOk && otherOk;
        return ok ? { ok: true, snapshot: snap } : false;
      },
      { fsel, fileInputSel, filled },
      { timeout: timeoutMs, polling: pollMs }
    );
    if (res && typeof res === "object") {
      return res; // { ok: true, snapshot }
    }
    return null;
  } catch {
    // Puede fallar si se destruye el contexto por un refresh del portal.
    return null;
  }
}

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
      "Missing SITE_USER, SITE_PASS or TOTP_SECRET in environment variables"
    );
  }

  let page = null;
  try {
    // 1) Página del pool (contexto persistente + keep-alive)
    page = await getPageFromPool({ siteUserEmail: SITE_USER });
    page.setDefaultTimeout(PW_DEFAULT_TIMEOUT);
    page.setDefaultNavigationTimeout(PW_DEFAULT_TIMEOUT + 2000);

    // 2) URL destino del upload
    const uploadUrl = buildUploadUrl(uploadUrlTemplate, planId);

    // 3) Auth centralizada (login + OTP si aplica) y verificación de "shell" del upload
    jobCtx?.setStage?.("auth-upload");
    const SHELL_UPLOAD = [
      selectors.form?.container || "form#add-new-document-record-form",
      selectors.fileInput || "#fv_document_file",
      "#add-new-document-record-form",
    ];

    const authRes = await ensureAuthForTarget(page, {
      loginUrl,
      targetUrl: uploadUrl,
      selectors,
      shellSelectors: SHELL_UPLOAD,
      jobCtx,
      saveSession: true,
    });

    // Opcional: evidencia post-login (no afecta el tiempo del submit)
    let loginShot = null;
    if (authRes.didLogin) {
      loginShot = await saveEvidence(page, "login", options);
    }

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
        `Caption "${formData.caption}" not available after selecting Section "${formData.section}". ` +
          `Options: ${opts.join(" | ") || "[empty]"}`
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
        "No file was received to upload (neither filePayload nor localFilePath)"
      );
    }

    // ---------- SUBMIT: instantáneo + verificación directa ----------
    const submitSel =
      selectors.fileSubmit ||
      "#add-new-document-record-form > div:nth-child(7) > input";
    const containerSel = fsel.container || "#add-new-document-record-form";

    await page.waitForSelector(submitSel, { state: "visible", timeout: 8000 });

    jobCtx?.setStage?.("submit");

    // Click SIN esperar navegación (el portal puede refrescar, pero no dependemos de eso)
    await page
      .click(submitSel, { noWaitAfter: true, timeout: 8000 })
      .catch(() => {});

    // Verificador “rápido” (2.5s máx) que trabaja en el propio frame
    const fast = await waitClearedFast(
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
      { timeoutMs: 2500, pollMs: 60 }
    );

    let clearedSnapshot = fast && fast.snapshot;
    let clearedOk = !!(fast && fast.ok);

    // Fallback robusto (hasta ~4s) sólo si el rápido no alcanzó
    if (!clearedOk) {
      jobCtx?.setStage?.("verify-cleared-fallback");
      const fallback = await waitForFormCleared(
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
        { timeoutMs: 4000, pollMs: 120 }
      );
      clearedOk = fallback.ok;
      clearedSnapshot = fallback.snapshot || clearedSnapshot;

      if (!clearedOk) {
        // última evidencia si falla
        await saveEvidence(page, "verify_cleared_failed", options);
        throw new Error(
          `The form was not cleared after submit: ${fallback.mismatches.join(
            " | "
          )}`
        );
      }
    }

    // Evidencia post-submit sólo si está activada (para no gastar tiempo)
    if (options && options.evidenceOnSuccess) {
      await saveEvidence(page, "after_submit", options).catch(() => {});
    }

    // Done → salir YA
    jobCtx?.setStage?.("done");
    return {
      ok: true,
      message: "File uploaded SUCCESSFULLY",
      postSubmitResult: "cleared",
      clearedSnapshot,
      warnings,
      evidence: {
        loginShotPath: authRes.didLogin
          ? await (async () => null)()
          : undefined, // mantén campo estable
      },
    };
  } finally {
    if (page) await releasePage(page);
  }
};

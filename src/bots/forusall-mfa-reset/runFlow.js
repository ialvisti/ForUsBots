// src/bots/forusall-mfa-reset/runFlow.js
const { getPageFromPool, releasePage } = require("../../engine/sharedContext");
const { SITE_USER, TOTP_SECRET } = require("../../config");
const { saveEvidence } = require("../../engine/evidence");
const { getSpec } = require("../../providers/forusall/participantMap");
const { FIXED } = require("../../providers/forusall/config");
const { ensureAuthForTarget } = require("../../engine/auth/loginOtp");

const PW_DEFAULT_TIMEOUT = Math.max(
  2000,
  parseInt(process.env.PW_DEFAULT_TIMEOUT || "6000", 10)
);

function tidy(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}

/** Abre el tab de MFA por navSelector / label */
async function openMfaModule(page, sel, { timeoutMs = 6000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const navSelector =
    sel?.mfaReset?.navLink || getSpec("mfa")?.navSelector || 'a[href="#mfa"]';
  while (Date.now() < deadline) {
    try {
      await page.click(navSelector, { timeout: 350 });
      return true;
    } catch {}
    try {
      await page
        .getByRole("link", { name: /mfa/i })
        .first()
        .click({ timeout: 350 });
      return true;
    } catch {}
    try {
      await page
        .getByRole("button", { name: /mfa/i })
        .first()
        .click({ timeout: 350 });
      return true;
    } catch {}
    await page.waitForTimeout(100);
  }
  return false;
}

/** Lee y normaliza el texto del estado MFA */
async function readMfaStatus(page, sel) {
  const statusSel = sel?.mfaReset?.status || "#mfa_status";
  try {
    const txt = await page.$eval(statusSel, (el) =>
      (el.textContent || el.innerText || "").trim()
    );
    return tidy(txt);
  } catch {
    return null;
  }
}

/** Espera el próximo dialog del tipo indicado y lo devuelve (con timeout) */
function nextDialogOfType(page, expectedType, timeoutMs) {
  return new Promise((resolve, reject) => {
    const onDialog = (dlg) => {
      try {
        if (!expectedType || dlg.type() === expectedType) {
          cleanup();
          resolve(dlg);
        }
      } catch (e) {
        cleanup();
        reject(e);
      }
    };
    const cleanup = () => {
      clearTimeout(t);
      page.off("dialog", onDialog);
    };
    const t = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for ${expectedType || "dialog"}`));
    }, timeoutMs);
    page.on("dialog", onDialog);
  });
}

module.exports = async function runFlow({ meta, jobCtx }) {
  let { participantId, participantUrl, selectors, mfaReset, loginUrl } = meta;

  if (!SITE_USER || !TOTP_SECRET) {
    throw new Error("Faltan SITE_USER o TOTP_SECRET en variables de entorno");
  }

  // Fallbacks robustos (por si algún caller olvida pasarlos)
  selectors = selectors || FIXED.selectors;
  mfaReset = mfaReset || FIXED.mfaReset;

  const DEFAULT_LOGIN_URL = "https://employer.forusall.com/sign_in";
  const DEFAULT_PARTICIPANT_URL = participantId
    ? `https://employer.forusall.com/participants/${encodeURIComponent(
        participantId
      )}`
    : null;

  const loginUrlFinal = loginUrl || DEFAULT_LOGIN_URL;
  const participantUrlFinal = participantUrl || DEFAULT_PARTICIPANT_URL;

  const TIME = {
    pageLoad: mfaReset?.timeouts?.pageLoad ?? 15000,
    buttonWait: mfaReset?.timeouts?.buttonWait ?? 6000,
    confirmWait: mfaReset?.timeouts?.confirmWait ?? 7000,
    alertWait: mfaReset?.timeouts?.alertWait ?? 7000,
    statusSettle: mfaReset?.timeouts?.statusSettle ?? 8000,
  };

  const refreshLinkSel = selectors?.mfaReset?.refreshLink || "#refresh_mfa";
  const resetBtnSel = selectors?.mfaReset?.resetButton || "#reset-mfa";
  const panelDetailsSel =
    selectors?.mfaReset?.panelDetails ||
    getSpec("mfa")?.ready?.selector ||
    "#mfa-details";
  const panelSel = selectors?.mfaReset?.panel || "#mfa";

  const SHELL = [
    "#tab-panel",
    "#census",
    "#savings-rate",
    "#plan",
    "#loan",
    "#payroll",
    "#comms",
    "#docs",
    "#mfa",
  ];

  let page = null;

  try {
    jobCtx?.setStage?.("init");
    page = await getPageFromPool({ siteUserEmail: SITE_USER });
    page.setDefaultTimeout(PW_DEFAULT_TIMEOUT);
    page.setDefaultNavigationTimeout(PW_DEFAULT_TIMEOUT + 2000);

    if (!participantUrlFinal) throw new Error("participantUrl no disponible");

    // 1) Auth + OTP si expiró
    jobCtx?.setStage?.("auth");
    await ensureAuthForTarget(page, {
      loginUrl: loginUrlFinal,
      targetUrl: participantUrlFinal,
      selectors,
      shellSelectors: SHELL,
      jobCtx,
      saveSession: true,
    });

    // 2) Abrir módulo MFA
    jobCtx?.setStage?.("open-mfa");
    const opened = await openMfaModule(page, selectors, {
      timeoutMs: TIME.buttonWait,
    });
    if (!opened) throw new Error("No se pudo abrir el módulo MFA");

    // Panel listo (preferir panelDetails visible; si no, al menos attached del panel)
    try {
      await page.waitForSelector(panelDetailsSel, {
        timeout: TIME.pageLoad,
        state: "visible",
      });
    } catch {
      await page.waitForSelector(panelSel, { timeout: TIME.pageLoad });
    }

    // 3) Estado actual
    jobCtx?.setStage?.("check-status");
    const status0 = await readMfaStatus(page, selectors);
    if (!status0) throw new Error("No se pudo leer #mfa_status");

    if (status0 === "not enrolled") {
      return {
        ok: true,
        mfa: false,
        reason: "Participant is not enrolled to MFA",
        participantId,
      };
    }

    // 4) Reset MFA
    jobCtx?.setStage?.("reset-mfa", { current: status0 });
    const btn = page.locator(resetBtnSel);
    await btn.waitFor({
      state: "visible",
      timeout: Math.max(3000, TIME.buttonWait),
    });
    if (await btn.isDisabled()) {
      return {
        ok: false,
        mfa: false,
        reason: "Reset button is disabled",
        participantId,
      };
    }

    // Confirm
    jobCtx?.setStage?.("reset-mfa:confirm-await");
    let confirmMessage = null;
    await Promise.all([
      (async () => {
        const dlg = await nextDialogOfType(page, "confirm", TIME.confirmWait);
        confirmMessage = dlg.message();
        await dlg.accept();
        jobCtx?.setStage?.("reset-mfa:confirmed", { confirmMessage });
      })(),
      btn.click({
        timeout: Math.max(PW_DEFAULT_TIMEOUT, TIME.confirmWait + 1500),
      }),
    ]);

    // Alert de éxito (si aparece)
    jobCtx?.setStage?.("reset-mfa:alert-await");
    let alertMessage = null;
    try {
      const alertDlg = await nextDialogOfType(page, "alert", TIME.alertWait);
      alertMessage = alertDlg.message() || null;
      await alertDlg.accept();
      jobCtx?.setStage?.("reset-mfa:alert-accepted", { alertMessage });
    } catch {
      jobCtx?.setStage?.("reset-mfa:alert-missed");
    }

    if (
      alertMessage &&
      mfaReset?.successMessage &&
      !String(alertMessage).includes(
        String(mfaReset.successMessage).slice(0, 20)
      )
    ) {
      jobCtx?.setStage?.("warn-alert", { alertMessage });
    }

    // 5) Esperar estado "not enrolled" refrescando el panel si hace falta
    const endAt = Date.now() + TIME.statusSettle;
    let status1 = null;
    do {
      status1 = await readMfaStatus(page, selectors);
      if (status1 === "not enrolled") break;
      try {
        await page.click(refreshLinkSel, { timeout: 250 });
      } catch {}
      await page.waitForTimeout(300);
    } while (Date.now() < endAt);

    if (status1 === "not enrolled") {
      const snap = await saveEvidence(
        page,
        `mfa-reset-success-${participantId}`
      );
      return {
        ok: true,
        mfa: true,
        reason: "MFA reset successful",
        confirmMessage,
        alertMessage,
        participantId,
        evidencePath: snap?.path || null,
      };
    }

    const snap = await saveEvidence(
      page,
      `mfa-reset-not-changed-${participantId}`
    );
    return {
      ok: false,
      mfa: true,
      reason:
        "Reset accionado pero el estado no llegó a 'not enrolled' dentro del timeout",
      confirmMessage,
      alertMessage,
      participantId,
      evidencePath: snap?.path || null,
    };
  } catch (error) {
    console.error("[mfa-reset] flow error:", error);
    if (page) {
      try {
        const snap = await saveEvidence(
          page,
          `mfa-reset-error-${participantId}`
        );
        console.error("[mfa-reset] error evidence:", snap?.path);
      } catch {}
    }
    throw error;
  } finally {
    if (page) await releasePage(page);
  }
};

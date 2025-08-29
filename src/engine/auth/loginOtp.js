// src/engine/auth/loginOtp.js
const speakeasy = require("speakeasy");
const { gotoFast } = require("../sharedContext");
const {
  SITE_USER,
  SITE_PASS,
  TOTP_SECRET,
  TOTP_STEP_SECONDS,
} = require("../../config");
const {
  acquireLogin,
  waitNewTotpWindowIfNeeded,
  markTotpUsed,
} = require("../loginLock");
const { saveContextStorageState } = require("../sessions");

const PW_DEFAULT_TIMEOUT = Math.max(
  2000,
  parseInt(process.env.PW_DEFAULT_TIMEOUT || "6000", 10)
);

/** Espera el primero que exista entre varios selectores y devuelve el que encontró */
async function waitForAnySelector(
  page,
  selectors,
  { timeout = 30000, state = "attached", pollMs = 80 } = {}
) {
  const list = (selectors || []).filter(Boolean);
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const sel of list) {
      try {
        const loc = page.locator(sel).first();
        await loc.waitFor({ state, timeout: 200 });
        return sel;
      } catch {}
    }
    await page.waitForTimeout(pollMs);
  }
  throw new Error(`Timeout esperando alguno de: ${list.join(" | ")}`);
}

/** ¿Hay “shell” visible? */
async function hasShell(page, shellSelectors) {
  if (!Array.isArray(shellSelectors) || shellSelectors.length === 0)
    return false;
  for (const sel of shellSelectors) {
    try {
      const count = await page.locator(sel).count();
      if (count > 0) return true;
    } catch {}
  }
  return false;
}

/** Pequeño poll para shell */
async function waitForShell(
  page,
  shellSelectors,
  { timeoutMs = 3000, pollMs = 80 } = {}
) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await hasShell(page, shellSelectors)) return true;
    await page.waitForTimeout(pollMs);
  }
  return false;
}

/** Detección de formulario de login */
async function isOnLogin(page, selectors) {
  try {
    const url = page.url() || "";
    if (/\/sign_in\b/i.test(url)) return true;
  } catch {}
  if (!selectors) return false;
  try {
    const hasUser = await page
      .locator(selectors.user)
      .count()
      .catch(() => 0);
    const hasPass = await page
      .locator(selectors.pass)
      .count()
      .catch(() => 0);
    return hasUser > 0 && hasPass > 0;
  } catch {}
  return false;
}

/** Espera competitivo: regresa { kind: 'shell' } o { kind: 'otp', otpSel } */
async function waitForShellOrOtp(
  page,
  { shellSelectors, otpCandidates },
  { timeoutMs = 15000, pollMs = 100 } = {}
) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    // 1) shell?
    if (await hasShell(page, shellSelectors)) return { kind: "shell" };

    // 2) otp visible?
    for (const sel of otpCandidates) {
      try {
        const loc = page.locator(sel).first();
        const vis = await loc.isVisible({ timeout: 100 }).catch(() => false);
        if (vis) return { kind: "otp", otpSel: sel };
      } catch {}
    }

    await page.waitForTimeout(pollMs);
  }
  // Nada apareció: devuelve neutro
  return { kind: "none" };
}

/** Realiza login y, si aparece, OTP. Devuelve { usedOtp } */
async function doLoginAndMaybeOtp(
  page,
  { loginUrl, selectors, shellSelectors, jobCtx }
) {
  if (!selectors?.user || !selectors?.pass || !selectors?.loginButton) {
    throw new Error("login selectors missing (user/pass/loginButton)");
  }

  jobCtx?.setStage?.("login");

  // Si ya estás en /sign_in, NO navegues para preservar return_to
  const alreadyOnLogin = await isOnLogin(page, selectors);
  if (!alreadyOnLogin) {
    await gotoFast(page, loginUrl, Math.max(20000, PW_DEFAULT_TIMEOUT + 2000));
  }

  await page.fill(selectors.user, SITE_USER, { timeout: 20000 });
  await page.fill(selectors.pass, SITE_PASS, { timeout: 20000 });
  await page.click(selectors.loginButton, { timeout: 20000 });

  const otpInputCandidates = [
    selectors.otpInput,
    ...(selectors.otpInputsAlt || []),
    "#otp_attempt",
    'input[name="otp_attempt"]',
    "#otp_code",
    'input[name="otp_code"]',
    'input[name*="otp"]',
    'input[id*="otp"]',
    'input[type="tel"][autocomplete="one-time-code"]',
    "#two_factor_code",
    'input[name="two_factor_code"]',
  ].filter(Boolean);

  // Espera competitivo: shell vs otp
  const first = await waitForShellOrOtp(
    page,
    { shellSelectors, otpCandidates: otpInputCandidates },
    { timeoutMs: 15000 }
  );

  if (first.kind === "shell") {
    return { usedOtp: false };
  }

  if (first.kind !== "otp" || !first.otpSel) {
    // Último intento de heurística
    const shellOk = await waitForShell(page, shellSelectors, {
      timeoutMs: 2500,
    });
    if (shellOk) return { usedOtp: false };
    throw new Error(
      "No apareció formulario de OTP ni se detectó shell tras login."
    );
  }

  const otpSel = first.otpSel;

  // Mutex y ventana TOTP
  jobCtx?.setStage?.("otp", { otpLock: "waiting" });
  const release = await acquireLogin(SITE_USER);
  try {
    jobCtx?.setStage?.("otp", { otpLock: "holder" });
    await waitNewTotpWindowIfNeeded(SITE_USER);

    // Reconfirma que el OTP siga presente justo antes de escribir
    const stillThere = await page
      .locator(otpSel)
      .first()
      .isVisible({ timeout: 1500 })
      .catch(() => false);
    if (!stillThere) {
      // Puede que ya hayas entrado
      const shellOk = await waitForShell(page, shellSelectors, {
        timeoutMs: 2000,
      });
      if (shellOk) return { usedOtp: false };
      // Vuelve a buscar cualquier input OTP visible
      const again = await waitForShellOrOtp(
        page,
        { shellSelectors, otpCandidates: otpInputCandidates },
        { timeoutMs: 4000 }
      );
      if (again.kind === "shell") return { usedOtp: false };
      if (again.kind !== "otp" || !again.otpSel)
        throw new Error("OTP desapareció y no se detectó shell.");
    }

    const step = Number(TOTP_STEP_SECONDS || 30);
    const codes = [
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

    const submitCandidates = [
      selectors.otpSubmit,
      ...(selectors.otpSubmitAlt || []),
      'form:has(input[type="tel"]), form:has(input[name*="otp"]), form:has(input[id*="otp"]) button[type="submit"]',
      'form:has(input[type="tel"]), form:has(input[name*="otp"]), form:has(input[id*="otp"]) input[type="submit"]',
      'button[type="submit"]',
      'input[type="submit"]',
    ].filter(Boolean);

    for (const code of codes) {
      // write with safety: si falla el fill, verifica shell
      try {
        await page.fill(otpSel, "", { timeout: 3000 });
        await page.fill(otpSel, code, { timeout: 3000 });
      } catch (_) {
        const shellNow = await waitForShell(page, shellSelectors, {
          timeoutMs: 1200,
        });
        if (shellNow) {
          markTotpUsed(SITE_USER);
          return { usedOtp: true };
        }
        // si no, reubica el otpSel (posibles re-render)
        const re = await waitForShellOrOtp(
          page,
          { shellSelectors, otpCandidates: otpInputCandidates },
          { timeoutMs: 3000 }
        );
        if (re.kind === "shell") {
          markTotpUsed(SITE_USER);
          return { usedOtp: true };
        }
        if (re.kind === "otp" && re.otpSel) {
          // intenta una vez más con el nuevo selector
          try {
            await page.fill(re.otpSel, "", { timeout: 3000 });
            await page.fill(re.otpSel, code, { timeout: 3000 });
          } catch {}
        }
      }

      let clicked = false;
      for (const s of submitCandidates) {
        try {
          await page.click(s, { timeout: 800 });
          clicked = true;
          break;
        } catch {}
      }
      if (!clicked) {
        await page
          .locator(otpSel)
          .press("Enter", { timeout: 800 })
          .catch(() => {});
      }

      const entered = await waitForShell(page, shellSelectors, {
        timeoutMs: 2000,
      });
      if (entered) break;

      await page.waitForTimeout(350);
    }

    markTotpUsed(SITE_USER);

    const ok =
      (await waitForShell(page, shellSelectors, { timeoutMs: 4000 })) ||
      (await page
        .locator(otpSel)
        .count()
        .then((c) => c === 0)
        .catch(() => false));

    if (!ok) {
      throw new Error(
        "OTP no validado: no se detectó shell ni desaparición del input."
      );
    }

    return { usedOtp: true };
  } finally {
    release();
  }
}

/** Asegura autenticación y shell en targetUrl (login/OTP en la página actual si hubo redirect a /sign_in) */
async function ensureAuthForTarget(
  page,
  { loginUrl, targetUrl, selectors, shellSelectors, jobCtx, saveSession = true }
) {
  await gotoFast(page, targetUrl, Math.max(20000, PW_DEFAULT_TIMEOUT + 2000));

  let didLogin = false;
  let usedOtp = false;

  if (await isOnLogin(page, selectors)) {
    const r = await doLoginAndMaybeOtp(page, {
      loginUrl: page.url(),
      selectors,
      shellSelectors,
      jobCtx,
    });
    didLogin = true;
    usedOtp = !!r.usedOtp;
    if (saveSession) {
      try {
        await saveContextStorageState(page.context(), SITE_USER);
      } catch {}
    }
  } else {
    const shellOk = await waitForShell(page, shellSelectors, {
      timeoutMs: 1500,
    });
    if (shellOk) {
      return {
        didLogin: false,
        usedOtp: false,
        shellReady: true,
        url: page.url(),
      };
    }
    const r = await doLoginAndMaybeOtp(page, {
      loginUrl,
      selectors,
      shellSelectors,
      jobCtx,
    });
    didLogin = true;
    usedOtp = !!r.usedOtp;
    if (saveSession) {
      try {
        await saveContextStorageState(page.context(), SITE_USER);
      } catch {}
    }
  }

  const entered = await waitForShell(page, shellSelectors, { timeoutMs: 6000 });
  if (!entered) {
    if (await isOnLogin(page, selectors))
      throw new Error("Login/OTP no validado (sigue en /sign_in).");
  }

  const nowUrl = page.url() || "";
  if (!nowUrl.startsWith(targetUrl)) {
    await gotoFast(page, targetUrl, Math.max(20000, PW_DEFAULT_TIMEOUT + 2000));
    const ok = await waitForShell(page, shellSelectors, { timeoutMs: 4000 });
    if (!ok) throw new Error("No se detectó el shell del target tras login.");
  }

  return { didLogin, usedOtp, shellReady: true, url: page.url() };
}

module.exports = {
  ensureAuthForTarget,
  _internals: {
    doLoginAndMaybeOtp,
    waitForAnySelector,
    hasShell,
    waitForShell,
    isOnLogin,
    waitForShellOrOtp,
  },
};

// src/bots/forusall-scrape-participant/runFlow.js
const speakeasy = require("speakeasy");
const {
  getPageFromPool,
  releasePage,
  gotoFast,
} = require("../../engine/sharedContext");
const {
  SITE_USER,
  SITE_PASS,
  TOTP_SECRET,
  TOTP_STEP_SECONDS,
} = require("../../config");
const { saveEvidence } = require("../../engine/evidence");
const { getSpec } = require("../../providers/forusall/participantMap");
const {
  getExtractor,
} = require("../../extractors/forusall-participant/registry");
const { saveContextStorageState } = require("../../engine/sessions");
const {
  acquireLogin,
  waitNewTotpWindowIfNeeded,
  markTotpUsed,
} = require("../../engine/loginLock");

function envBool(v, def = false) {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return def;
}

const SHELL_WAIT_MS = Math.max(
  500,
  parseInt(process.env.SHELL_WAIT_MS || "3000", 10)
);
const OPEN_MODULE_TIMEOUT_MS = Math.max(
  1500,
  parseInt(process.env.OPEN_MODULE_TIMEOUT_MS || "6000", 10)
);
const PANEL_WAIT_MS = Math.max(
  1200,
  parseInt(process.env.PANEL_WAIT_MS || "2500", 10)
);
const PW_DEFAULT_TIMEOUT = Math.max(
  2000,
  parseInt(process.env.PW_DEFAULT_TIMEOUT || "6000", 10)
);

function normReturnMode(v) {
  const s = String(v || "html")
    .trim()
    .toLowerCase();
  return ["html", "text", "both", "data"].includes(s) ? s : "html";
}

async function quickStateCheck(page) {
  return await page.evaluate(() => {
    const href = String(location.href || "");
    const onLogin = /\/sign_in\b/i.test(href);
    const hasLoginDom =
      !!document.querySelector("#user_email") &&
      !!document.querySelector("#user_password");
    const hasShell =
      !!document.querySelector("#tab-panel") ||
      !!document.querySelector("#census") ||
      !!document.querySelector("#savings-rate") ||
      !!document.querySelector("#plan") ||
      !!document.querySelector("#loan") ||
      !!document.querySelector("#payroll") ||
      !!document.querySelector("#comms") ||
      !!document.querySelector("#docs") ||
      !!document.querySelector("#mfa");
    return { onLogin, hasLoginDom, hasShell, href };
  });
}

async function waitForShellFast(
  page,
  { timeoutMs = SHELL_WAIT_MS, pollMs = 45 } = {}
) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const { hasShell } = await quickStateCheck(page);
      if (hasShell) return true;
    } catch {}
    await page.waitForTimeout(pollMs);
  }
  return false;
}

async function doLoginWithOtp(page, selectors, loginUrl, jobCtx) {
  jobCtx?.setStage?.("login");
  await gotoFast(page, loginUrl, Math.max(20000, PW_DEFAULT_TIMEOUT + 2000));
  await page.fill(selectors.user, SITE_USER);
  await page.fill(selectors.pass, SITE_PASS);
  await page.click(selectors.loginButton);

  jobCtx?.setStage?.("otp", { otpLock: "waiting" });
  const release = await acquireLogin(SITE_USER);
  try {
    jobCtx?.setStage?.("otp", { otpLock: "holder" });
    await waitNewTotpWindowIfNeeded(SITE_USER);
    await page.waitForSelector(selectors.otpInput, { timeout: 30000 });

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
        await page.waitForTimeout(350);
        break;
      } catch {}
    }
    markTotpUsed(SITE_USER);
  } finally {
    release();
  }
}

/** Navega a un módulo por label accesible, con scroll y sinónimos (fallback) */
async function openModule(
  page,
  spec,
  { timeoutMs = OPEN_MODULE_TIMEOUT_MS } = {}
) {
  const deadline = Date.now() + timeoutMs;
  const nav = page
    .getByRole("navigation")
    .first()
    .or(page.locator("aside, nav").first());

  async function tryClickByLabel(label) {
    try {
      await page
        .getByRole("link", { name: new RegExp(label, "i") })
        .first()
        .click({ timeout: 350 });
      return true;
    } catch {}
    try {
      await page
        .getByRole("button", { name: new RegExp(label, "i") })
        .first()
        .click({ timeout: 350 });
      return true;
    } catch {}
    return false;
  }

  async function scrollNav() {
    try {
      const hasNav = await nav.count();
      if (!hasNav) return;
      for (let i = 0; i < 4; i++) {
        await nav.evaluate((el) => {
          el.scrollBy({ top: 240, behavior: "instant" });
        });
        await page.waitForTimeout(60);
      }
    } catch {}
  }

  const labels = [spec.navLabel, ...(spec.synonyms || [])].filter(Boolean);

  while (Date.now() < deadline) {
    if (spec.navSelector) {
      try {
        await page.click(spec.navSelector, { timeout: 350 });
        return true;
      } catch {}
    }
    for (const lbl of labels) {
      if (await tryClickByLabel(lbl)) return true;
    }
    await scrollNav();
    await page.waitForTimeout(70);
  }
  return false;
}

/** Snapshot del panel (puede estar oculto) */
async function getPanelSnapshot(page, panelSelector, returnMode) {
  await page
    .waitForSelector(panelSelector, {
      timeout: PANEL_WAIT_MS,
      state: "attached",
    })
    .catch(() => {});
  const html =
    returnMode === "text" || returnMode === "data"
      ? undefined
      : await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          return el ? el.outerHTML : null;
        }, panelSelector);

  const text =
    returnMode === "html" || returnMode === "data"
      ? undefined
      : await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          return (el && (el.innerText || "").trim()) || "";
        }, panelSelector);

  return { html, text };
}

module.exports = async function runFlow({ meta, jobCtx }) {
  if (!SITE_USER || !SITE_PASS || !TOTP_SECRET) {
    throw new Error(
      "Faltan SITE_USER, SITE_PASS o TOTP_SECRET en variables de entorno"
    );
  }

  const {
    loginUrl,
    selectors,
    participantId,
    modules,
    invalidModules = [],
    includeScreens,
    timeoutMs = 30000,
    returnMode: rmIn = "html",
    strict = false,
  } = meta;

  const returnMode = normReturnMode(rmIn);

  const out = {
    ok: true,
    url: `https://employer.forusall.com/participants/${encodeURIComponent(
      participantId
    )}`,
    participantId,
    modulesRequested: modules,
    modules: [],
    full: null,
    errors: [],
    warnings: invalidModules.length
      ? [{ type: "invalid_modules_ignored", keys: invalidModules }]
      : [],
  };

  let page = null;
  try {
    // 1) Página del pool compartido (contexto persistente + cache + keep-alive)
    page = await getPageFromPool({ siteUserEmail: SITE_USER });
    page.setDefaultTimeout(PW_DEFAULT_TIMEOUT);
    page.setDefaultNavigationTimeout(PW_DEFAULT_TIMEOUT + 2000);

    // 2) GOTO súper rápido al perfil
    jobCtx?.setStage?.("goto-participant", { participantId });
    await gotoFast(page, out.url, Math.max(20000, timeoutMs));

    // 3) Estado inicial
    let urlNow = page.url() || "";
    let needLogin = /\/sign_in\b/i.test(urlNow);
    let hasShell = false;

    if (!needLogin) {
      hasShell = await waitForShellFast(page, { timeoutMs: SHELL_WAIT_MS });
      if (!hasShell) {
        // ¿nos movieron al login después?
        urlNow = page.url() || "";
        needLogin = /\/sign_in\b/i.test(urlNow);
        if (!needLogin) {
          try {
            needLogin = !!(await page.$(selectors.user));
          } catch {}
        }
      }
    }

    // 4) Login + OTP si hace falta
    if (needLogin) {
      await doLoginWithOtp(page, selectors, loginUrl, jobCtx);
      if (includeScreens) {
        await saveEvidence(page, `scrape-login-${participantId}`);
      }
      await saveContextStorageState(page.context(), SITE_USER); // guarda storageState.json si REUSE=1
      await gotoFast(page, out.url, Math.max(20000, timeoutMs));
      hasShell = await waitForShellFast(page, { timeoutMs: SHELL_WAIT_MS });
      if (!hasShell) {
        try {
          await page.waitForSelector(
            "#tab-panel, #census, #savings-rate, #plan, #loan, #payroll, #comms, #docs, #mfa",
            {
              timeout: 1500,
              state: "attached",
            }
          );
          hasShell = true;
        } catch {
          throw new Error(
            "No se detectó el shell del participante después del login."
          );
        }
      }
    }

    // 5) EXTRACCIÓN
    if (!modules || modules.length === 0) {
      jobCtx?.setStage?.("extract-full");
      const html = await page.content();
      const text = await page.evaluate(() =>
        (document?.body?.innerText || "").trim()
      );
      let shot = null;
      if (includeScreens) {
        const e = await saveEvidence(page, `scrape-full-${participantId}`);
        shot = e.path || null;
      }
      out.full = {
        html: returnMode === "text" || returnMode === "data" ? undefined : html,
        text: returnMode === "html" || returnMode === "data" ? undefined : text,
        evidencePath: shot,
      };
      jobCtx?.setStage?.("done");
      return out;
    }

    for (const m of modules) {
      const key = typeof m === "string" ? m : m && m.key;
      const requestedFields =
        typeof m === "object" && Array.isArray(m.fields) ? m.fields : null;

      const spec = getSpec(key);
      if (!spec) {
        if (strict) throw new Error(`Módulo no soportado: ${key}`);
        out.errors.push({ key, error: "unsupported_module" });
        continue;
      }

      jobCtx?.setStage?.(`module:${key}`, { action: "locate-panel" });

      const panelSel = spec.panelSelector;
      let source = "panel";
      let panelOk = false;

      if (panelSel) {
        try {
          await page.waitForSelector(panelSel, {
            timeout: 1200,
            state: "attached",
          });
          panelOk = true;
        } catch {}
      }

      if (!panelOk || spec.forceNav) {
        jobCtx?.setStage?.(`module:${key}`, { action: "fallback-open" });
        const opened = await openModule(page, spec, {
          timeoutMs: OPEN_MODULE_TIMEOUT_MS,
        });
        if (opened) {
          source = "nav";
          try {
            await page.waitForTimeout(180);
          } catch {}
          if (panelSel) {
            try {
              await page.waitForSelector(panelSel, {
                timeout: 1500,
                state: "attached",
              });
              panelOk = true;
            } catch {}
          } else {
            panelOk = true;
          }
        }
      }

      if (spec.ready?.selector) {
        try {
          await page.waitForSelector(spec.ready.selector, {
            timeout: 1400,
            state: "attached",
          });
        } catch {}
      } else if (spec.ready?.textRegex) {
        const loc = page
          .getByText(spec.ready.textRegex, { exact: false })
          .first();
        try {
          await loc.waitFor({ timeout: 1200 });
        } catch {}
      }

      if (!panelOk && !getExtractor(key)) {
        out.modules.push({
          key,
          status: "error",
          source,
          error: "panel_not_found",
        });
        continue;
      }

      // Data
      jobCtx?.setStage?.(`module:${key}`, { action: "extract-data" });
      let data;
      let extractorWarnings = [];
      let unknownFields = [];
      const extractor = getExtractor(key);
      if (extractor) {
        try {
          const r = await extractor(page, {
            scope: panelSel || null,
            fields: requestedFields || null,
          });
          data = (r && r.data) || undefined;
          extractorWarnings = (r && r.warnings) || [];
          unknownFields =
            r && Array.isArray(r.unknownFields) ? r.unknownFields : [];
        } catch (e) {
          out.errors.push({
            key,
            error: "extractor_failed",
            message: String((e && e.message) || e),
          });
        }
      }

      // Snapshot (si aplica)
      let html, text;
      if (returnMode !== "data") {
        jobCtx?.setStage?.(`module:${key}`, { action: "snapshot" });
        if (panelSel && panelOk) {
          const snap = await getPanelSnapshot(page, panelSel, returnMode);
          html = snap.html;
          text = snap.text;
        } else {
          html = returnMode === "text" ? undefined : await page.content();
          text =
            returnMode === "html"
              ? undefined
              : await page.evaluate(() =>
                  (document?.body?.innerText || "").trim()
                );
        }
      }

      let shot = null;
      if (includeScreens) {
        const e = await saveEvidence(page, `scrape-${participantId}-${key}`);
        shot = e.path || null;
      }

      out.modules.push({
        key,
        status: "ok",
        source,
        requestedFields: requestedFields || null,
        unknownFields: unknownFields.length ? unknownFields : undefined,
        data,
        extractorWarnings,
        html,
        text,
        evidencePath: shot,
      });
    }

    jobCtx?.setStage?.("done");
    return out;
  } finally {
    if (page) await releasePage(page);
  }
};

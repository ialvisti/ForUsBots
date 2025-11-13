// src/bots/forusall-scrape-plan/runFlow.js
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
const { getSpec } = require("../../providers/forusall/planMap");
const {
  getExtractor,
} = require("../../extractors/forusall-plan/registry");
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
      !!document.querySelector("#plan-attr-form") ||
      !!document.querySelector("#bitemporal-plan-attrs") ||
      !!document.querySelector("#plan-design") ||
      !!document.querySelector("form[name='plan_attr_form']");
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

/** 
 * OPTIMIZATION: Navigation is no longer needed since all tab content is pre-loaded in DOM.
 * All form fields are accessible via document.querySelector() regardless of active tab.
 * This function is kept for backward compatibility but does nothing.
 */
async function openModule(
  page,
  spec,
  { timeoutMs = OPEN_MODULE_TIMEOUT_MS } = {}
) {
  // All data is pre-loaded in the DOM, no navigation needed
  return true;
}

/** Snapshot del panel */
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

/** Extrae notes como array desde el panel de Notes */
async function extractNotes(page) {
  return await page.evaluate(() => {
    function tidy(s) {
      return String(s == null ? "" : s)
        .replace(/\u00A0|\u2007|\u202F/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const notes = [];
    
    // Buscar todos los paneles y encontrar el que tiene heading "Notes"
    const panels = document.querySelectorAll(".panel");
    let notesPanel = null;
    
    for (const panel of panels) {
      const heading = panel.querySelector(".panel-heading h4");
      if (heading && tidy(heading.textContent) === "Notes") {
        notesPanel = panel.querySelector(".notes-panel");
        break;
      }
    }
    
    if (!notesPanel) return [];

    // Buscar todos los <li> que contienen "Notes:"
    const listItems = notesPanel.querySelectorAll("li");
    for (const li of listItems) {
      const text = tidy(li.textContent || "");
      // Buscar líneas que empiecen con "Notes:"
      if (text.startsWith("Notes:")) {
        // Extraer el texto después de "Notes:"
        const noteText = text.replace(/^Notes:\s*/, "").trim();
        if (noteText && noteText.length > 0) {
          notes.push(noteText);
        }
      }
    }

    return notes;
  });
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
    planId,
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
    url: `https://employer.forusall.com/plans/${encodeURIComponent(planId)}/edit`,
    planId,
    modulesRequested: modules,
    modules: [],
    notes: [],
    full: null,
    errors: [],
    warnings: invalidModules.length
      ? [{ type: "invalid_modules_ignored", keys: invalidModules }]
      : [],
  };

  let page = null;
  try {
    // 1) Página del pool compartido
    page = await getPageFromPool({ siteUserEmail: SITE_USER });
    page.setDefaultTimeout(PW_DEFAULT_TIMEOUT);
    page.setDefaultNavigationTimeout(PW_DEFAULT_TIMEOUT + 2000);

    // 2) GOTO súper rápido al plan
    jobCtx?.setStage?.("goto-plan", { planId });
    await gotoFast(page, out.url, Math.max(20000, timeoutMs));

    // 3) Estado inicial
    let urlNow = page.url() || "";
    let needLogin = /\/sign_in\b/i.test(urlNow);
    let hasShell = false;

    if (!needLogin) {
      hasShell = await waitForShellFast(page, { timeoutMs: SHELL_WAIT_MS });
      if (!hasShell) {
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
        await saveEvidence(page, `scrape-login-plan-${planId}`);
      }
      await saveContextStorageState(page.context(), SITE_USER);
      
      // OPTIMIZATION: Reduced wait from 500ms to 200ms
      await page.waitForTimeout(200);
      
      await gotoFast(page, out.url, Math.max(20000, timeoutMs));
      
      // OPTIMIZATION: Use waitForShellFast instead of artificial wait
      hasShell = await waitForShellFast(page, { timeoutMs: SHELL_WAIT_MS });
      if (!hasShell) {
        try {
          await page.waitForSelector(
            "#plan-attr-form, #bitemporal-plan-attrs, form[name='plan_attr_form']",
            {
              timeout: 5000,
              state: "attached",
            }
          );
          hasShell = true;
        } catch {
          throw new Error(
            "No se detectó el formulario del plan después del login."
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
        const e = await saveEvidence(page, `scrape-full-plan-${planId}`);
        shot = e.path || null;
      }
      // Extraer notes
      out.notes = await extractNotes(page);
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
      let source = "static"; // OPTIMIZATION: All data is pre-loaded, no navigation needed
      let panelOk = true; // OPTIMIZATION: Always true since all panels exist in DOM

      // OPTIMIZATION: All tab content is pre-loaded in DOM, no need to check visibility or navigate
      // All form fields are accessible via document.querySelector() regardless of active tab
      
      // Verificar que el panel existe en el DOM (quick check)
      if (panelSel) {
        try {
          await page.waitForSelector(panelSel, {
            timeout: 800, // OPTIMIZATION: Reduced from 1200ms
            state: "attached",
          });
        } catch {}
      }

      // OPTIMIZATION: Verificar selector ready si existe (sin waits adicionales)
      if (spec.ready?.selector) {
        try {
          await page.waitForSelector(spec.ready.selector, {
            timeout: 800, // OPTIMIZATION: Reduced from 3000ms
            state: "attached",
          });
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
      
      // OPTIMIZATION: No need to wait, data is already in DOM
      
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
        const e = await saveEvidence(page, `scrape-plan-${planId}-${key}`);
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

    // Extraer notes al final
    jobCtx?.setStage?.("extract-notes");
    out.notes = await extractNotes(page);

    jobCtx?.setStage?.("done");
    return out;
  } finally {
    if (page) await releasePage(page);
  }
};


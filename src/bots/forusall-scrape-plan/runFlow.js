// src/bots/forusall-scrape-plan/runFlow.js
//
// OPTIMIZATION HISTORY:
// - Phase 1 (Nov 2025): Eliminated tab navigation (all content pre-loaded in DOM) - 95% faster
// - Phase 2 (Nov 2025): Skip navigation if already on target page - reduces goto-plan from 3.3s to ~0.1s (cached)
//
const {
  getPageFromPool,
  releasePage,
  gotoFast,
} = require("../../engine/sharedContext");
const { saveEvidence } = require("../../engine/evidence");
const { getSpec } = require("../../providers/forusall/planMap");
const {
  getExtractor,
} = require("../../extractors/forusall-plan/registry");
const { ensureAuthForTarget } = require("../../engine/auth/loginOtp");

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

/**
 * Extract a bounded, internal-safe lifecycle view from the real Notes and
 * Timeline panels.  `notes` remains a string[] for wire compatibility while
 * `entries` preserves the event date and lifecycle transitions needed for
 * plan-status decisions.
 */
async function extractPlanHistory(page) {
  const empty = (status) => ({
    schemaVersion: 1,
    extractionStatus: status,
    current: { status: null, active: null, statusAsOf: null },
    entries: [],
    notes: [],
  });

  try {
    return await page.evaluate(() => {
      const MAX_ENTRIES = 20;
      const MAX_NOTES = 20;
      const MAX_NOTE_CHARS = 500;
      const MAX_VALUE_CHARS = 160;
      const LIFECYCLE_FIELDS = [
        "active",
        "status",
        "terminated_status_as_of",
        "actively_managed_status_as_of",
      ];

      function tidy(value, limit = MAX_NOTE_CHARS) {
        const withoutControls = Array.from(String(value == null ? "" : value))
          .filter((character) => {
            const codePoint = character.codePointAt(0);
            return codePoint === 9 || codePoint === 10 || codePoint === 13
              || (codePoint >= 32 && codePoint !== 127);
          })
          .join("");
        return withoutControls
          .replace(/\u00A0|\u2007|\u202F/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, limit);
      }

      function readControl(...selectors) {
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (!el) continue;
          const tag = String(el.tagName || "").toLowerCase();
          const type = String(el.type || "").toLowerCase();
          if (type === "checkbox" || type === "radio") return !!el.checked;
          const normalize = (value) => {
            const cleaned = tidy(value, MAX_VALUE_CHARS);
            if (selector === "#active") {
              if (cleaned.toLowerCase() === "true") return true;
              if (cleaned.toLowerCase() === "false") return false;
            }
            return cleaned || null;
          };
          if (tag === "select") {
            const option = el.options && el.options[el.selectedIndex];
            return normalize(option ? option.textContent : el.value);
          }
          return normalize(el.value);
        }
        return null;
      }

      function parseChanges(raw) {
        const text = tidy(raw, 3000).replace(/^Changes:\s*/i, "");
        const lifecycleFields = new Set(LIFECYCLE_FIELDS);
        // Every portal field starts a new change segment.  Use all field labels
        // as boundaries, then publish only the lifecycle allowlist below.  If
        // we look only for lifecycle labels, an unrelated trailing change is
        // incorrectly appended to the final lifecycle value.
        const matcher = /(?:^|\s)([A-Za-z][A-Za-z0-9_]*)\s*:\s*/g;
        const starts = [];
        let match;
        while ((match = matcher.exec(text)) !== null) {
          starts.push({ field: match[1].toLowerCase(), valueStart: matcher.lastIndex, index: match.index });
        }
        const changes = [];
        for (let index = 0; index < starts.length; index += 1) {
          const start = starts[index];
          if (!lifecycleFields.has(start.field)) continue;
          const end = starts[index + 1] ? starts[index + 1].index : text.length;
          const value = text.slice(start.valueStart, end).trim();
          const separator = value.match(/\s+to\s+/i);
          if (!separator || separator.index == null) continue;
          const from = tidy(value.slice(0, separator.index), MAX_VALUE_CHARS);
          const to = tidy(value.slice(separator.index + separator[0].length), MAX_VALUE_CHARS);
          if (from || to) changes.push({ field: start.field, from, to });
        }
        return changes;
      }

      function eventDate(items, source) {
        const prefix = source === "notes" ? /(?:updated|created)\s+on\s+(\d{4}-\d{2}-\d{2})/i : /effective\s+on\s+(\d{4}-\d{2}-\d{2})/i;
        for (const item of items) {
          const found = item.match(prefix);
          if (found) return found[1];
        }
        return null;
      }

      const panels = [...document.querySelectorAll(".panel")];
      const historyPanels = [];
      for (const panel of panels) {
        const heading = tidy(
          panel.querySelector(".panel-heading h4, .panel-heading")?.textContent,
          80
        ).toLowerCase();
        if (heading !== "notes" && heading !== "timeline") continue;
        const body = panel.querySelector(".notes-panel");
        if (body) historyPanels.push({ source: heading, body });
      }
      historyPanels.sort((left, right) => {
        if (left.source === right.source) return 0;
        return left.source === "notes" ? -1 : 1;
      });

      if (!historyPanels.length) {
        return {
          schemaVersion: 1,
          extractionStatus: "panel_missing",
          current: {
            status: readControl("#status"),
            active: readControl("#active"),
            statusAsOf: readControl("#status_as_of", "#terminated_status_as_of"),
          },
          entries: [],
          notes: [],
        };
      }

      const notes = [];
      const entries = [];
      for (const { source, body } of historyPanels) {
        const eventNodes = [...body.querySelectorAll(":scope > .scrollbar > div")];
        for (const eventNode of eventNodes) {
          const items = [...eventNode.querySelectorAll("li")]
            .map((li) => tidy(li.textContent, 3000))
            .filter(Boolean);
          if (!items.length) continue;
          const noteItem = items.find((item) => /^Notes\s*:/i.test(item));
          const note = noteItem
            ? tidy(noteItem.replace(/^Notes\s*:\s*/i, ""), MAX_NOTE_CHARS)
            : null;
          if (source === "notes" && note && !notes.includes(note) && notes.length < MAX_NOTES) {
            notes.push(note);
          }
          const changesItem = items.find((item) => /^Changes\s*:/i.test(item));
          const changes = changesItem ? parseChanges(changesItem) : [];
          const lifecycleNote = !!note && /terminat|deconvert|last payroll|force[ -]?out|freeze|conversion/i.test(note);
          if (!changes.length && !lifecycleNote) continue;
          const date = eventDate(items, source);
          const entry = {
            source,
            note,
            changes,
          };
          if (source === "notes") entry.occurredAt = date;
          if (source === "timeline") entry.effectiveOn = date;
          entries.push(entry);
          if (entries.length >= MAX_ENTRIES) break;
        }
        if (entries.length >= MAX_ENTRIES) break;
      }

      return {
        schemaVersion: 1,
        extractionStatus: entries.length || notes.length ? "ok" : "empty",
        current: {
          status: readControl("#status"),
          active: readControl("#active"),
          statusAsOf: readControl("#status_as_of", "#terminated_status_as_of"),
        },
        entries,
        notes,
      };
    });
  } catch {
    return empty("parse_error");
  }
}

async function runFlow({ meta, jobCtx }) {
  const account = jobCtx && jobCtx.account;
  if (!account || !account.siteUser || !account.sitePass || !account.totpSecret) {
    throw new Error(
      "runFlow: jobCtx.account ausente o incompleto (siteUser/sitePass/totpSecret requeridos)"
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
    planHistory: null,
    full: null,
    errors: [],
    warnings: invalidModules.length
      ? [{ type: "invalid_modules_ignored", keys: invalidModules }]
      : [],
  };

  let page = null;
  try {
    // 1) Página del pool compartido
    page = await getPageFromPool({ siteUserEmail: account.siteUser });
    page.setDefaultTimeout(PW_DEFAULT_TIMEOUT);
    page.setDefaultNavigationTimeout(PW_DEFAULT_TIMEOUT + 2000);

    // 2) OPTIMIZATION PHASE 2: Skip navigation if already on target page
    jobCtx?.setStage?.("goto-plan", { planId });
    
    const currentUrl = page.url() || "";
    const targetUrl = out.url;
    const normalizedCurrent = currentUrl.split('?')[0].split('#')[0];
    const normalizedTarget = targetUrl.split('?')[0].split('#')[0];
    
    // Check if we're already on the exact plan edit page
    if (normalizedCurrent === normalizedTarget) {
      // OPTIMIZATION PHASE 2: Already on page, verify shell and skip navigation
      const alreadyHasShell = await waitForShellFast(page, { timeoutMs: 1000 });
      if (alreadyHasShell) {
        jobCtx?.setStage?.("goto-plan", { planId, cached: true, skipped: true });
      } else {
        // Shell not ready, need to navigate anyway
        await gotoFast(page, targetUrl, Math.max(20000, timeoutMs));
      }
    } else {
      // Navigate to the plan page
      await gotoFast(page, targetUrl, Math.max(20000, timeoutMs));
    }

    // 3) Estado inicial
    let urlNow = page.url() || "";
    let needLogin = /\/sign_in\b/i.test(urlNow);
    let hasShell = false;

    if (!needLogin) {
      // OPTIMIZATION PHASE 2: Reduced wait timeout from SHELL_WAIT_MS to 2000ms
      hasShell = await waitForShellFast(page, { timeoutMs: 2000 });
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
      // Define shell selectors for the plan edit page
      const SHELL_PLAN = [
        "#plan-attr-form",
        "#bitemporal-plan-attrs",
        "#plan-design",
        "form[name='plan_attr_form']",
      ];

      // Use centralized auth that handles OTP robustly
      const authRes = await ensureAuthForTarget(page, {
        loginUrl,
        targetUrl,
        selectors,
        shellSelectors: SHELL_PLAN,
        jobCtx,
        account,
        saveSession: true,
      });

      if (includeScreens && authRes.didLogin) {
        await saveEvidence(page, `scrape-login-plan-${planId}`);
      }
      
      // OPTIMIZATION PHASE 2: Reduced wait from 500ms to 100ms
      await page.waitForTimeout(100);
      
      // Shell is already verified by ensureAuthForTarget
      hasShell = authRes.shellReady;
      
      if (!hasShell) {
        throw new Error(
          "No se detectó el formulario del plan después del login."
        );
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
      const history = await extractPlanHistory(page);
      out.notes = history.notes;
      out.planHistory = history;
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

    // Extraer Notes + Timeline al final.
    jobCtx?.setStage?.("extract-notes");
    const history = await extractPlanHistory(page);
    out.notes = history.notes;
    out.planHistory = history;

    jobCtx?.setStage?.("done");
    return out;
  } finally {
    if (page) await releasePage(page);
  }
}

module.exports = Object.assign(runFlow, { extractPlanHistory });

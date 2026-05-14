// src/bots/forusall-update-plan/runFlow.js
// Bot que actualiza campos del formulario de edición de un plan en
// https://employer.forusall.com/plans/{planId}/edit
//
// - Clasifica cada campo del payload por tipo de input mirando el DOM (text /
//   textarea / number / select / checkbox / date / radio) en una sola pasada,
//   evitando mantener listas hardcodeadas.
// - Aplica updates en batch para texto (un solo page.evaluate), y por tipo
//   específico para selects, checkboxes y datepickers.
// - Soporta `employer_contribution_formula` como reemplazo total de los match
//   tiers, aprovechando la función global `append_tier()` del propio web.
// - Detecta éxito vs fallo con Promise.race entre `framenavigated` (refresh →
//   ÉXITO) y `dialog` (alert() del navegador → FALLO con su mensaje).

const {
  getPageFromPool,
  releasePage,
  gotoFast,
} = require("../../engine/sharedContext");
const { saveEvidence } = require("../../engine/evidence");
const { ensureAuthForTarget } = require("../../engine/auth/loginOtp");
const { setEffectiveDate } = require("../../engine/utils/date");

const SHELL_PLAN = [
  "#plan-attr-form",
  "#bitemporal-plan-attrs",
  "#plan-design",
  "form[name='plan_attr_form']",
];

const SAVE_BTN = 'input[type="submit"][name="commit"][value="Save"]';
const NOTES_SEL = 'textarea[name="notes"]';

const SHELL_WAIT_MS = Math.max(
  600,
  parseInt(process.env.SHELL_WAIT_MS || "3000", 10)
);
const PW_DEFAULT_TIMEOUT = Math.max(
  2000,
  parseInt(process.env.PW_DEFAULT_TIMEOUT || "6000", 10)
);

async function quickStateCheck(page) {
  return await page.evaluate(() => {
    const href = String(location.href || "");
    const onLogin = /\/sign_in\b/i.test(href);
    const hasShell =
      !!document.querySelector("#plan-attr-form") ||
      !!document.querySelector("#bitemporal-plan-attrs") ||
      !!document.querySelector("#plan-design") ||
      !!document.querySelector("form[name='plan_attr_form']");
    return { onLogin, hasShell, href };
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

/** Clasifica cada `name` mirando el DOM una sola vez. */
async function classifyFields(page, names) {
  return await page.evaluate((nameList) => {
    const out = {};
    for (const name of nameList) {
      let el = document.querySelector(`[name="${name}"]`);
      if (!el) el = document.getElementById(name);
      if (!el) {
        out[name] = { type: "not_found" };
        continue;
      }
      const tag = (el.tagName || "").toLowerCase();
      if (tag === "select") {
        out[name] = { type: "select" };
      } else if (tag === "textarea") {
        out[name] = { type: "textarea" };
      } else if (tag === "input") {
        const t = (el.type || "").toLowerCase();
        if (t === "checkbox") out[name] = { type: "checkbox" };
        else if (t === "radio") out[name] = { type: "radio" };
        else if (
          el.classList.contains("datepicker") ||
          el.classList.contains("hasDatepicker")
        )
          out[name] = { type: "date" };
        else out[name] = { type: "text" };
      } else {
        out[name] = { type: "unknown", tag };
      }
    }
    return out;
  }, names);
}

/** Batch para inputs de texto/textarea/number — un solo page.evaluate. */
async function applyTextUpdatesBatch(page, pairs) {
  const entries = Object.entries(pairs).filter(([, v]) => v !== undefined);
  if (!entries.length) return;
  await page.evaluate((items) => {
    for (const [sel, val] of items) {
      const el = document.querySelector(sel);
      if (!el) continue;
      try {
        el.removeAttribute("readonly");
        el.removeAttribute("disabled");
        el.value = val == null ? "" : String(val);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        if (el.blur) el.blur();
      } catch {}
    }
  }, entries);
}

async function setSelectByValue(page, selector, value) {
  if (value === undefined || value === null) return;
  const v = String(value);
  await page
    .locator(selector)
    .selectOption({ value: v }, { timeout: 4000 })
    .catch(async () => {
      await page
        .locator(selector)
        .selectOption({ label: v }, { timeout: 4000 });
    })
    .catch(() => {});
}

async function setCheckbox(page, selector, value) {
  const checked = !!value && value !== "false" && value !== 0 && value !== "0";
  await page
    .locator(selector)
    .first()
    .setChecked(checked, { timeout: 4000 })
    .catch(() => {});
}

/** Reemplaza todos los match tiers usando la función global `append_tier`. */
async function applyMatchTiers(page, tiers) {
  await page.evaluate(() => {
    const removeLinks = document.querySelectorAll(
      "#er-contribution-formula .add-remove-tier a, #er-contribution-formula .contribution-formula .add-remove-tier a"
    );
    removeLinks.forEach((a) => {
      try {
        a.click();
      } catch {}
    });
  });
  await page.waitForTimeout(150);
  await page.evaluate((rows) => {
    if (typeof window.append_tier !== "function") return;
    for (const r of rows) {
      try {
        window.append_tier(r.match_value, r.percent_pay);
      } catch {}
    }
  }, tiers);
}

async function applyUpdates(page, updates) {
  const applied = [];
  const skipped = [];

  // Caso especial: tiers
  const updatesCopy = { ...updates };
  let tiers = null;
  if (Array.isArray(updatesCopy.employer_contribution_formula)) {
    tiers = updatesCopy.employer_contribution_formula;
    delete updatesCopy.employer_contribution_formula;
  }

  const names = Object.keys(updatesCopy);
  const classified = names.length ? await classifyFields(page, names) : {};

  const textPairs = {};
  const selects = [];
  const checkboxes = [];
  const dates = [];

  for (const name of names) {
    const cls = classified[name];
    const value = updatesCopy[name];
    const sel = `[name="${name}"]`;

    if (!cls || cls.type === "not_found") {
      skipped.push({ name, reason: "not_found" });
      continue;
    }

    switch (cls.type) {
      case "text":
      case "textarea":
        textPairs[sel] = value;
        applied.push(name);
        break;
      case "select":
        selects.push([sel, value]);
        applied.push(name);
        break;
      case "checkbox":
        checkboxes.push([sel, value]);
        applied.push(name);
        break;
      case "date":
        dates.push([sel, value]);
        applied.push(name);
        break;
      case "radio":
        skipped.push({ name, reason: "radio_unsupported" });
        break;
      default:
        skipped.push({ name, reason: cls.type || "unknown" });
    }
  }

  if (Object.keys(textPairs).length) {
    await applyTextUpdatesBatch(page, textPairs);
  }

  for (const [sel, value] of selects) {
    await setSelectByValue(page, sel, value);
  }

  for (const [sel, value] of checkboxes) {
    await setCheckbox(page, sel, value);
  }

  for (const [sel, value] of dates) {
    const v =
      value === null || value === undefined ? null : String(value).trim();
    if (!v) {
      await applyTextUpdatesBatch(page, { [sel]: "" });
    } else {
      await setEffectiveDate(page, sel, v);
    }
  }

  if (tiers !== null) {
    await applyMatchTiers(page, tiers);
    applied.push("employer_contribution_formula");
  }

  return { applied, skipped };
}

module.exports = async function runFlow({ meta, jobCtx }) {
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
    note,
    updates,
    includeScreens = false,
    timeoutMs = 30000,
  } = meta;

  const targetUrl = `https://employer.forusall.com/plans/${encodeURIComponent(
    planId
  )}/edit`;

  let page = null;
  try {
    page = await getPageFromPool({ siteUserEmail: account.siteUser });
    page.setDefaultTimeout(PW_DEFAULT_TIMEOUT);
    page.setDefaultNavigationTimeout(PW_DEFAULT_TIMEOUT + 2000);

    jobCtx?.setStage?.("goto-plan", { planId });

    const currentUrl = page.url() || "";
    const normalizedCurrent = currentUrl.split("?")[0].split("#")[0];
    const normalizedTarget = targetUrl.split("?")[0].split("#")[0];

    if (normalizedCurrent === normalizedTarget) {
      const alreadyHasShell = await waitForShellFast(page, { timeoutMs: 1000 });
      if (!alreadyHasShell) {
        await gotoFast(page, targetUrl, Math.max(20000, timeoutMs));
      }
    } else {
      await gotoFast(page, targetUrl, Math.max(20000, timeoutMs));
    }

    let urlNow = page.url() || "";
    let needLogin = /\/sign_in\b/i.test(urlNow);
    let hasShell = false;

    if (!needLogin) {
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

    if (needLogin || !hasShell) {
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
        await saveEvidence(page, `update-plan-login-${planId}`).catch(() => {});
      }
      hasShell = authRes.shellReady;
      if (!hasShell) {
        throw new Error(
          "No se detectó el formulario del plan después del login."
        );
      }
    }

    // Llenar campos
    jobCtx?.setStage?.("fill", { fields: Object.keys(updates).length });
    const { applied, skipped } = await applyUpdates(page, updates);

    // Llenar campo de nota (justificación)
    await applyTextUpdatesBatch(page, { [NOTES_SEL]: note });

    // Race: dialog (fallo) vs framenavigated (refresh = éxito)
    jobCtx?.setStage?.("save");

    const raceTimeout = Math.max(15000, timeoutMs);

    const dialogPromise = page
      .waitForEvent("dialog", { timeout: raceTimeout })
      .then(async (dlg) => {
        const msg = dlg.message();
        try {
          await dlg.accept();
        } catch {}
        return { kind: "dialog", message: msg || "Dialog dismissed" };
      })
      .catch(() => null);

    const navPromise = page
      .waitForEvent("framenavigated", {
        predicate: (frame) => frame === page.mainFrame(),
        timeout: raceTimeout,
      })
      .then((frame) => ({ kind: "reload", url: frame.url() }))
      .catch(() => null);

    await page
      .locator(SAVE_BTN)
      .first()
      .click({ timeout: 8000 });

    jobCtx?.setStage?.("await_confirm");
    const result = await Promise.race([dialogPromise, navPromise]);

    if (!result) {
      throw new Error(
        "No se detectó respuesta del servidor tras hacer click en Save."
      );
    }

    if (result.kind === "dialog") {
      let evidencePath = null;
      if (includeScreens) {
        const ev = await saveEvidence(
          page,
          `update-plan-failed-${planId}`
        ).catch(() => null);
        evidencePath = ev?.path || null;
      }
      const err = new Error(result.message);
      err.code = "UPDATE_NOT_CONFIRMED";
      err.detail = {
        planId,
        url: targetUrl,
        dialogMessage: result.message,
        applied,
        skipped,
        evidencePath,
      };
      throw err;
    }

    // Éxito: la página navegó/recargó
    await waitForShellFast(page, { timeoutMs: 5000 });

    let evidencePath = null;
    if (includeScreens) {
      const ev = await saveEvidence(page, `update-plan-ok-${planId}`).catch(
        () => null
      );
      evidencePath = ev?.path || null;
    }

    jobCtx?.setStage?.("done");
    return {
      ok: true,
      code: "UPDATE_OK",
      message: "Plan updated successfully.",
      data: {
        planId,
        url: targetUrl,
        applied,
        skipped,
        notePreview: String(note).slice(0, 80),
        evidencePath,
      },
      warnings: skipped.length
        ? [{ type: "fields_skipped", fields: skipped }]
        : [],
      errors: [],
    };
  } finally {
    if (page) await releasePage(page);
  }
};

// src/bots/forusall-usersmanagement/runFlow.js
//
// Crea o edita usuarios en el admin panel de ForUsAll:
//   - mode === "create" → POST a /users via form #new_user (URL /users/new)
//   - mode === "edit"   → PATCH a /users/{userId} via form #edit_user_{userId}
//                          (URL /users/{userId}/edit)
//
// Llena campos de arriba a abajo (orden del DOM), maneja:
//   * AJAX sponsor_ids → list_payroll_setups_for_user (espera respuesta antes
//     de tocar payrollSetupIds)
//   * Diálogos JS reactivos (active=inactive, primary contact) — los acepta
//     como warnings, no fallo
//   * Reset MFA (solo edit): confirm() + alert() por target (admin, employer),
//     ejecutado antes del submit final
//
// Señal de éxito: redirección a /users con #flash_notice
//   - "User created successfully." / "User updated successfully."
// Señal de fallo: redirección a /users con #error_explanation > li[]

const {
  getPageFromPool,
  releasePage,
  gotoFast,
} = require("../../engine/sharedContext");
const { saveEvidence } = require("../../engine/evidence");
const { ensureAuthForTarget } = require("../../engine/auth/loginOtp");
const logger = require("../../engine/logger");

const PW_DEFAULT_TIMEOUT = Math.max(
  2000,
  parseInt(process.env.PW_DEFAULT_TIMEOUT || "6000", 10)
);

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

async function setMultiSelect(page, selector, ids) {
  const values = (ids || []).map((x) => String(x));
  if (!values.length) {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      for (const opt of el.options) opt.selected = false;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, selector);
    return;
  }
  await page
    .locator(selector)
    .selectOption(values, { timeout: 6000 })
    .catch(() => {});
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.dispatchEvent(new Event("change", { bubbles: true }));
  }, selector);
}

async function readMfaStatus(page, statusSel) {
  try {
    const txt = await page.$eval(statusSel, (el) =>
      (el.textContent || el.innerText || "").trim().toLowerCase()
    );
    return txt;
  } catch {
    return null;
  }
}

async function performMfaReset(page, target, sels, timeouts) {
  // target: "employer" | "admin"
  const cfg = target === "admin" ? sels.mfaAdmin : sels.mfaEmployer;
  const btn = page.locator(cfg.resetBtn);

  let exists = false;
  try {
    await btn.waitFor({ state: "attached", timeout: 2000 });
    exists = true;
  } catch {}
  if (!exists) {
    return { target, ok: false, reason: "button_not_found" };
  }

  let disabled = false;
  try {
    disabled = await btn.isDisabled();
  } catch {}
  if (disabled) {
    return { target, ok: false, reason: "button_disabled" };
  }

  const status0 = await readMfaStatus(page, cfg.status);
  if (status0 === "not enrolled") {
    return { target, ok: true, reason: "already_not_enrolled", status: status0 };
  }

  let confirmMessage = null;
  let alertMessage = null;
  try {
    await Promise.all([
      (async () => {
        const dlg = await nextDialogOfType(page, "confirm", timeouts.confirmWait);
        confirmMessage = dlg.message();
        await dlg.accept();
      })(),
      btn.click({ timeout: Math.max(PW_DEFAULT_TIMEOUT, timeouts.confirmWait + 1500) }),
    ]);
  } catch (e) {
    return {
      target,
      ok: false,
      reason: "confirm_failed",
      error: e?.message || String(e),
    };
  }

  try {
    const alertDlg = await nextDialogOfType(page, "alert", timeouts.alertWait);
    alertMessage = alertDlg.message() || null;
    await alertDlg.accept();
  } catch {
    // alert puede no aparecer en algunas condiciones — no es fatal
  }

  // Esperar que mfa_status cambie a "not enrolled"
  const endAt = Date.now() + timeouts.statusSettle;
  let status1 = null;
  do {
    status1 = await readMfaStatus(page, cfg.status);
    if (status1 === "not enrolled") break;
    await page.waitForTimeout(250);
  } while (Date.now() < endAt);

  const ok = status1 === "not enrolled";
  return {
    target,
    ok,
    reason: ok ? "reset_ok" : "status_did_not_settle",
    status: status1,
    confirmMessage,
    alertMessage,
  };
}

async function applyUserFields(page, fields, sels, timeouts) {
  const f = sels.fields;
  const applied = [];
  const skipped = [];
  const warnings = [];

  // Helper interno para registrar lo aplicado
  const mark = (k) => applied.push(k);

  // a. texts (firstName, lastName, email)
  const textPairs = {};
  if (Object.prototype.hasOwnProperty.call(fields, "firstName")) {
    textPairs[f.firstName] = fields.firstName;
    mark("firstName");
  }
  if (Object.prototype.hasOwnProperty.call(fields, "lastName")) {
    textPairs[f.lastName] = fields.lastName;
    mark("lastName");
  }
  if (Object.prototype.hasOwnProperty.call(fields, "email")) {
    textPairs[f.email] = fields.email;
    mark("email");
  }
  if (Object.keys(textPairs).length) {
    await applyTextUpdatesBatch(page, textPairs);
  }

  // b. password (solo si el input existe — en edit puede no estar)
  if (Object.prototype.hasOwnProperty.call(fields, "password")) {
    const exists = await page.locator(f.password).count().catch(() => 0);
    if (exists) {
      await applyTextUpdatesBatch(page, {
        [f.password]: fields.password,
        [f.passwordConfirmation]: fields.passwordConfirmation,
      });
      mark("password");
      mark("passwordConfirmation");
    } else {
      skipped.push({ field: "password", reason: "input_not_present" });
    }
  }

  // c. role (select single)
  if (Object.prototype.hasOwnProperty.call(fields, "role")) {
    await setSelectByValue(page, f.role, fields.role);
    mark("role");
  }

  // d. sponsorIds (multi) — dispara AJAX que repuebla payrollSetupIds
  let payrollAjaxPromise = null;
  if (Object.prototype.hasOwnProperty.call(fields, "sponsorIds")) {
    payrollAjaxPromise = page
      .waitForResponse(
        (resp) =>
          resp.url().includes("/list_payroll_setups_for_user") && resp.status() < 400,
        { timeout: timeouts.payrollAjax }
      )
      .catch(() => null);
    await setMultiSelect(page, f.sponsorIds, fields.sponsorIds);
    mark("sponsorIds");
  }

  // e. userGroupIds (multi)
  if (Object.prototype.hasOwnProperty.call(fields, "userGroupIds")) {
    await setMultiSelect(page, f.userGroupIds, fields.userGroupIds);
    mark("userGroupIds");
  }

  // f. payrollSetupIds (multi) — esperar AJAX si sponsorIds cambió
  if (Object.prototype.hasOwnProperty.call(fields, "payrollSetupIds")) {
    if (payrollAjaxPromise) {
      await payrollAjaxPromise;
      // Pequeño settle para que jQuery termine de repintar el <select>
      await page.waitForTimeout(200);
    }
    await setMultiSelect(page, f.payrollSetupIds, fields.payrollSetupIds);
    mark("payrollSetupIds");
  } else if (payrollAjaxPromise) {
    // Aún si no se modifica explícitamente, esperar el AJAX para que el form
    // se envíe con un estado estable
    await payrollAjaxPromise;
  }

  // g. active — puede disparar confirm/alert reactivos (primary contact);
  //    los aceptamos como warnings. Setup transient listener.
  if (Object.prototype.hasOwnProperty.call(fields, "active")) {
    const reactiveDialogs = [];
    const onDialog = async (dlg) => {
      try {
        reactiveDialogs.push({ type: dlg.type(), message: dlg.message() });
        await dlg.accept();
      } catch {}
    };
    page.on("dialog", onDialog);
    try {
      await setSelectByValue(page, f.active, fields.active ? "true" : "false");
      // Dar tiempo a que el handler synchronous AJAX corra y emita su dialog
      await page.waitForTimeout(400);
    } finally {
      page.off("dialog", onDialog);
    }
    if (reactiveDialogs.length) {
      for (const d of reactiveDialogs) {
        warnings.push({ type: `active_change_${d.type}`, message: d.message });
      }
    }
    mark("active");
  }

  // h. isNewDashboardUser (select)
  if (Object.prototype.hasOwnProperty.call(fields, "isNewDashboardUser")) {
    await setSelectByValue(
      page,
      f.isNewDashboardUser,
      fields.isNewDashboardUser ? "true" : "false"
    );
    mark("isNewDashboardUser");
  }

  // i. participantId (text)
  if (Object.prototype.hasOwnProperty.call(fields, "participantId")) {
    await applyTextUpdatesBatch(page, {
      [f.participantId]: fields.participantId,
    });
    mark("participantId");
  }

  // j. notAnEmployee (checkbox — checked = "Not an employee")
  if (Object.prototype.hasOwnProperty.call(fields, "notAnEmployee")) {
    await setCheckbox(page, f.notAnEmployee, fields.notAnEmployee);
    mark("notAnEmployee");
  }

  // k. commSettings (selects true/false)
  if (Object.prototype.hasOwnProperty.call(fields, "commSettings")) {
    const cs = fields.commSettings || {};
    for (const key of Object.keys(cs)) {
      const sel = f.comm[key];
      if (!sel) {
        skipped.push({ field: `commSettings.${key}`, reason: "selector_missing" });
        continue;
      }
      await setSelectByValue(page, sel, cs[key] ? "true" : "false");
      mark(`commSettings.${key}`);
    }
  }

  return { applied, skipped, warnings };
}

module.exports = async function runFlow({ meta, jobCtx }) {
  const account = jobCtx && jobCtx.account;
  if (!account || !account.siteUser || !account.sitePass || !account.totpSecret) {
    throw new Error(
      "runFlow: jobCtx.account ausente o incompleto (siteUser/sitePass/totpSecret requeridos)"
    );
  }

  const {
    mode,
    loginUrl,
    selectors,
    usersManagement,
    note,
    includeScreens = false,
    timeoutMs = 30000,
  } = meta;

  const sels = usersManagement.selectors;
  const timeouts = usersManagement.timeouts;

  const isCreate = mode === "create";
  const userId = isCreate ? null : meta.userId;
  const fields = isCreate ? meta.user : meta.updates;
  const resetMfa = isCreate ? "none" : (meta.resetMfa || "none");

  const targetUrl = isCreate
    ? usersManagement.newUrl
    : usersManagement.editUrlTemplate.replace(
        "{userId}",
        encodeURIComponent(String(userId))
      );

  const SHELL = isCreate
    ? [sels.formNew, sels.fields.firstName, sels.fields.email, sels.fields.password]
    : [sels.formEditPrefix, sels.fields.firstName, sels.fields.email];

  let page = null;
  try {
    page = await getPageFromPool({ siteUserEmail: account.siteUser });
    page.setDefaultTimeout(PW_DEFAULT_TIMEOUT);
    page.setDefaultNavigationTimeout(PW_DEFAULT_TIMEOUT + 2000);

    jobCtx?.setStage?.("goto", { mode, userId });
    await gotoFast(page, targetUrl, Math.max(20000, timeoutMs));

    const urlNow = page.url() || "";
    const needLogin = /\/sign_in\b/i.test(urlNow);
    let hasShell = false;
    if (!needLogin) {
      try {
        await page.locator(SHELL[0]).first().waitFor({ state: "attached", timeout: 2500 });
        hasShell = true;
      } catch {}
    }

    if (needLogin || !hasShell) {
      jobCtx?.setStage?.("auth");
      const authRes = await ensureAuthForTarget(page, {
        loginUrl,
        targetUrl,
        selectors,
        shellSelectors: SHELL,
        jobCtx,
        account,
        saveSession: true,
      });
      hasShell = authRes.shellReady;
      if (includeScreens && authRes.didLogin) {
        await saveEvidence(
          page,
          `users-management-login-${mode}-${userId || "new"}`
        ).catch(() => {});
      }
      if (!hasShell) {
        throw new Error(
          `No se detectó el formulario de ${mode} después del login (target=${targetUrl}).`
        );
      }
    }

    // Llenado de campos
    jobCtx?.setStage?.("fill", {
      mode,
      fieldKeys: Object.keys(fields || {}).length,
    });
    const fillRes = await applyUserFields(page, fields || {}, sels, timeouts);

    // Reset MFA (solo edit)
    const mfaReset = {};
    if (!isCreate && resetMfa !== "none") {
      jobCtx?.setStage?.("reset-mfa", { resetMfa });
      const targets = [];
      if (resetMfa === "admin" || resetMfa === "both") targets.push("admin");
      if (resetMfa === "employer" || resetMfa === "both") targets.push("employer");
      for (const tg of targets) {
        const r = await performMfaReset(page, tg, sels, timeouts);
        mfaReset[tg] = r;
      }
    }

    // Submit del form
    jobCtx?.setStage?.("submit");
    const raceTimeout = Math.max(timeouts.submit, timeoutMs);

    // Dialogos secundarios (warnings) durante el submit — captura no bloqueante
    const submitDialogs = [];
    const onSubmitDialog = async (dlg) => {
      try {
        submitDialogs.push({ type: dlg.type(), message: dlg.message() });
        await dlg.accept();
      } catch {}
    };
    page.on("dialog", onSubmitDialog);

    const listUrlNorm = usersManagement.listUrl.replace(/\/$/, "");
    const navPromise = page
      .waitForEvent("framenavigated", {
        predicate: (frame) => {
          if (frame !== page.mainFrame()) return false;
          const u = (frame.url() || "").split("?")[0].split("#")[0].replace(/\/$/, "");
          return u === listUrlNorm;
        },
        timeout: raceTimeout,
      })
      .catch(() => null);

    await page
      .locator(sels.submitBtn)
      .first()
      .click({ timeout: 8000 });

    jobCtx?.setStage?.("await-redirect");
    const navResult = await navPromise;
    page.off("dialog", onSubmitDialog);

    if (!navResult) {
      // Tal vez no llegó al /users — recolectar diagnóstico
      let ev = null;
      if (includeScreens) {
        ev = await saveEvidence(
          page,
          `users-management-no-redirect-${mode}-${userId || "new"}`
        ).catch(() => null);
      }
      const err = new Error(
        `No se detectó redirección a ${usersManagement.listUrl} tras el submit.`
      );
      err.code = isCreate ? "CREATE_TIMEOUT" : "UPDATE_TIMEOUT";
      err.detail = {
        mode,
        userId,
        url: page.url() || null,
        submitDialogs,
        applied: fillRes.applied,
        skipped: fillRes.skipped,
        evidencePath: ev?.path || null,
      };
      throw err;
    }

    // Leer flash / errores
    jobCtx?.setStage?.("verify");
    await page.waitForTimeout(200);
    const flashNotice = await page
      .$eval(sels.listFlashSuccess, (el) =>
        (el.textContent || el.innerText || "").trim()
      )
      .catch(() => null);
    const errorItems = await page
      .$$eval(sels.listErrorItems, (els) =>
        els.map((e) => (e.textContent || e.innerText || "").trim()).filter(Boolean)
      )
      .catch(() => []);

    if (errorItems.length) {
      let ev = null;
      if (includeScreens) {
        ev = await saveEvidence(
          page,
          `users-management-failed-${mode}-${userId || "new"}`
        ).catch(() => null);
      }
      const err = new Error(
        `${isCreate ? "Create" : "Update"} fallido: ${errorItems.join("; ")}`
      );
      err.code = isCreate ? "CREATE_FAILED" : "UPDATE_FAILED";
      err.detail = {
        mode,
        userId,
        errors: errorItems,
        applied: fillRes.applied,
        skipped: fillRes.skipped,
        submitDialogs,
        evidencePath: ev?.path || null,
      };
      throw err;
    }

    let evidencePath = null;
    if (includeScreens) {
      const ev = await saveEvidence(
        page,
        `users-management-ok-${mode}-${userId || "new"}`
      ).catch(() => null);
      evidencePath = ev?.path || null;
    }

    jobCtx?.setStage?.("done");
    return {
      ok: true,
      code: isCreate ? "CREATE_OK" : "UPDATE_OK",
      message: isCreate
        ? "User created successfully."
        : "User updated successfully.",
      data: {
        mode,
        userId: userId || null,
        flashNotice: flashNotice || null,
        applied: fillRes.applied,
        skipped: fillRes.skipped,
        mfaReset: Object.keys(mfaReset).length ? mfaReset : null,
        submitDialogs,
        notePreview: String(note || "").slice(0, 80),
        evidencePath,
      },
      warnings: [
        ...(fillRes.warnings || []),
        ...(fillRes.skipped.length ? [{ type: "fields_skipped", fields: fillRes.skipped }] : []),
      ],
      errors: [],
    };
  } catch (error) {
    logger.error({ type: "bot.users_management.flow_error", error });
    throw error;
  } finally {
    if (page) await releasePage(page);
  }
};

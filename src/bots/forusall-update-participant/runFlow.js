// src/bots/forusall-update-participant/runFlow.js
// Flujo Playwright para ACTUALIZAR datos en el tab Census y guardar con nota.
// Optimizaciones: batch write de inputs de texto + tiempos más cortos.
// - Login/OTP igual al bot de scrape (sharedContext + TOTP).
// - Si recibimos "Projected Plan Entry Date" (yyyy-mm-dd), desmarcamos el checkbox y seteamos la fecha.
// - Preferred names: validar si inputs están listos; si no, click en #add-preferred-name y luego llenar.
// - Fechas: usar setEffectiveDate (datepicker-safe) para todos los campos de fecha.
// - ÉXITO: validar que el alert sea EXACTAMENTE "Participant updated successfully." (si no, FAIL).
//   Fallback: alerta inline efímera.
// NOTA: El bloqueo de recursos (imágenes, media, etc.) se maneja vía .env global.

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
const { saveContextStorageState } = require("../../engine/sessions");
const {
  acquireLogin,
  waitNewTotpWindowIfNeeded,
  markTotpUsed,
} = require("../../engine/loginLock");
const { setEffectiveDate } = require("../../engine/utils/date");

// Selectores de la UI (census)
const SEL = {
  form: "#census-details form.edit_participant",
  saveBtn:
    '#census-details form.edit_participant button.btn.btn-primary:has-text("Save"), #census-details form.edit_participant button[name="button"]',

  // Modal de nota
  noteModal: "#census-edit-note-modal",
  noteTextarea: "#participant_notes",
  noteSubmit:
    '#census-edit-note-modal input[type="submit"][value="Save"], #census-edit-note-modal .btn.btn-primary',

  // Alert inline (fallback)
  alertsRoot: '[data-alerts="alerts"]',
  alertsAny:
    '[data-alerts="alerts"] .alert, [data-alerts="alerts"] .alert-success, [data-alerts="alerts"] .alert-danger',

  // Campos
  firstName: "#participant_first_name",
  lastName: "#participant_last_name",
  preferredToggle: "#add-preferred-name",
  prefFirst: "#participant_first_name_preferred",
  prefLast: "#participant_last_name_preferred",
  eligibility: "#participant_eligibility_status",
  birthDate: "#participant_birth_date",
  hireDate: "#participant_hire_date",
  rehireDate: "#participant_rehire_date",
  terminationDate: "#participant_termination_date",
  projDefaultChk: "#participant_is_projected_plan_entry_date_default",
  projDate: "#participant_projected_plan_entry_date",

  addr1: "#participant_participant_contact_informations_address_1",
  addr2: "#participant_participant_contact_informations_address_2",
  city: "#participant_participant_contact_informations_city",
  state: "#participant_participant_contact_informations_state",
  zipcode: "#participant_participant_contact_informations_zipcode",

  email: "#participant_email",
  homeEmail: "#participant_home_email",
  phone: "#participant_phone",
};

const SHELL_WAIT_MS = Math.max(
  600,
  parseInt(process.env.SHELL_WAIT_MS || "2500", 10)
);
const PW_DEFAULT_TIMEOUT = Math.max(
  2000,
  parseInt(process.env.PW_DEFAULT_TIMEOUT || "5000", 10)
);

// ✅ Éxito SOLO cuando el alert trae EXACTAMENTE este texto (trim estricto).
const SUCCESS_ALERT_TEXT = "Participant updated successfully.";

async function quickStateCheck(page) {
  return await page.evaluate(() => {
    const href = String(location.href || "");
    const onLogin = /\/sign_in\b/i.test(href);
    const hasShell =
      !!document.querySelector("#tab-panel") ||
      !!document.querySelector("#census");
    return { onLogin, hasShell, href };
  });
}
async function waitForShellFast(
  page,
  { timeoutMs = SHELL_WAIT_MS, pollMs = 40 } = {}
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
        await page.waitForTimeout(250);
        break;
      } catch {}
    }
    markTotpUsed(SITE_USER);
  } finally {
    release();
  }
}

function clean(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// Batch write rápido de inputs de texto
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
  const v = clean(value);
  if (v === null) return;
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

/** Preferred Name: validar si inputs están listos; si no, click en toggle y habilitar. */
async function ensurePreferredInputsReady(page) {
  async function isReady(sel) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) === 0) return false;
      const visible = await loc.isVisible().catch(() => false);
      const disabled = await loc.isDisabled().catch(() => false);
      return visible && !disabled;
    } catch {
      return false;
    }
  }

  const firstReady = await isReady(SEL.prefFirst);
  const lastReady = await isReady(SEL.prefLast);
  if (firstReady && lastReady) return;

  const toggle = page.locator(SEL.preferredToggle).first();
  if ((await toggle.count()) > 0) {
    await toggle.click({ timeout: 3000 }).catch(() => {});
  } else {
    await page
      .evaluate(() => {
        document
          .querySelectorAll(".preferred-name.hidden")
          .forEach((el) => el.classList.remove("hidden"));
      })
      .catch(() => {});
  }

  await page
    .locator(SEL.prefFirst)
    .first()
    .waitFor({ state: "attached", timeout: 3000 })
    .catch(() => {});
  await page
    .locator(SEL.prefLast)
    .first()
    .waitFor({ state: "attached", timeout: 3000 })
    .catch(() => {});
}

/** Si vienen preferredFirstName/LastName en updates, aseguramos inputs listos */
async function maybeRevealPreferred(page, updates) {
  if (updates.preferredFirstName != null || updates.preferredLastName != null) {
    await ensurePreferredInputsReady(page);
  }
}

/** Projected Plan Entry Date: desmarcar checkbox y setear fecha con helper */
async function setProjectedEntryIfNeeded(page, updates) {
  const date = clean(updates.projectedPlanEntryDate);
  if (!date) return;

  await page
    .locator(SEL.projDefaultChk)
    .setChecked(false, { timeout: 5000 })
    .catch(() =>
      page
        .locator(SEL.projDefaultChk)
        .click({ timeout: 5000 })
        .catch(() => {})
    );

  const fld = page.locator(SEL.projDate);
  await fld.waitFor({ state: "attached", timeout: 3000 }).catch(() => {});
  try {
    const disabled = await fld.isDisabled({ timeout: 300 }).catch(() => false);
    if (disabled) {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.removeAttribute("disabled");
      }, SEL.projDate);
    }
  } catch {}
  await setEffectiveDate(page, SEL.projDate, date);
}

async function applyUpdates(page, updates) {
  const applied = [];

  // Preferred visibles si es necesario
  await maybeRevealPreferred(page, updates);

  // Batch para inputs de texto
  const textPairs = {};
  if (updates.firstName != null) {
    textPairs[SEL.firstName] = updates.firstName;
    applied.push("First Name");
  }
  if (updates.lastName != null) {
    textPairs[SEL.lastName] = updates.lastName;
    applied.push("Last Name");
  }
  if (updates.preferredFirstName != null) {
    textPairs[SEL.prefFirst] = updates.preferredFirstName;
    applied.push("Preferred First Name");
  }
  if (updates.preferredLastName != null) {
    textPairs[SEL.prefLast] = updates.preferredLastName;
    applied.push("Preferred Last Name");
  }
  if (updates.address1 != null) {
    textPairs[SEL.addr1] = updates.address1;
    applied.push("Address 1");
  }
  if (updates.address2 != null) {
    textPairs[SEL.addr2] = updates.address2;
    applied.push("Address 2");
  }
  if (updates.city != null) {
    textPairs[SEL.city] = updates.city;
    applied.push("City");
  }
  if (updates.state != null) {
    textPairs[SEL.state] = updates.state;
    applied.push("State");
  }
  if (updates.zipcode != null) {
    textPairs[SEL.zipcode] = updates.zipcode;
    applied.push("Zip Code");
  }
  if (updates.email != null) {
    textPairs[SEL.email] = updates.email;
    applied.push("Primary Email");
  }
  if (updates.homeEmail != null) {
    textPairs[SEL.homeEmail] = updates.homeEmail;
    applied.push("Home Email");
  }
  if (updates.phone != null) {
    textPairs[SEL.phone] = updates.phone;
    applied.push("Phone");
  }

  await applyTextUpdatesBatch(page, textPairs);

  // Select (eligibility)
  if (updates.eligibilityStatus != null) {
    await setSelectByValue(page, SEL.eligibility, updates.eligibilityStatus);
    if (!applied.includes("Eligibility Status"))
      applied.push("Eligibility Status");
  }

  // Fechas (datepicker-safe) o limpiar
  for (const [label, sel, key] of [
    ["Birth Date", SEL.birthDate, "birthDate"],
    ["Hire Date", SEL.hireDate, "hireDate"],
    ["Rehire Date", SEL.rehireDate, "rehireDate"],
    ["Termination Date", SEL.terminationDate, "terminationDate"],
  ]) {
    if (updates[key] != null) {
      const raw = updates[key];
      const v = clean(raw);
      if (v === null) {
        await applyTextUpdatesBatch(page, { [sel]: "" });
      } else {
        await setEffectiveDate(page, sel, v);
      }
      if (!applied.includes(label)) applied.push(label);
    }
  }

  // Projected Plan Entry Date
  if (updates.projectedPlanEntryDate != null) {
    await setProjectedEntryIfNeeded(page, updates);
    if (!applied.includes("Projected Plan Entry Date"))
      applied.push("Projected Plan Entry Date");
  }

  return applied;
}

/** Confirma guardado: js-dialog o modal OK; fallback: inline alert. */
async function confirmSaveAlert(page, preArmedDialogPromise = null) {
  const isThenable = (p) =>
    p && typeof p.then === "function" && typeof p.catch === "function";

  const dialogP = isThenable(preArmedDialogPromise)
    ? preArmedDialogPromise
    : page
        .waitForEvent("dialog", { timeout: 8000 })
        .then(async (dlg) => {
          const msg = dlg.message();
          try {
            await dlg.accept();
          } catch {}
          return { mode: "js-dialog", text: msg || "Dialog accepted" };
        })
        .catch(() => null);

  const modalP = (async () => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const modal = page
        .locator(".modal.show, .modal.in")
        .filter({ hasNot: page.locator(SEL.noteModal) })
        .first();
      if ((await modal.count()) > 0) {
        const okBtn = modal
          .locator(
            'button, input[type="button"], input[type="submit"], .btn, .bootbox-accept'
          )
          .filter({
            hasText:
              /^(ok|okay|accept|aceptar|entendido|close|cerrar|sí|si|yes|confirm|confirmar|guardar|save|update)$/i,
          })
          .first();
        try {
          if ((await okBtn.count()) > 0) {
            await okBtn.click({ timeout: 1200 });
          } else {
            await modal
              .locator(".btn-primary")
              .first()
              .click({ timeout: 1200 });
          }
        } catch {}
        try {
          await modal.waitFor({ state: "detached", timeout: 2500 });
        } catch {}
        const txt = await modal.innerText().catch(() => "");
        return {
          mode: "modal-ok",
          text: (txt && txt.trim()) || "Modal OK clicked",
        };
      }
      await page.waitForTimeout(100);
    }
    return null;
  })();

  const inlineP = (async () => {
    const root = page.locator(SEL.alertsRoot).first();
    try {
      await root.waitFor({ state: "attached", timeout: 5000 });
    } catch {}
    const alert = page.locator(SEL.alertsAny).first();
    await alert.waitFor({ state: "attached", timeout: 5000 });
    const txt = await alert.innerText().catch(() => "");
    const btn = alert
      .locator("button, .btn, .close")
      .filter({ hasText: /^(ok|close|cerrar)$/i })
      .first();
    if ((await btn.count()) > 0) {
      try {
        await btn.click({ timeout: 800 });
      } catch {}
    }
    return { mode: "inline-alert", text: (txt && txt.trim()) || "Alert" };
  })().catch(() => null);

  const winner = await Promise.race([
    dialogP.catch(() => null),
    modalP.catch(() => null),
    inlineP.catch(() => null),
  ]);
  return winner;
}

/** Abre modal, arma promesa de dialog, escribe nota y envía. */
async function openModalAndSave(page, note) {
  await page
    .locator(SEL.saveBtn)
    .first()
    .click({ timeout: 8000 })
    .catch(() => {});
  await page
    .locator(SEL.noteModal)
    .waitFor({ state: "visible", timeout: 10000 });

  const dialogPromise = page
    .waitForEvent("dialog", { timeout: 8000 })
    .then(async (dlg) => {
      const msg = dlg.message();
      try {
        await dlg.accept();
      } catch {}
      return { mode: "js-dialog", text: msg || "Dialog accepted" };
    })
    .catch(() => null);

  // Nota por DOM (más rápido que fill)
  await applyTextUpdatesBatch(page, { [SEL.noteTextarea]: note });
  await page.locator(SEL.noteSubmit).first().click({ timeout: 8000 });

  return dialogPromise; // thenable coordinado con confirmSaveAlert
}

module.exports = async function runFlow({ meta, jobCtx }) {
  if (!SITE_USER || !SITE_PASS || !TOTP_SECRET) {
    throw new Error("Faltan SITE_USER, SITE_PASS o TOTP_SECRET en env");
  }

  const { loginUrl, selectors, participantId, note, updates } = meta;
  const url = `https://employer.forusall.com/participants/${encodeURIComponent(
    participantId
  )}`;

  let page = null;
  try {
    page = await getPageFromPool({ siteUserEmail: SITE_USER });
    page.setDefaultTimeout(PW_DEFAULT_TIMEOUT);
    page.setDefaultNavigationTimeout(PW_DEFAULT_TIMEOUT + 1500);

    // Ir directo al perfil
    jobCtx?.setStage?.("goto-participant", { participantId });
    await gotoFast(page, url, Math.max(20000, PW_DEFAULT_TIMEOUT + 3000));

    // Estado / login mínimo viable
    let urlNow = page.url() || "";
    let needLogin = /\/sign_in\b/i.test(urlNow);

    if (needLogin) {
      await doLoginWithOtp(page, selectors, loginUrl, jobCtx);
      await saveContextStorageState(page.context(), SITE_USER);
      await gotoFast(page, url, Math.max(20000, PW_DEFAULT_TIMEOUT + 3000));
    } else {
      await waitForShellFast(page, { timeoutMs: SHELL_WAIT_MS });
    }

    // Form listo
    jobCtx?.setStage?.("fill");
    await page
      .locator(SEL.form)
      .first()
      .waitFor({ state: "attached", timeout: 10000 });
    const applied = await applyUpdates(page, updates);

    // Guardar con nota
    jobCtx?.setStage?.("save");
    const saveTask = openModalAndSave(page, note); // promesa del dialog (no await)

    // Confirmación
    jobCtx?.setStage?.("await_alert");
    const confirm = await confirmSaveAlert(page, saveTask);
    if (!confirm) {
      throw new Error("No se detectó alerta de confirmación tras guardar.");
    }
    try {
      await saveTask;
    } catch {}

    // ✅ Validación estricta del texto del alert
    const confirmText = String(confirm?.text ?? "").trim();
    if (confirmText !== SUCCESS_ALERT_TEXT) {
      const err = new Error(confirmText || "La confirmación no indicó éxito.");
      err.code = "UPDATE_NOT_CONFIRMED";
      err.detail = {
        confirmMode: confirm?.mode || null,
        confirmText,
        participantId,
        participantUrl: url,
        updatesApplied: applied,
      };
      throw err;
    }

    jobCtx?.setStage?.("done");
    return {
      ok: true,
      code: "UPDATE_OK",
      message: confirmText, // "Participant updated successfully."
      data: {
        participantId,
        participantUrl: url,
        updatesApplied: applied,
        confirmMode: confirm.mode,
        confirmText, // guardamos el texto exacto que validamos
      },
      warnings: [],
      errors: [],
    };
  } finally {
    if (page) await releasePage(page);
  }
};

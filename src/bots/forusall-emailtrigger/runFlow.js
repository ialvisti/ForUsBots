// src/bots/forusall-emailtrigger/runFlow.js
const { getPageFromPool, releasePage } = require("../../engine/sharedContext");
const { ensureAuthForTarget } = require("../../engine/auth/loginOtp");
const { FIXED } = require("../../providers/forusall/config");
const {
  waitOptionsCount,
  getSelectOptions,
  selectIfPresent,
} = require("./flows/_common");
const { getFlowHandler } = require("./flows");
const { assertFlowSucceeded, normalizeFlowError } = require("./result");
const { acquireEmailTriggerAccount } = require("./accountLock");

const PW_DEFAULT_TIMEOUT = Math.max(
  2000,
  parseInt(process.env.PW_DEFAULT_TIMEOUT || "6000", 10)
);

module.exports = async function runFlow({ meta, jobCtx }) {
  const account = jobCtx && jobCtx.account;
  if (!account || !account.siteUser || !account.sitePass || !account.totpSecret) {
    throw normalizeFlowError(
      new Error("runFlow: jobCtx.account ausente o incompleto")
    );
  }

  const {
    loginUrl,
    selectors,
    triggerEmails,
    planId,
    emailType,
    participants = "all",
  } = meta || {};

  const url = (triggerEmails && triggerEmails.url) || FIXED.triggerEmails.url;
  const s =
    (triggerEmails && triggerEmails.selectors) ||
    selectors ||
    FIXED.triggerEmails.selectors;

  let page = null;
  let releaseAccount = null;
  try {
    // Rails flash/cookies live at session scope. Serializing this bot per account
    // prevents two email triggers in the shared browser context from consuming
    // or certifying each other's redirect response.
    releaseAccount = await acquireEmailTriggerAccount(account.siteUser);
    page = await getPageFromPool({ siteUserEmail: account.siteUser });
    page.setDefaultTimeout(PW_DEFAULT_TIMEOUT);
    page.setDefaultNavigationTimeout(PW_DEFAULT_TIMEOUT + 2000);

    jobCtx?.setStage?.("auth-trigger-emails");
    await ensureAuthForTarget(page, {
      loginUrl: loginUrl || FIXED.loginUrl,
      targetUrl: url,
      selectors,
      shellSelectors: [s.form, s.planSelect, s.emailTypeSelect].filter(Boolean),
      jobCtx,
      account,
      saveSession: true,
    });

    // Validar que planId existe antes de seleccionar
    jobCtx?.setStage?.("validate-plan", { planId });
    const planSel = s.planSelect || "#plan_id";
    await page.waitForSelector(planSel, { state: "visible", timeout: 8000 });
    await waitOptionsCount(page, planSel, { timeout: 12000 });
    const planOptions = await getSelectOptions(page, planSel);
    const hasPlan = planOptions.some((o) => o.value === String(planId));
    if (!hasPlan) {
      return assertFlowSucceeded({
        result: "Failed",
        reason: `PlanId '${planId}' not available in the plan selector`,
        details: {
          selector: planSel,
          count: planOptions.length,
          planAvailable: false,
        },
      });
    }

    // Seleccionar plan y participants=All
    jobCtx?.setStage?.("select-plan", { planId });
    await selectIfPresent(page, planSel, planId, { required: true });
    await page.waitForLoadState("networkidle").catch(() => {});

    const partSel = s.participantSelect || "#participant_id";
    if (participants === "all") {
      jobCtx?.setStage?.("select-participants-all");
      await selectIfPresent(page, partSel, "0", { required: true });
    }

    // emailType
    jobCtx?.setStage?.("select-email-type", { emailType });
    const emailSel = s.emailTypeSelect || "#email_type";
    await selectIfPresent(page, emailSel, emailType, { required: true });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(200);

    // Router -> flow específico
    const handler = getFlowHandler(emailType);
    if (!handler) {
      return assertFlowSucceeded({
        result: "Failed",
        reason: `Handler not implemented yet for emailType='${emailType}'`,
      });
    }

    // Ejecutar flow
    const result = await handler({ page, selectors: s, meta, jobCtx });
    return assertFlowSucceeded(result);
  } catch (err) {
    throw normalizeFlowError(err);
  } finally {
    try {
      if (page) await releasePage(page);
    } finally {
      releaseAccount?.();
    }
  }
};

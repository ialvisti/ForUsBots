// src/bots/forusall-emailtrigger/runFlow.js
const { getPageFromPool, releasePage } = require("../../engine/sharedContext");
const { SITE_USER, SITE_PASS, TOTP_SECRET } = require("../../config");
const { ensureAuthForTarget } = require("../../engine/auth/loginOtp");
const { FIXED } = require("../../providers/forusall/config");
const {
  waitOptionsCount,
  getSelectOptions,
  selectIfPresent,
} = require("./flows/_common");
const { getFlowHandler } = require("./flows");

const PW_DEFAULT_TIMEOUT = Math.max(
  2000,
  parseInt(process.env.PW_DEFAULT_TIMEOUT || "6000", 10)
);

module.exports = async function runFlow({ meta, jobCtx }) {
  if (!SITE_USER || !SITE_PASS || !TOTP_SECRET) {
    return {
      result: "Failed",
      reason: "Missing env: SITE_USER/SITE_PASS/TOTP_SECRET",
    };
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
  try {
    page = await getPageFromPool({ siteUserEmail: SITE_USER });
    page.setDefaultTimeout(PW_DEFAULT_TIMEOUT);
    page.setDefaultNavigationTimeout(PW_DEFAULT_TIMEOUT + 2000);

    jobCtx?.setStage?.("auth-trigger-emails");
    await ensureAuthForTarget(page, {
      loginUrl: loginUrl || FIXED.loginUrl,
      targetUrl: url,
      selectors,
      shellSelectors: [s.form, s.planSelect, s.emailTypeSelect].filter(Boolean),
      jobCtx,
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
      return {
        result: "Failed",
        reason: `PlanId '${planId}' not available in the plan selector`,
        details: {
          selector: planSel,
          availablePlanValues: planOptions.map((o) => o.value),
          availablePlanLabels: planOptions.map((o) => o.text),
          count: planOptions.length,
        },
      };
    }

    // Seleccionar plan y participants=All
    jobCtx?.setStage?.("select-plan", { planId });
    await selectIfPresent(page, planSel, planId, { required: true });
    await page.waitForLoadState("networkidle").catch(() => {});

    const partSel = s.participantSelect || "#participant_id";
    await page.waitForSelector(partSel, { timeout: 6000 }).catch(() => {});
    if (participants === "all") {
      await page.selectOption(partSel, "0").catch(() => {});
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
      return {
        result: "Failed",
        reason: `Handler not implemented yet for emailType='${emailType}'`,
      };
    }

    // Ejecutar flow
    return await handler({ page, selectors: s, meta, jobCtx });
  } catch (err) {
    return { result: "Failed", reason: err?.message || String(err) };
  } finally {
    if (page) await releasePage(page);
  }
};

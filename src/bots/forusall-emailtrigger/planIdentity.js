"use strict";

const extractBasicInfo = require("../../extractors/forusall-plan/modules/basic_info");

const PLAN_IDENTITY_TIMEOUT_MS = Math.max(
  5000,
  Number.parseInt(process.env.SAR_PLAN_IDENTITY_TIMEOUT_MS || "20000", 10)
);

function identityFailure() {
  const error = new Error("Could not establish the selected plan identity");
  error.code = "SAR_PLAN_IDENTITY_FAILED";
  return error;
}

function normalizePortalName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isStrongSymlink(value) {
  const characters =
    normalizePortalName(value).normalize("NFKC").match(/[\p{L}\p{N}]/gu) || [];
  const normalizedCharacters = characters.map((character) =>
    character.toLocaleLowerCase("en-US")
  );
  return (
    normalizedCharacters.length >= 4 &&
    normalizedCharacters.some((character) => /\p{L}/u.test(character)) &&
    new Set(normalizedCharacters).size >= 3
  );
}

function normalizePlanIdentity(data, expectedPlanId) {
  const extractedPlanId = Number(data?.plan_id);
  if (
    !String(data?.plan_id || "").trim() ||
    !Number.isSafeInteger(extractedPlanId) ||
    extractedPlanId !== Number(expectedPlanId)
  ) {
    throw identityFailure();
  }

  const officialName = normalizePortalName(data?.official_plan_name);
  const shortName = normalizePortalName(data?.symlink);
  const planName = officialName || (isStrongSymlink(shortName) ? shortName : "");
  const ein = String(data?.ein || "").replace(/\D/g, "");
  if (!planName || !/^\d{9}$/.test(ein)) {
    throw identityFailure();
  }
  return { planNames: [planName], ein };
}

async function extractPlanIdentity(
  page,
  planId,
  { extractor = extractBasicInfo, timeoutMs = PLAN_IDENTITY_TIMEOUT_MS } = {}
) {
  const context = page?.context?.();
  if (!context || typeof context.newPage !== "function") {
    throw identityFailure();
  }
  const identityPage = await context.newPage();
  try {
    const targetUrl = `https://employer.forusall.com/plans/${encodeURIComponent(
      planId
    )}/edit`;
    await identityPage.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    const finalUrl = new URL(identityPage.url());
    if (
      finalUrl.origin !== "https://employer.forusall.com" ||
      finalUrl.pathname !== `/plans/${encodeURIComponent(planId)}/edit`
    ) {
      throw identityFailure();
    }
    await identityPage.waitForSelector("#bitemporal-plan-attrs", {
      state: "attached",
      timeout: timeoutMs,
    });
    const extracted = await extractor(identityPage, {
      fields: [
        "plan_id",
        "official_plan_name",
        "symlink",
        "ein",
      ],
    });
    return normalizePlanIdentity(extracted?.data, planId);
  } catch {
    throw identityFailure();
  } finally {
    await identityPage.close({ runBeforeUnload: false }).catch(() => {});
  }
}

module.exports = { extractPlanIdentity, normalizePlanIdentity };

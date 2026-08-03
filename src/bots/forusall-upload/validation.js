"use strict";

/**
 * Portal plan IDs are positive decimal integers. Returning a normalized number
 * prevents values such as 0, negatives, decimals, and partial numeric strings
 * from being interpolated into the portal URL.
 */
function parsePositivePlanId(value) {
  if (value === undefined || value === null) return null;

  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;

  const planId = Number(text);
  return Number.isSafeInteger(planId) && planId > 0 ? planId : null;
}

module.exports = { parsePositivePlanId };

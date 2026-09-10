'use strict';

// Shared read-only extraction boundary. Never publish raw exceptions or treat
// a panel/readiness failure as an empty data collection.
module.exports = async function runModule(page, {
  key, spec, extractor, requestedFields = null, openModule = null,
  timeoutMs = 2500, allowSnapshotOnly = false,
}) {
  const diagnostics = {
    dataState: 'ok', observedAt: new Date().toISOString(), sourceModule: key,
    completeness: { complete: true, truncated: false, observedCount: 0, returnedCount: 0 },
  };
  const result = { key, status: 'ok', source: 'panel', requestedFields, diagnostics };
  function fail(state, reason) {
    diagnostics.dataState = state;
    diagnostics.completeness = { ...diagnostics.completeness, complete: false, reason };
    result.status = 'error';
    result.error = reason;
    return result;
  }
  const isLogin = () => /\/(?:sign_in|forbidden|403)\b/i.test(String(page.url()));
  if (isLogin()) return fail('access_denied', 'authentication_or_access_required');
  const wait = async selector => {
    if (selector) await page.waitForSelector(selector, { state: 'attached', timeout: timeoutMs });
  };
  try {
    await wait(spec.panelSelector);
  } catch {
    if (openModule) {
      try {
        if (await openModule(page, spec)) {
          result.source = 'nav';
          await wait(spec.panelSelector);
        } else return fail(isLogin() ? 'access_denied' : 'panel_missing', 'panel_not_found');
      } catch { return fail(isLogin() ? 'access_denied' : 'panel_missing', 'panel_not_found'); }
    } else return fail(isLogin() ? 'access_denied' : 'panel_missing', 'panel_not_found');
  }
  try {
    await wait(spec.ready?.selector);
    if (spec.ready?.textRegex) {
      await page.getByText(spec.ready.textRegex, { exact: false }).first().waitFor({ timeout: timeoutMs });
    }
  } catch { return fail(isLogin() ? 'access_denied' : 'unavailable', 'panel_not_ready'); }
  if (!extractor) {
    fail('unavailable', 'extractor_unavailable');
    // HTML/text snapshots historically support modules without typed readers.
    // Keep that capability while explicitly declaring structured data unavailable.
    if (allowSnapshotOnly) result.status = 'partial';
    return result;
  }
  let extracted;
  try {
    extracted = await extractor(page, { scope: spec.panelSelector || null, fields: requestedFields });
  } catch { return fail(isLogin() ? 'access_denied' : 'parse_error', 'extractor_failed'); }
  if (!extracted?.data || typeof extracted.data !== 'object' || Array.isArray(extracted.data)) {
    return fail('parse_error', 'invalid_extractor_result');
  }
  result.data = extracted.data;
  result.extractorWarnings = extracted.warnings || [];
  result.unknownFields = extracted.unknownFields?.length ? extracted.unknownFields : undefined;
  const keys = Object.keys(result.data);
  Object.assign(diagnostics, extracted.diagnostics || {});
  diagnostics.completeness = {
    complete: !result.unknownFields?.length, truncated: false,
    observedCount: keys.length, returnedCount: keys.length,
    ...(extracted.diagnostics?.completeness || {}),
  };
  diagnostics.observedAt = new Date().toISOString();
  diagnostics.sourceModule = key;
  if (!keys.length && !extracted.diagnostics) return fail('missing', 'no_fields_extracted');
  if (result.unknownFields?.length) {
    diagnostics.fields = { ...(diagnostics.fields || {}) };
    for (const field of result.unknownFields) diagnostics.fields[field] = { dataState: 'missing' };
    diagnostics.completeness.complete = false;
  }
  if (!['ok', 'empty'].includes(diagnostics.dataState) || !diagnostics.completeness.complete) {
    result.status = 'partial';
  }
  return result;
};

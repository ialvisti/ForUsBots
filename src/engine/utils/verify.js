// src/engine/utils/verify.js
async function verifyFormDefaults(page, { fsel, fileInputSel, containerSel }, delayMs) {
  const mismatches = [];
  const delay = Number(delayMs || 5000);

  async function withNavRetries(fn, { retries = 3, pause = 300 } = {}) {
    let lastErr;
    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (e) {
        const msg = String(e && e.message || e);
        if (/Execution context was destroyed|Target closed|Navigating|Protocol error|Frame was detached/i.test(msg)) {
          lastErr = e;
          try { await page.waitForLoadState('domcontentloaded', { timeout: 5000 }); } catch {}
          try { await page.waitForLoadState('networkidle', { timeout: 3000 }); } catch {}
          await page.waitForTimeout(pause);
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  }

  await page.waitForTimeout(delay);

  const containerVisible = await withNavRetries(
    () => page.waitForSelector(containerSel, { state: 'visible', timeout: 15000 })
  ).then(() => true).catch(() => false);

  if (!containerVisible) {
    mismatches.push(`El contenedor ${containerSel} no está visible`);
    return { ok: false, mismatches };
  }

  const expected = {
    section: 'COVER LETTERS',
    caption: 'Basic Plan Document',
    status:  'Document Missing',
    dateEmpty: true,
    fileEmpty: true,
  };

  function tidy(s) { return String(s || '').trim(); }

  async function selectedText(sel) {
    return await withNavRetries(async () => {
      return page.$eval(sel, el => {
        const i = el.selectedIndex;
        const t = i >= 0 && el.options[i] ? el.options[i].textContent : '';
        return (t || '').trim();
      });
    });
  }

  const sec = await selectedText(fsel.section).catch(() => null);
  const cap = await selectedText(fsel.caption).catch(() => null);
  const sta = await selectedText(fsel.status).catch(() => null);

  const dateVal = await withNavRetries(async () => {
    return page.$eval(fsel.effectiveDate, el => el.value || '');
  }).catch(() => null);

  const fileEmpty = await withNavRetries(async () => {
    return page.$eval(fileInputSel, el => (el.files ? el.files.length : 0) === 0);
  }).catch(() => null);

  if (tidy(sec) !== expected.section) mismatches.push(`Section="${sec}" (esperado "${expected.section}")`);
  if (tidy(cap) !== expected.caption) mismatches.push(`Caption="${cap}" (esperado "${expected.caption}")`);
  if (tidy(sta) !== expected.status) mismatches.push(`Status="${sta}" (esperado "${expected.status}")`);
  if (expected.dateEmpty && (dateVal || '').trim() !== '') mismatches.push(`EffectiveDate no vacío ("${dateVal}")`);
  if (expected.fileEmpty && fileEmpty !== true) mismatches.push('File input no está vacío');

  return { ok: mismatches.length === 0, mismatches };
}

module.exports = { verifyFormDefaults };

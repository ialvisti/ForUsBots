// src/engine/utils/select.js
// Helpers robustos para selects dependientes / textos con Unicode raro

async function waitForOptionFlex(page, sel, desired, timeout = 20000, interval = 200) {
  await page.waitForSelector(sel, { timeout: Math.min(timeout, 10000) });
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const idx = await page.$eval(
      sel,
      (el, desired) => {
        const canon = (s) =>
          String(s ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[\u00A0\u2007\u202F]/g, ' ')
            .replace(/[’`]/g, "'")
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        const want = canon(desired);
        let best = -1, bestScore = -1;
        for (let i = 0; i < el.options.length; i++) {
          const t = canon(el.options[i].textContent || '');
          const v = canon(el.options[i].value || '');
          if (t === want || v === want) return i; // exacto
          const contains = t.includes(want) || v.includes(want) || want.includes(t) || want.includes(v);
          if (contains) {
            const score = Math.max(
              t.length ? want.length / t.length : 0,
              v.length ? want.length / v.length : 0
            );
            if (score > bestScore) { bestScore = score; best = i; }
          }
        }
        return best; // -1 si nada
      },
      desired
    ).catch(() => -1);

    if (idx >= 0) return idx;
    await page.waitForTimeout(interval);
  }
  return -1;
}

async function selectByText(page, labelOrSelector, valueText) {
  if (!valueText) throw new Error('Valor vacío en select');

  // CSS directo
  if (labelOrSelector && /^(#|\.|select)/.test(labelOrSelector)) {
    const sel = labelOrSelector;

    const idx = await waitForOptionFlex(page, sel, valueText, 20000);
    if (idx < 0) {
      const opts = await page.$eval(sel, el =>
        Array.from(el.options).map(o => (o.textContent || '').trim())
      ).catch(() => []);
      throw new Error(`No encontré la opción "${valueText}" en ${sel}. Opciones: ${opts.map(o => `"${o}"`).join(' | ') || '[vacío]'}`);
    }

    const ok = await page.evaluate(({ sel, idx }) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.selectedIndex = idx;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, { sel, idx });
    if (!ok) throw new Error(`No pude seleccionar "${valueText}" en ${sel}`);
    return;
  }

  // Label visible → <select> siguiente
  const byLabel = page.locator(`label:has-text("${labelOrSelector || ''}")`).locator('xpath=following::select[1]');
  await byLabel.waitFor({ timeout: 8000 });
  const sel = await byLabel.evaluate(el => (el && el.id ? `#${el.id}` : null)).catch(() => null);
  if (sel) {
    await selectByText(page, sel, valueText);
    return;
  }
  try {
    await byLabel.selectOption([{ label: valueText }, { value: valueText }]);
  } catch {
    throw new Error(`No pude seleccionar "${valueText}" vía label "${labelOrSelector}"`);
  }
}

module.exports = {
  waitForOptionFlex,
  selectByText,
};

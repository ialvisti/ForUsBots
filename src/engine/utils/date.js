// src/engine/utils/date.js
async function setEffectiveDate(page, inputSel, isoDate) {
  await page.waitForSelector(inputSel, { timeout: 10000 });

  await page.evaluate(({ sel, val }) => {
    const el = document.querySelector(sel);
    if (!el) return;
    if (el._flatpickr) { try { el._flatpickr.setDate(val, true, 'Y-m-d'); return; } catch {} }
    const w = window, $ = w.jQuery || w.$;
    if ($) {
      const $el = $(el);
      if ($el.data && $el.data('datepicker')) {
        try {
          const [y, m, d] = val.split('-').map(Number);
          $el.datepicker('setDate', new Date(y, m - 1, d));
          $el.datepicker('update');
          $el.trigger('change').trigger('changeDate');
          return;
        } catch {}
      }
      if (w.jQuery && w.jQuery.ui && w.jQuery.ui.datepicker) {
        try { $el.datepicker('setDate', val); $el.trigger('change'); return; } catch {}
      }
    }
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur && el.blur();
  }, { sel: inputSel, val: isoDate });

  const afterApi = await page.inputValue(inputSel).catch(() => null);
  if (afterApi !== isoDate) {
    const [, , dd] = isoDate.split('-').map(Number);
    await page.click(inputSel);
    const dayLoc = page
      .locator('.datepicker td.day:not(.old):not(.new), .ui-datepicker-calendar td a, .flatpickr-day')
      .filter({ hasText: String(dd) })
      .first();
    try { await dayLoc.waitFor({ timeout: 2000 }); await dayLoc.click(); } catch {}
    const v = await page.inputValue(inputSel).catch(() => null);
    if (v !== isoDate) {
      await page.evaluate(({ sel, val }) => {
        const el = document.querySelector(sel);
        if (!el) return;
        el.removeAttribute('readonly');
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur && el.blur();
      }, { sel: inputSel, val: isoDate });
    }
  }
}

module.exports = { setEffectiveDate };

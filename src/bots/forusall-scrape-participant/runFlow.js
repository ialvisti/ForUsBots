// src/bots/forusall-scrape-participant/runFlow.js
// Reusa SOLO login + OTP; NO usa nada del flujo de upload.

const speakeasy = require('speakeasy');
const { launchBrowser, createContext, safeClose } = require('../../engine/browser');
const { SITE_USER, SITE_PASS, TOTP_SECRET, TOTP_STEP_SECONDS } = require('../../config');
const { saveEvidence } = require('../../engine/evidence');
const { getSpec } = require('../../providers/forusall/participantMap');
const { getExtractor } = require('../../extractors/forusall-participant/registry');

const {
  acquireLogin,
  waitNewTotpWindowIfNeeded,
  markTotpUsed,
} = require('../../engine/loginLock');

/** Normaliza returnMode (por compat; el controller por defecto usa 'data') */
function normReturnMode(v) {
  const s = String(v || 'html').trim().toLowerCase();
  return ['html', 'text', 'both', 'data'].includes(s) ? s : 'html';
}

/** Navega a un módulo por label accesible, con scroll y sinónimos (fallback) */
async function openModule(page, spec, { timeoutMs = 30000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const nav = page.getByRole('navigation').first().or(page.locator('aside, nav').first());

  async function tryClickByLabel(label) {
    try { await page.getByRole('link', { name: new RegExp(label, 'i') }).first().click({ timeout: 700 }); return true; } catch {}
    try { await page.getByRole('button', { name: new RegExp(label, 'i') }).first().click({ timeout: 700 }); return true; } catch {}
    return false;
  }

  async function scrollNav() {
    try {
      const hasNav = await nav.count();
      if (!hasNav) return;
      for (let i = 0; i < 5; i++) {
        await nav.evaluate(el => { el.scrollBy({ top: 220, behavior: 'instant' }); });
        await page.waitForTimeout(100);
      }
    } catch {}
  }

  const labels = [spec.navLabel, ...(spec.synonyms || [])].filter(Boolean);

  while (Date.now() < deadline) {
    if (spec.navSelector) { try { await page.click(spec.navSelector, { timeout: 700 }); return true; } catch {} }
    for (const lbl of labels) { if (await tryClickByLabel(lbl)) return true; }
    await scrollNav();
    await page.waitForTimeout(160);
  }
  return false;
}

/** Snapshot de un panel: devuelve html/text según returnMode (ahora permite oculto) */
async function getPanelSnapshot(page, panelSelector, returnMode) {
  // Espera sólo a que exista en el DOM (puede estar oculto)
  await page.waitForSelector(panelSelector, { timeout: 8000, state: 'attached' });

  const html = (returnMode === 'text' || returnMode === 'data') ? undefined :
    await page.evaluate(sel => {
      const el = document.querySelector(sel);
      return el ? el.outerHTML : null;
    }, panelSelector);

  const text = (returnMode === 'html' || returnMode === 'data') ? undefined :
    await page.evaluate(sel => {
      const el = document.querySelector(sel);
      return (el && (el.innerText || '').trim()) || '';
    }, panelSelector);

  return { html, text };
}

/**
 * @param {{
 *   meta: {
 *     loginUrl: string,
 *     selectors: { user:string, pass:string, loginButton:string, otpInput:string, otpSubmit:string },
 *     participantId: string,
 *     modules: Array<string|{key:string,fields?:string[]}>,
 *     invalidModules: string[],
 *     includeScreens: boolean,
 *     timeoutMs: number,
 *     returnMode: 'html'|'text'|'both'|'data',
 *     strict: boolean,
 *     createdBy: { name:string|null, role:'user'|'admin', at:string }
 *   },
 *   jobCtx?: { jobId:string, setStage(name:string, meta?:any): void }
 * }} args
 */
module.exports = async function runFlow({ meta, jobCtx }) {
  if (!SITE_USER || !SITE_PASS || !TOTP_SECRET) {
    throw new Error('Faltan SITE_USER, SITE_PASS o TOTP_SECRET en variables de entorno');
  }

  const {
    loginUrl, selectors, participantId, modules,
    invalidModules = [], includeScreens, timeoutMs = 30000,
    returnMode: rmIn = 'html', strict = false,
  } = meta;

  const returnMode = normReturnMode(rmIn);

  const out = {
    ok: true,
    url: `https://employer.forusall.com/participants/${encodeURIComponent(participantId)}`,
    participantId,
    modulesRequested: modules,
    modules: [],
    full: null,
    errors: [],
    warnings: invalidModules.length ? [{ type: 'invalid_modules_ignored', keys: invalidModules }] : [],
  };

  let browser, context, page;
  try {
    // ---------- Browser ----------
    browser = await launchBrowser();
    context = await createContext(browser);
    page = await context.newPage();
    page.on('dialog', d => d.dismiss().catch(() => {}));

    // ---------- LOGIN ----------
    jobCtx?.setStage?.('login');
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
    await page.fill(selectors.user, SITE_USER);
    await page.fill(selectors.pass, SITE_PASS);
    await Promise.all([
      page.waitForLoadState('networkidle'),
      page.click(selectors.loginButton),
    ]);

    // ---------- OTP ----------
    jobCtx?.setStage?.('otp', { otpLock: 'waiting' });
    const release = await acquireLogin(SITE_USER);
    try {
      jobCtx?.setStage?.('otp', { otpLock: 'holder' });

      await waitNewTotpWindowIfNeeded(SITE_USER);

      await page.waitForSelector(selectors.otpInput, { timeout: 30000 });
      const step = Number(TOTP_STEP_SECONDS || 30);
      const candidates = [
        speakeasy.totp({ secret: TOTP_SECRET, encoding: 'base32', step, window: 0 }),
        speakeasy.totp({ secret: TOTP_SECRET, encoding: 'base32', step, window: 1 }),
      ];
      let otpOk = false;
      for (const code of candidates) {
        await page.fill(selectors.otpInput, code);
        await page.click(selectors.otpSubmit);
        try { await page.waitForLoadState('networkidle', { timeout: 5000 }); otpOk = true; break; } catch {}
      }
      if (!otpOk) throw new Error('No fue posible validar el OTP');
      markTotpUsed(SITE_USER);
    } finally {
      release();
    }

    if (includeScreens) { await saveEvidence(page, `scrape-login-${participantId}`); }

    // ---------- PARTICIPANT PAGE ----------
    jobCtx?.setStage?.('goto-participant', { participantId });
    await page.goto(out.url, { waitUntil: 'domcontentloaded', timeout: Math.max(20000, timeoutMs) });

    // Verificación de shell (#tab-panel o alguno de los paneles)
    let shellOk = false;
    try { await page.waitForSelector('#tab-panel', { timeout: 8000 }); shellOk = true; } catch {}
    if (!shellOk) {
      try { await page.waitForSelector('#census, #savings-rate, #plan, #loan, #payroll, #comms, #docs, #mfa', { timeout: 8000, state: 'attached' }); shellOk = true; } catch {}
    }
    if (!shellOk) {
      try { await page.waitForLoadState('networkidle', { timeout: 3000 }); } catch {}
      throw new Error('No se detectó #tab-panel ni los tabpanes del participante');
    }

    // ---------- EXTRACCIÓN ----------
    // (A) Sin módulos: compat (no lo usamos en la práctica)
    if (!modules || modules.length === 0) {
      jobCtx?.setStage?.('extract-full');
      try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch {}
      const html = await page.content();
      const text = await page.evaluate(() => (document?.body?.innerText || '').trim());
      let shot = null;
      if (includeScreens) {
        const e = await saveEvidence(page, `scrape-full-${participantId}`);
        shot = e.path || null;
      }
      out.full = {
        html: (returnMode === 'text' || returnMode === 'data') ? undefined : html,
        text: (returnMode === 'html' || returnMode === 'data') ? undefined : text,
        evidencePath: shot,
      };
      jobCtx?.setStage?.('done');
      return out;
    }

    // (B) Con módulos: leer DIRECTO del panel (los tabs ya están en el DOM)
    for (const m of modules) {
      const key = typeof m === 'string' ? m : (m && m.key);
      const requestedFields = (typeof m === 'object' && Array.isArray(m.fields)) ? m.fields : null;

      const spec = getSpec(key);
      if (!spec) {
        if (strict) throw new Error(`Módulo no soportado: ${key}`);
        out.errors.push({ key, error: 'unsupported_module' });
        continue;
      }

      jobCtx?.setStage?.(`module:${key}`, { action: 'locate-panel' });

      const panelSel = spec.panelSelector; // ej: '#savings-rate', '#census', etc.
      let source = 'panel';
      let panelOk = false;

      if (panelSel) {
        try { await page.waitForSelector(panelSel, { timeout: 4000, state: 'attached' }); panelOk = true; } catch {}
      }

      // Fallback a abrir por nav si fuera necesario
      if (!panelOk || spec.forceNav) {
        jobCtx?.setStage?.(`module:${key}`, { action: 'fallback-open' });
        const opened = await openModule(page, spec, { timeoutMs });
        if (opened) {
          source = 'nav';
          try { await page.waitForLoadState('networkidle', { timeout: 3000 }); } catch {}
          if (panelSel) {
            try { await page.waitForSelector(panelSel, { timeout: 3000, state: 'attached' }); panelOk = true; } catch {}
          } else {
            panelOk = true;
          }
        }
      }

      // Espera de “ready” (no requiere visibilidad)
      if (spec.ready?.selector) {
        try { await page.waitForSelector(spec.ready.selector, { timeout: 6000, state: 'attached' }); } catch {}
      } else if (spec.ready?.textRegex) {
        const loc = page.getByText(spec.ready.textRegex, { exact: false }).first();
        try { await loc.waitFor({ timeout: 4000 }); } catch {}
      }

      // Si seguimos sin panel y no hay extractor, registramos error
      if (!panelOk && !getExtractor(key)) {
        out.modules.push({
          key,
          status: 'error',
          source,
          error: 'panel_not_found',
        });
        continue;
      }

      // 1) Data estructurada (pasando scope y fields)
      jobCtx?.setStage?.(`module:${key}`, { action: 'extract-data' });
      let data;
      let extractorWarnings = [];
      let unknownFields = [];
      const extractor = getExtractor(key);
      if (extractor) {
        try {
          const r = await extractor(page, { scope: panelSel || null, fields: requestedFields || null });
          data = r && r.data || undefined;
          extractorWarnings = r && r.warnings || [];
          unknownFields = r && Array.isArray(r.unknownFields) ? r.unknownFields : [];
        } catch (e) {
          out.errors.push({ key, error: 'extractor_failed', message: String(e && e.message || e) });
        }
      }

      // 2) Snapshot — se omite por completo cuando returnMode === 'data'
      let html, text;
      if (returnMode !== 'data') {
        jobCtx?.setStage?.(`module:${key}`, { action: 'snapshot' });
        if (panelSel && panelOk) {
          const snap = await getPanelSnapshot(page, panelSel, returnMode);
          html = snap.html;
          text = snap.text;
        } else {
          html = (returnMode === 'text') ? undefined : await page.content();
          text = (returnMode === 'html') ? undefined : await page.evaluate(() => (document?.body?.innerText || '').trim());
        }
      }

      let shot = null;
      if (includeScreens) {
        const e = await saveEvidence(page, `scrape-${participantId}-${key}`);
        shot = e.path || null;
      }

      out.modules.push({
        key,
        status: 'ok',
        source,
        requestedFields: requestedFields || null,
        unknownFields: unknownFields.length ? unknownFields : undefined,
        data,
        extractorWarnings,
        html,
        text,
        evidencePath: shot,
      });
    }

    jobCtx?.setStage?.('done');
    return out;
  } finally {
    await safeClose(page, context, browser);
  }
};

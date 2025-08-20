// src/engine/browser.js
const { chromium } = require('playwright');

function envBool(val) {
  if (val == null) return false;
  const s = String(val).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

const SLOWMO = parseInt(process.env.SLOWMO || '0', 10);
const CLOSE_KILL_MS = parseInt(process.env.CLOSE_KILL_MS || '1500', 10);

function decideHeadless() {
  // 1) HEADLESS tiene prioridad (1/0, true/false)
  if (process.env.HEADLESS != null) return envBool(process.env.HEADLESS);

  // 2) Compatibilidad: si existe HEADFUL, lo invertimos
  if (process.env.HEADFUL != null) return !envBool(process.env.HEADFUL);

  // 3) Por defecto, ejecuta headless (seguro en servidores/CI)
  return true;
}

async function launchBrowser() {
  const headless = decideHeadless();
  return chromium.launch({
    headless,
    slowMo: SLOWMO,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
}

async function createContext(browser) {
  const context = await browser.newContext();
  return context;
}

async function safeClose(page, context, browser) {
  try { if (page) await page.close({ runBeforeUnload: false }); } catch {}
  try { if (context) await context.close(); } catch {}
  if (browser) {
    try { await browser.close(); } catch {
      try {
        const proc = browser.process && browser.process();
        if (proc && proc.pid) {
          setTimeout(() => {
            try { process.kill(proc.pid, 'SIGKILL'); } catch {}
          }, CLOSE_KILL_MS);
        }
      } catch {}
    }
  }
}

module.exports = { launchBrowser, createContext, safeClose };

// src/engine/browser.js
const { chromium } = require('playwright');

const HEADFUL = process.env.HEADFUL === '1';
const SLOWMO = parseInt(process.env.SLOWMO || '0', 10);
const CLOSE_KILL_MS = parseInt(process.env.CLOSE_KILL_MS || '1500', 10);

async function launchBrowser() {
  return chromium.launch({
    headless: !HEADFUL,
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
    try { await browser.close(); } catch (e) {
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

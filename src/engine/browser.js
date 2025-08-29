// src/engine/browser.js
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

function envBool(val) {
  if (val == null) return false;
  const s = String(val).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on" || s === "y";
}

const SLOWMO = parseInt(process.env.SLOWMO || "0", 10);
const CLOSE_KILL_MS = parseInt(process.env.CLOSE_KILL_MS || "1500", 10);

function decideHeadless() {
  // 1) HEADLESS tiene prioridad (1/0, true/false)
  if (process.env.HEADLESS != null) return envBool(process.env.HEADLESS);
  // 2) Compatibilidad: si existe HEADFUL, lo invertimos
  if (process.env.HEADFUL != null) return !envBool(process.env.HEADFUL);
  // 3) Por defecto, ejecuta headless (seguro en servidores/CI)
  return true;
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {}
}

/**
 * Lanza un browser efímero (legacy).
 */
async function launchBrowser() {
  const headless = decideHeadless();
  return chromium.launch({
    headless,
    slowMo: SLOWMO,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}

/**
 * Crea un contexto efímero sobre un browser ya lanzado (legacy).
 */
async function createContext(browser, { storageStatePath } = {}) {
  const opts = { serviceWorkers: "block" };
  if (storageStatePath) opts.storageState = storageStatePath;
  const context = await browser.newContext(opts);
  return context;
}

/**
 * NUEVO: Lanza y devuelve directamente un contexto.
 * - Si PERSISTENT_CONTEXT=1 -> usa launchPersistentContext con USER_DATA_DIR (cache+cookies).
 * - Si no, se comporta como antes (launch + newContext).
 *
 * Devuelve: { context, browser }  (browser=null si es persistente)
 */
async function launchContext({ storageStatePath } = {}) {
  const headless = decideHeadless();
  const args = ["--no-sandbox", "--disable-dev-shm-usage"];
  const persistent = envBool(process.env.PERSISTENT_CONTEXT || "0");

  if (persistent) {
    const userDataDir =
      process.env.USER_DATA_DIR ||
      path.join(__dirname, "..", "..", ".user-data");
    ensureDir(userDataDir);

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless,
      slowMo: SLOWMO,
      args,
      // Reducimos ruido de red
      serviceWorkers: "block",
    });
    // En modo persistente ignoramos storageStatePath (ya persiste cookie/cache)
    return { context, browser: null };
  }

  // Modo efímero (legacy)
  const browser = await chromium.launch({ headless, slowMo: SLOWMO, args });
  const ctxOpts = { serviceWorkers: "block" };
  if (storageStatePath) ctxOpts.storageState = storageStatePath;
  const context = await browser.newContext(ctxOpts);
  return { context, browser };
}

async function safeClose(page, context, browser) {
  try {
    if (page) await page.close({ runBeforeUnload: false });
  } catch {}
  try {
    if (context) await context.close();
  } catch {}
  if (browser) {
    try {
      await browser.close();
    } catch {
      try {
        const proc = browser.process && browser.process();
        if (proc && proc.pid) {
          setTimeout(() => {
            try {
              process.kill(proc.pid, "SIGKILL");
            } catch {}
          }, CLOSE_KILL_MS);
        }
      } catch {}
    }
  }
}

module.exports = {
  launchBrowser,
  createContext,
  launchContext, // ⬅️ nuevo
  safeClose,
};

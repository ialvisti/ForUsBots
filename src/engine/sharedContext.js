// src/engine/sharedContext.js
const { launchContext } = require("./browser");
const { loadStorageStatePath, saveContextStorageState } = require("./sessions");
const { SITE_USER } = require("../config");
const fs = require("fs/promises");

function envBool(v, def = false) {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return def;
}
function envInt(k, def) {
  const n = parseInt(process.env[k] || "", 10);
  return Number.isFinite(n) ? n : def;
}

// ---- Config desde ENV ----
const SHARED_CONTEXT = envBool(process.env.SHARED_CONTEXT, true);
const PAGE_POOL_SIZE = Math.max(1, envInt("PAGE_POOL_SIZE", 2));
const MAX_IDLE_PAGES = Math.max(0, envInt("MAX_IDLE_PAGES", 1));
const KEEPALIVE_MS = Math.max(0, envInt("KEEPALIVE_MS", 20000)); // 0 = cierre inmediato

// Bloqueo rápido de assets pesados
const SCRAPE_BLOCK_ASSETS = envBool(process.env.SCRAPE_BLOCK_ASSETS, false);
const BLOCK_IMAGES = envBool(process.env.BLOCK_IMAGES, SCRAPE_BLOCK_ASSETS);
const BLOCK_FONTS = envBool(process.env.BLOCK_FONTS, SCRAPE_BLOCK_ASSETS);
const BLOCK_MEDIA = envBool(process.env.BLOCK_MEDIA, SCRAPE_BLOCK_ASSETS);
const BLOCK_STYLESHEETS = envBool(process.env.BLOCK_STYLESHEETS, false);

// Bloqueo de “terceros” (analytics/ads/etc)
const BLOCK_THIRD_PARTY = envBool(process.env.BLOCK_THIRD_PARTY, false);
const DEFAULT_3P_DOMAINS = [
  "googletagmanager.com",
  "google-analytics.com",
  "analytics.google.com",
  "doubleclick.net",
  "facebook.net",
  "connect.facebook.net",
  "mixpanel.com",
  "segment.io",
  "sentry.io",
  "hotjar.com",
  "clarity.ms",
  "amplitude.com",
  "newrelic.com",
  "nr-data.net",
  "intercom.io",
  "intercomcdn.com",
  "optimizely.com",
  "fullstory.com",
  "datadoghq.com",
  "mouseflow.com",
  "stats.g.doubleclick.net",
];
const THIRD_PARTY_HOSTS = String(
  process.env.BLOCK_3P_LIST || DEFAULT_3P_DOMAINS.join(",")
)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// ---- Estado único ----
const poolState = {
  context: null,
  browserRef: null,
  creating: null,
  shuttingDown: false,

  busyPages: new Set(),
  idlePages: new Set(),
  waitQueue: [],
  shutdownTimer: null,
  createdAt: 0,
};

// ---- Helpers ----
function clearShutdownTimer() {
  if (poolState.shutdownTimer) {
    clearTimeout(poolState.shutdownTimer);
    poolState.shutdownTimer = null;
  }
}
function scheduleShutdownIfIdle() {
  clearShutdownTimer();
  if (poolState.busyPages.size > 0) return;

  if (KEEPALIVE_MS === 0) {
    void closeContextNow().catch(() => {});
  } else {
    poolState.shutdownTimer = setTimeout(() => {
      if (poolState.busyPages.size === 0) {
        void closeContextNow().catch(() => {});
      }
    }, KEEPALIVE_MS);
  }
}

// Hidratación manual cuando usamos contexto PERSISTENTE (addCookies + localStorage)
async function hydratePersistentContext(context, storageStatePath) {
  if (!storageStatePath) return;
  let raw;
  try {
    raw = await fs.readFile(storageStatePath, "utf8");
  } catch {
    return;
  }
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    return;
  }

  // 1) Cookies
  try {
    const cookies = Array.isArray(state.cookies) ? state.cookies : [];
    if (cookies.length) {
      await context.addCookies(
        cookies.map((c) => {
          // Playwright acepta expires opcional; si viene 0/negativo lo omitimos
          const { expires, ...rest } = c || {};
          return expires && expires > 0 ? { ...c } : { ...rest };
        })
      );
    }
  } catch {}

  // 2) localStorage por origen
  try {
    const origins = Array.isArray(state.origins) ? state.origins : [];
    for (const o of origins) {
      const origin = o && o.origin;
      const ls = (o && o.localStorage) || [];
      if (!origin || !ls.length) continue;
      const page = await context.newPage();
      try {
        await page
          .goto(origin, { waitUntil: "domcontentloaded", timeout: 15000 })
          .catch(() => {});
        await page.addInitScript((entries) => {
          try {
            for (const kv of entries) {
              if (kv && typeof kv.name === "string") {
                localStorage.setItem(kv.name, kv.value ?? "");
              }
            }
          } catch {}
        }, ls);
        // Asegura que se apliquen en la sesión
        await page
          .evaluate((entries) => {
            for (const kv of entries) {
              if (kv && typeof kv.name === "string") {
                localStorage.setItem(kv.name, kv.value ?? "");
              }
            }
          }, ls)
          .catch(() => {});
      } finally {
        try {
          await page.close();
        } catch {}
      }
    }
  } catch {}
}

function isBlockedThirdParty(urlStr) {
  if (!BLOCK_THIRD_PARTY) return false;
  try {
    const u = new URL(urlStr);
    const host = (u.hostname || "").toLowerCase().replace(/^www\./, "");
    for (const dom of THIRD_PARTY_HOSTS) {
      // match exact host or subdomain
      if (host === dom || host.endsWith("." + dom)) return true;
    }
  } catch {}
  return false;
}

async function ensureContext() {
  if (poolState.context && !poolState.shuttingDown) {
    clearShutdownTimer();
    return poolState.context;
  }
  if (poolState.creating) return poolState.creating;

  poolState.creating = (async () => {
    clearShutdownTimer();
    if (poolState.context) {
      try {
        // Persistimos storageState ANTES de cerrar
        await saveContextStorageState(poolState.context, SITE_USER);
      } catch {}
      try {
        await poolState.context.close();
      } catch {}
      poolState.context = null;
    }
    poolState.browserRef = null;
    poolState.busyPages.clear();
    for (const p of poolState.idlePages) {
      try {
        await p.close();
      } catch {}
    }
    poolState.idlePages.clear();

    // ⬇️ cargar storageState si existe
    const storageStatePath = await loadStorageStatePath(SITE_USER);
    const { context, browser } = await launchContext({ storageStatePath });

    // Si es PERSISTENT (browser == null), inyectamos manualmente storageState
    if (!browser && storageStatePath) {
      await hydratePersistentContext(context, storageStatePath);
    }

    poolState.context = context;
    poolState.browserRef = browser || null;
    poolState.createdAt = Date.now();
    poolState.shuttingDown = false;

    // Bloqueo de assets + terceros
    if (
      BLOCK_IMAGES ||
      BLOCK_FONTS ||
      BLOCK_MEDIA ||
      BLOCK_STYLESHEETS ||
      BLOCK_THIRD_PARTY
    ) {
      const blockTypes = new Set();
      if (BLOCK_IMAGES) blockTypes.add("image");
      if (BLOCK_FONTS) blockTypes.add("font");
      if (BLOCK_MEDIA) blockTypes.add("media");
      if (BLOCK_STYLESHEETS) blockTypes.add("stylesheet");

      await context.route("**/*", (route) => {
        try {
          const req = route.request();
          const type = req.resourceType();
          const url = req.url();

          // 1) Recursos por tipo (CSS / imágenes / etc.)
          if (blockTypes.has(type)) return route.abort();

          // 2) Bloqueo por dominios de terceros “ruidosos”
          if (isBlockedThirdParty(url)) return route.abort();
        } catch (_) {}
        return route.continue();
      });
    }

    // Cierre por señales
    const hookOnce = (ev) => {
      const handler = async () => {
        await closeContextNow().catch(() => {});
        process.exit(0);
      };
      process.once(ev, handler);
    };
    if (!process.__sharedCtxHooksInstalled) {
      hookOnce("SIGINT");
      hookOnce("SIGTERM");
      process.on("exit", async () => {
        try {
          if (poolState.context) {
            try {
              await saveContextStorageState(poolState.context, SITE_USER);
            } catch {}
            await poolState.context.close();
          }
        } catch {}
      });
      process.__sharedCtxHooksInstalled = true;
    }

    return context;
  })();

  const ctx = await poolState.creating;
  poolState.creating = null;
  return ctx;
}

async function closeContextNow() {
  if (!poolState.context || poolState.shuttingDown) return;
  poolState.shuttingDown = true;
  clearShutdownTimer();

  // ⬇️ persistir storageState ANTES de cerrar
  try {
    await saveContextStorageState(poolState.context, SITE_USER);
  } catch {}

  for (const p of poolState.busyPages) {
    try {
      await p.close();
    } catch {}
  }
  poolState.busyPages.clear();
  for (const p of poolState.idlePages) {
    try {
      await p.close();
    } catch {}
  }
  poolState.idlePages.clear();

  try {
    await poolState.context.close();
  } catch {}
  poolState.context = null;

  if (poolState.browserRef) {
    try {
      await poolState.browserRef.close();
    } catch {}
    poolState.browserRef = null;
  }
  poolState.shuttingDown = false;
}

// ---- API del pool ----
async function getPageFromPool({ siteUserEmail } = {}) {
  const who = siteUserEmail || SITE_USER;

  if (!SHARED_CONTEXT) {
    const storageStatePath = await loadStorageStatePath(who);
    const { context } = await launchContext({ storageStatePath });
    const page = await context.newPage();
    page.__release = async () => {
      try {
        await saveContextStorageState(context, who);
      } catch {}
      try {
        await page.close();
      } catch {}
      try {
        await context.close();
      } catch {}
    };
    return page;
  }

  const ctx = await ensureContext();

  const pIdle = poolState.idlePages.values().next().value;
  if (pIdle) {
    poolState.idlePages.delete(pIdle);
    poolState.busyPages.add(pIdle);
    return pIdle;
  }

  const total = poolState.busyPages.size + poolState.idlePages.size;
  if (total < PAGE_POOL_SIZE) {
    const page = await ctx.newPage();
    attachPageLifecycle(page);
    poolState.busyPages.add(page);
    return page;
  }

  return new Promise((resolve) => {
    poolState.waitQueue.push(resolve);
  });
}

function attachPageLifecycle(page) {
  const detach = () => {
    poolState.busyPages.delete(page);
    poolState.idlePages.delete(page);
    const next = poolState.waitQueue.shift();
    if (next && poolState.context) {
      poolState.context
        .newPage()
        .then((p) => {
          attachPageLifecycle(p);
          poolState.busyPages.add(p);
          next(p);
        })
        .catch(() => {});
    } else {
      scheduleShutdownIfIdle();
    }
  };
  page.on("close", detach);
  page.on("crash", detach);
  page.__release = async () => releasePage(page);
}

async function releasePage(page) {
  const waiter = poolState.waitQueue.shift();
  if (waiter) {
    poolState.busyPages.delete(page);
    try {
      poolState.busyPages.add(page);
      waiter(page);
      return;
    } catch {}
  }

  poolState.busyPages.delete(page);

  if (poolState.idlePages.size < MAX_IDLE_PAGES) {
    poolState.idlePages.add(page);
  } else {
    try {
      await page.close();
    } catch {}
  }

  scheduleShutdownIfIdle();
}

// ---- Navegación rápida (sin networkidle) ----
async function gotoFast(page, url, timeoutMs = 20000) {
  return page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
}

// ---- Diagnóstico opcional ----
function getPoolStats() {
  return {
    hasContext: !!poolState.context,
    busyPages: poolState.busyPages.size,
    idlePages: poolState.idlePages.size,
    waiting: poolState.waitQueue.length,
    keepaliveMs: KEEPALIVE_MS,
    createdAt: poolState.createdAt,
    blocking: {
      images: BLOCK_IMAGES,
      fonts: BLOCK_FONTS,
      media: BLOCK_MEDIA,
      stylesheets: BLOCK_STYLESHEETS,
      thirdParty: BLOCK_THIRD_PARTY,
    },
    pagePoolSize: PAGE_POOL_SIZE,
    maxIdlePages: MAX_IDLE_PAGES,
    thirdPartyCount: THIRD_PARTY_HOSTS.length,
  };
}

module.exports = {
  getPageFromPool,
  releasePage,
  gotoFast,
  getPoolStats,
  _closeContextNow: closeContextNow,
};

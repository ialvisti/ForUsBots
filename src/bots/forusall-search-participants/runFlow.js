// src/bots/forusall-search-participants/runFlow.js
const {
  getPageFromPool,
  releasePage,
  gotoFast,
} = require("../../engine/sharedContext");
const { ensureAuthForTarget } = require("../../engine/auth/loginOtp");
const { saveEvidence } = require("../../engine/evidence");
const { SITE_USER, SITE_PASS, TOTP_SECRET } = require("../../config");

const PW_DEFAULT_TIMEOUT = Math.max(
  2000,
  parseInt(process.env.PW_DEFAULT_TIMEOUT || "6000", 10)
);

/** Selectores por defecto para /view_participants (basado en el HTML que compartiste) */
const DEFAULT_SEARCH = {
  url: "https://employer.forusall.com/view_participants",
  selectors: {
    inputs: {
      planName: "#plan_name",
      fullName: "#full_name",
      ssn: "#ssn",
      phone: "#phone",
      email: "#email",
      participantId: "#participant_id",
    },
    searchBtn: "#search",
    table: "#search_list",
    processing: "#search_list_processing",
    emptyCell: "tbody tr td.dataTables_empty",
    nextBtn: "#search_list_next > a",
    info: "#search_list_info",
    // “Shell” de esta pantalla (para ensureAuthForTarget)
    shell: "#search-table",
  },
};

function mergeSearch(metaSearch) {
  const base = DEFAULT_SEARCH;
  const inSel = (metaSearch && metaSearch.selectors) || {};
  return {
    url: (metaSearch && metaSearch.url) || base.url,
    selectors: {
      ...base.selectors,
      ...inSel,
      inputs: { ...(base.selectors.inputs || {}), ...(inSel.inputs || {}) },
    },
  };
}

function parseInfoText(text) {
  const m = String(text || "").match(
    /Showing\s+(\d+)\s+to\s+(\d+)\s+of\s+(\d+)\s+entries/i
  );
  if (!m) return null;
  return { from: +m[1], to: +m[2], total: +m[3] };
}

async function fillIf(page, selector, value) {
  if (value == null || String(value).trim() === "") return;
  const s = String(value);
  try {
    const loc = page.locator(selector).first();
    await loc.waitFor({ state: "visible", timeout: 7000 });
    await loc.fill("", { timeout: 2000 }).catch(() => {});
    await loc.fill(s, { timeout: 8000 });
  } catch {
    /* ignore */
  }
}

async function waitForSearchFinish(page, sel, timeout = 12000) {
  const { processing, table, emptyCell } = sel;
  const end = Date.now() + Math.max(4000, timeout);

  // Si el overlay aparece, esperar a que se oculte
  try {
    const proc = page.locator(processing);
    const seen = await proc.isVisible({ timeout: 600 }).catch(() => false);
    if (seen)
      await proc.waitFor({
        state: "hidden",
        timeout: Math.max(3000, timeout / 2),
      });
  } catch {}

  // Luego, esperar a que haya filas o que aparezca el “No data…”
  while (Date.now() < end) {
    const emptyVisible = await page
      .locator(`${table} ${emptyCell}`)
      .isVisible()
      .catch(() => false);
    if (emptyVisible) return;

    const rowsCount = await page
      .locator(`${table} tbody tr`)
      .count()
      .catch(() => 0);
    if (rowsCount > 0) return;

    await page.waitForTimeout(120);
  }
}

async function extractRowsFromPage(page, sel, limit = 25) {
  const { table } = sel;
  const rows = await page.$$eval(
    `${table} tbody tr`,
    (trs, max) => {
      const out = [];
      for (const tr of trs) {
        if (!tr || !tr.querySelector) continue;

        // Plan
        const planA = tr.querySelector('td:nth-child(1) a[href^="/plans/"]');
        const planName = planA ? (planA.textContent || "").trim() : null;
        let planId = null;
        const hrefPlan = planA && planA.getAttribute("href");
        const mp = hrefPlan && hrefPlan.match(/\/plans\/(\d+)\b/);
        if (mp) planId = mp[1];

        // First / Last
        const firstA = tr.querySelector(
          'td:nth-child(2) a[href^="/participants/"]'
        );
        const lastA = tr.querySelector(
          'td:nth-child(3) a[href^="/participants/"]'
        );
        const firstName = firstA ? (firstA.textContent || "").trim() : null;
        const lastName = lastA ? (lastA.textContent || "").trim() : null;

        // Participant ID (de cualquiera de los anchors)
        let participantId = null;
        const hp =
          (firstA && firstA.getAttribute("href")) ||
          (lastA && lastA.getAttribute("href")) ||
          "";
        const mp2 = hp && hp.match(/\/participants\/(\d+)\b/);
        if (mp2) participantId = mp2[1];

        // Last 4 SSN
        const last4A = tr.querySelector(
          'td:nth-child(4) a[href*="/participants/"][href*="/edit"]'
        );
        const last4Ssn = last4A ? (last4A.textContent || "").trim() : null;

        // Status / RM / Ops
        const status =
          (tr.querySelector("td:nth-child(5)")?.textContent || "").trim() ||
          null;
        const rmContact =
          (tr.querySelector("td:nth-child(6)")?.textContent || "").trim() ||
          null;
        const opsContact =
          (tr.querySelector("td:nth-child(7)")?.textContent || "").trim() ||
          null;

        out.push({
          planName,
          planId,
          firstName,
          lastName,
          participantId,
          last4Ssn,
          status,
          rmContact,
          opsContact,
        });
        if (out.length >= max) break;
      }
      return out;
    },
    Math.max(1, limit)
  );

  return rows;
}

module.exports = async function runFlow({ meta, jobCtx }) {
  if (!SITE_USER || !SITE_PASS || !TOTP_SECRET) {
    throw new Error(
      "Faltan SITE_USER, SITE_PASS o TOTP_SECRET en variables de entorno"
    );
  }

  const {
    loginUrl,
    selectors,
    search: searchIn,
    criteria = {},
    options = {},
  } = meta;

  const search = mergeSearch(searchIn);
  const s = search.selectors;

  const opt = {
    fetchAllPages: !!options.fetchAllPages,
    pageLimit: Math.max(1, Number(options.pageLimit || 1)),
    maxRows: Math.max(1, Number(options.maxRows || 25)),
    timeoutMs: Math.max(6000, Number(options.timeoutMs || 12000)),
    evidenceOnSuccess: !!options.evidenceOnSuccess,
  };

  let page = null;

  try {
    // 1) Página del pool compartido
    page = await getPageFromPool({ siteUserEmail: SITE_USER });
    page.setDefaultTimeout(PW_DEFAULT_TIMEOUT);
    page.setDefaultNavigationTimeout(PW_DEFAULT_TIMEOUT + 2000);

    // 2) Auth + OTP hacia /view_participants
    jobCtx?.setStage?.("auth");
    const SHELL = [
      s.shell,
      s.table,
      "#search_list_wrapper",
      "#search_list_filter input",
    ].filter(Boolean);
    await ensureAuthForTarget(page, {
      loginUrl:
        loginUrl ||
        DEFAULT_SEARCH.url.replace("/view_participants", "/sign_in"),
      targetUrl: search.url,
      selectors,
      shellSelectors: SHELL,
      jobCtx,
      saveSession: true,
    });

    // 3) Evidencia inicial (opcional)
    let evBefore = null;
    try {
      evBefore = await saveEvidence(page, "search-participants_before", {
        returnEvidenceBase64: false,
        saveEvidenceToTmp: true,
      });
    } catch {}

    // 4) Rellenar criterios
    jobCtx?.setStage?.("fill-criteria", { criteria });
    await fillIf(page, s.inputs.planName, criteria.companyName);
    await fillIf(page, s.inputs.fullName, criteria.fullName);
    await fillIf(page, s.inputs.ssn, criteria.ssn);
    await fillIf(page, s.inputs.phone, criteria.phone);
    await fillIf(page, s.inputs.email, criteria.email);
    await fillIf(page, s.inputs.participantId, criteria.participantId);

    // 5) Disparar búsqueda (+ esperar respuesta AJAX)
    jobCtx?.setStage?.("search");
    const respPromise = page
      .waitForResponse(
        (r) => /\/search_participants\b/.test(r.url()) && r.status() === 200,
        { timeout: opt.timeoutMs }
      )
      .catch(() => null);

    // Click botón, fallback Enter
    const clicked = await page
      .locator(s.searchBtn)
      .isVisible()
      .catch(() => false);
    if (clicked) {
      await page
        .locator(s.searchBtn)
        .click({ timeout: 6000 })
        .catch(() => {});
    } else {
      const prefer = s.inputs.fullName || s.inputs.email || s.inputs.planName;
      try {
        await page.locator(prefer).press("Enter");
      } catch {}
    }

    await Promise.race([
      respPromise,
      page.waitForTimeout(Math.min(10000, opt.timeoutMs)),
    ]);

    await waitForSearchFinish(page, s, opt.timeoutMs);

    // 6) ¿Sin datos?
    const isEmpty = await page
      .locator(`${s.table} ${s.emptyCell}`)
      .count()
      .catch(() => 0);
    let rows = [];
    let pagesFetched = 0;

    if (isEmpty > 0) {
      pagesFetched = 1;
    } else {
      // 6.1) Primera página
      pagesFetched = 1;
      rows.push(...(await extractRowsFromPage(page, s, opt.maxRows)));

      // 6.2) Paginación (si aplica)
      const nextBtn = page.locator(s.nextBtn);
      while (
        opt.fetchAllPages &&
        pagesFetched < opt.pageLimit &&
        rows.length < opt.maxRows
      ) {
        // ¿Está deshabilitado?
        const disabled = await nextBtn
          .evaluate((a) => {
            const li = a && a.parentElement;
            return !!(li && li.classList.contains("disabled"));
          })
          .catch(() => true);
        if (disabled) break;

        await nextBtn.click({ timeout: 5000 }).catch(() => {});
        await waitForSearchFinish(page, s, opt.timeoutMs);
        rows.push(
          ...(await extractRowsFromPage(page, s, opt.maxRows - rows.length))
        );
        pagesFetched += 1;
      }
    }

    // 7) Totales (texto “Showing X to Y of Z entries”)
    let info = null;
    try {
      const text = await page.locator(s.info).innerText({ timeout: 2000 });
      info = parseInfoText(text);
    } catch {}

    // 8) Evidencia final (opcional)
    let evAfter = null;
    try {
      if (opt.evidenceOnSuccess) {
        evAfter = await saveEvidence(page, "search-participants_after", {
          returnEvidenceBase64: false,
          saveEvidenceToTmp: true,
        });
      }
    } catch {}

    // 9) Respuesta
    return {
      ok: true,
      targetUrl: search.url,
      criteriaEcho: {
        companyName: criteria.companyName ?? null,
        fullName: criteria.fullName ?? null,
        email: criteria.email ?? null,
        ssn: criteria.ssn ?? null,
        phone: criteria.phone ?? null,
        participantId: criteria.participantId ?? null,
      },
      pagination: {
        pagesFetched,
        pageLimit: opt.pageLimit,
        estimatedTotal: info ? info.total : isEmpty ? 0 : null,
        hasNextPage: info ? info.to < info.total : null,
        shownText: info
          ? `Showing ${info.from} to ${info.to} of ${info.total} entries`
          : null,
      },
      count: rows.length,
      rows, // SOLO los campos pedidos
      evidencePath:
        ((evAfter || evBefore) && (evAfter?.path || evBefore?.path)) || null,
    };
  } finally {
    if (page) await releasePage(page);
  }
};

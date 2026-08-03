// docs/sandbox/js/main.js
import { initTheme } from "./core/theme.js";
import {
  $,
  showToast,
  maskSecret,
  prettyResult,
  lockBaseUrlToOrigin,
} from "./core/utils.js";
import { oneLineMeta } from "./core/meta.js";
import {
  renderBadges,
  updateVisibility,
  populateCaptionsFromSection,
  updateFileNameUI,
  setFile,
} from "./core/ui.js";
import { buildSnippets } from "./core/snippets.js";
import { validateBasicsForRun } from "./core/validate.js";
import { ENDPOINTS } from "./endpoints/constants.js";
import { startPolling } from "./endpoints/jobs.js";
import { wireScrapeUI, buildScrapeBodyStr } from "./core/scrape-ui.js";
import { wirePlanUI, buildPlanBodyStr } from "./core/plan-ui.js";
import {
  wireUpdateUI,
  buildUpdateBodyStr as buildUpdateBodyStrUP,
} from "./core/update-ui.js";
import {
  wireUpdatePlanUI,
  buildUpdatePlanBodyStr,
} from "./core/update-plan-ui.js";

import {
  wireSearchUI,
  buildSearchBodyStr as buildSearchBodyStrSP,
} from "./core/search-ui.js";

import {
  wireEmailUI,
  buildEmailBodyStr as buildEmailBodyStrET,
  validateEmailBody,
} from "./core/email-ui.js";

import {
  wireUsersManagementUI,
  buildUsersManagementBodyStr,
} from "./core/users-management-ui.js";

import {
  fetchWhoami,
  renderMeBanner,
  applyScopeToEndpointSelect,
} from "./core/scope.js";

// ==== Theme ====
const themeSwitch = $("#themeSwitch");
const themeLabel = $("#themeLabel");
initTheme(themeSwitch, themeLabel);

// ==== Base inputs ====
const baseUrl = $("#baseUrl");
const token = $("#token");
const endpointSel = $("#endpoint");
const endpointBadges = $("#endpointBadges");
lockBaseUrlToOrigin(baseUrl);

// ==== MFA controls ====
const mfaParticipantId = $("#mfaParticipantId");

// ==== Upload controls ====
const pdfFile = $("#pdfFile");
const xFilename = $("#xFilename");
const planId = $("#planId");
const effectiveDate = $("#effectiveDate");
const section = $("#section");
const caption = $("#caption");
const status = $("#status");
const captionOtherText = $("#captionOtherText");
const otherWrap = $("#otherWrap");
const dropzone = $("#dropzone");
const fileNameEl = $("#fileName");

// ==== Jobs ====
const jobId = $("#jobId");

// ==== Outputs ====
const headersKV = $("#headersKV");
const metaBlock = $("#metaBlock");
const metaOut = $("#metaOut");
const curlCode = $("#curlCode");
const httpieCode = $("#httpieCode");
const nodeCode = $("#nodeCode");
const pyCode = $("#pyCode");

// ==== Buttons ====
const genBtn = $("#genBtn");
const runBtn = $("#runBtn");
const cancelBtn = $("#cancelBtn");

// ==== Runner outputs ====
const runResult = $("#runResult pre");
const jobArea = $("#jobArea");
const jobState = $("#jobState");
const jobJson = $("#jobJson pre");

// ==== Toast ====
const toast = $("#toast");

// Allow-list for upload types (keep in sync with validate.js)
const ALLOWED_EXTS = new Set([".pdf", ".xlsx", ".xls", ".csv", ".zip"]);
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
]);
const getExt = (name) => {
  const m = String(name || "")
    .trim()
    .match(/(\.[^.]+)$/);
  return m ? m[1].toLowerCase() : "";
};

// ---- helpers ----
function renderHeaders(metaStr, jsonBodyStr = null) {
  const ep = ENDPOINTS[endpointSel.value];
  headersKV.innerHTML = "";
  const kv = [
    [
      "Content-Type",
      // Binary for uploads; JSON otherwise
      ep.group === "upload" ? "application/octet-stream" : "application/json",
    ],
  ];
  if (ep.needs?.token) kv.push(["x-auth-token", token.value || "(empty)"]);
  if (ep.needs?.xfilename)
    kv.push(["x-filename", xFilename.value || "(empty)"]);
  if (ep.needs?.meta) kv.push(["x-meta", metaStr || "(empty)"]);

  kv.forEach(([k, v]) => {
    const row = document.createElement("div");
    row.className = "kv";
    const kd = document.createElement("div");
    kd.className = "k";
    kd.textContent = k;
    const vd = document.createElement("div");
    vd.className = "v";
    if (k === "x-auth-token") {
      vd.textContent = v && v !== "(empty)" ? maskSecret(v) : "(empty)";
      vd.classList.add("secret");
    } else {
      vd.textContent = v;
    }
    row.appendChild(kd);
    row.appendChild(vd);
    headersKV.appendChild(row);
  });
}

function buildAndRenderSnippets(ep, metaStr, jsonBodyStr = null) {
  const { curl, httpie, node, py } = buildSnippets(
    ep,
    baseUrl,
    xFilename,
    jobId,
    metaStr,
    jsonBodyStr
  );
  curlCode.textContent = curl;
  httpieCode.textContent = httpie;
  nodeCode.textContent = node;
  pyCode.textContent = py;
}

function refreshAllOutputs() {
  const ep = ENDPOINTS[endpointSel.value];
  renderBadges(endpointSel, endpointBadges, ENDPOINTS);
  updateVisibility(endpointSel, metaBlock, jobArea, ENDPOINTS);
  populateCaptionsFromSection(section, caption, otherWrap);

  let metaStr = "";
  let jsonBodyStr = null;

  if (ep.needs?.meta) {
    metaStr = oneLineMeta({
      planId,
      section,
      caption,
      status,
      effectiveDate,
      captionOtherText,
    });
  }

  if (endpointSel.value === "search-participants") {
    jsonBodyStr = buildSearchBodyStrSP(false); // compact
  }

  if (endpointSel.value === "email-trigger") {
    jsonBodyStr = buildEmailBodyStrET(false); // compact
  }

  if (endpointSel.value === "scrape-participant") {
    jsonBodyStr = buildScrapeBodyStr(false); // compact
  } else if (endpointSel.value === "scrape-plan") {
    jsonBodyStr = buildPlanBodyStr(false); // compact
  } else if (endpointSel.value === "mfa-reset") {
    const pid = (mfaParticipantId?.value || "").trim();
    jsonBodyStr = JSON.stringify({ participantId: pid });
  } else if (endpointSel.value === "update-participant") {
    jsonBodyStr = buildUpdateBodyStrUP(false);
  } else if (
    endpointSel.value === "update-plan" ||
    endpointSel.value === "sandbox-update-plan"
  ) {
    jsonBodyStr = buildUpdatePlanBodyStr(false);
  } else if (
    endpointSel.value === "users-management-create" ||
    endpointSel.value === "users-management-edit" ||
    endpointSel.value === "sandbox-users-management-create" ||
    endpointSel.value === "sandbox-users-management-edit"
  ) {
    jsonBodyStr = buildUsersManagementBodyStr(endpointSel.value, false);
    // Toggle sub-mode (create vs edit) inside the users-management builder
    const isCreate = endpointSel.value.endsWith("create");
    document
      .querySelectorAll(".um-mode-create")
      .forEach((el) => el.classList.toggle("hidden", !isCreate));
    document
      .querySelectorAll(".um-mode-edit")
      .forEach((el) => el.classList.toggle("hidden", isCreate));
  }

  renderHeaders(metaStr, jsonBodyStr);
  if (ep.needs?.meta) {
    metaOut.value = metaStr;
    metaBlock.classList.remove("hidden");
  } else {
    metaOut.value = "";
    metaBlock.classList.add("hidden");
  }
  buildAndRenderSnippets(ep, metaStr, jsonBodyStr);
}

// ---- Events ----
endpointSel.addEventListener("change", () => {
  resetJobVisual();
  runResult.textContent = "(not executed)";
  refreshAllOutputs();
});

section.addEventListener("change", () => {
  populateCaptionsFromSection(section, caption, otherWrap);
  refreshAllOutputs();
});

caption.addEventListener("change", () => {
  const isOther = (caption.value || "").trim().toLowerCase() === "other";
  otherWrap.classList.toggle("hidden", !isOther);
  refreshAllOutputs();
});

captionOtherText.addEventListener("input", refreshAllOutputs);
status.addEventListener("change", refreshAllOutputs);
[planId, effectiveDate, xFilename, jobId, token, mfaParticipantId].forEach(
  (el) => el && el.addEventListener("input", refreshAllOutputs)
);

// Scrape UI (strict default ON, hide timeout)
wireScrapeUI({
  onChange: refreshAllOutputs,
  strictDefault: true,
  hideTimeout: true,
});

// Plan UI (strict default OFF, hide timeout)
wirePlanUI({
  onChange: refreshAllOutputs,
  strictDefault: false,
  hideTimeout: true,
});

// Search UI
wireSearchUI({ onChange: refreshAllOutputs });

// Update Participant UI
wireUpdateUI({ onChange: refreshAllOutputs });

// Update Plan UI
wireUpdatePlanUI({ onChange: refreshAllOutputs });

// Users Management UI
wireUsersManagementUI({ onChange: refreshAllOutputs });

// Email Trigger UI
wireEmailUI({ onChange: refreshAllOutputs });

document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const pre = document.querySelector(btn.getAttribute("data-copy"));
    navigator.clipboard
      .writeText(pre.textContent || "")
      .then(() => showToast(toast));
  });
});

// ---- Drag & drop + file input ----
(function wireDropzone() {
  const fChange = () => {
    const f = pdfFile.files && pdfFile.files[0];
    setFile(f, pdfFile, xFilename, fileNameEl, runResult);
  };
  pdfFile.addEventListener("change", fChange);

  const click = () => pdfFile.click();
  dropzone.addEventListener("click", click);
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      click();
    }
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  ["dragleave", "dragend"].forEach((ev) =>
    dropzone.addEventListener(ev, () => dropzone.classList.remove("dragover"))
  );

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");

    // pick first allowed file by mime OR extension
    const file = [...e.dataTransfer.files].find((x) => {
      if (!x) return false;
      const ext = getExt(x.name);
      return ALLOWED_MIMES.has(x.type) || ALLOWED_EXTS.has(ext);
    });

    setFile(file, pdfFile, xFilename, fileNameEl, runResult);
  });
})();

genBtn.addEventListener("click", (e) => {
  e.preventDefault();
  refreshAllOutputs();
});

let cancelPolling = null;
function setCancelPolling(fn) {
  cancelPolling = fn;
}
function resetJobVisual() {
  const cancel = cancelPolling;
  cancelPolling = null;
  cancel?.(true);
  cancelBtn.disabled = true;
  jobState.className = "status";
  jobState.querySelector(".txt").textContent = "—";
  jobJson.textContent = "(waiting for job)";
}
cancelBtn.addEventListener("click", () => {
  if (cancelPolling) cancelPolling();
});

// ---- Run (incluye polling para 202) ----
runBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  resetJobVisual();
  runResult.textContent = "Running…";
  const ep = ENDPOINTS[endpointSel.value];
  try {
    let metaStr = "";
    if (ep.needs?.meta)
      metaStr = oneLineMeta({
        planId,
        section,
        caption,
        status,
        effectiveDate,
        captionOtherText,
      });

    // scrape: participantId must exist
    let jsonBodyStr = null;
    if (endpointSel.value === "scrape-participant") {
      jsonBodyStr = buildScrapeBodyStr(false);
      const bodyTest = JSON.parse(jsonBodyStr);
      if (
        !bodyTest.participantId ||
        String(bodyTest.participantId).trim() === ""
      ) {
        throw new Error("participantId is required for this endpoint.");
      }
    }
    
    // scrape-plan: planId must exist
    if (endpointSel.value === "scrape-plan") {
      jsonBodyStr = buildPlanBodyStr(false);
      const bodyTest = JSON.parse(jsonBodyStr);
      if (
        !bodyTest.planId ||
        String(bodyTest.planId).trim() === ""
      ) {
        throw new Error("planId is required for this endpoint.");
      }
    }

    // mfa-reset: participantId must exist
    if (endpointSel.value === "mfa-reset") {
      const pid = (mfaParticipantId?.value || "").trim();
      if (!pid) throw new Error("participantId is required for this endpoint.");
      jsonBodyStr = JSON.stringify({ participantId: pid });
    }

    // update-participant: participantId, note y and at least 1 update
    if (endpointSel.value === "update-participant") {
      jsonBodyStr = buildUpdateBodyStrUP(false);
      const bodyTest = JSON.parse(jsonBodyStr || "{}");
      const pid = String(bodyTest.participantId || "").trim();
      const note = String(bodyTest.note || "").trim();
      const ups =
        bodyTest.updates && typeof bodyTest.updates === "object"
          ? bodyTest.updates
          : {};
      if (!pid) throw new Error("participantId is required for this endpoint.");
      if (!note) throw new Error("note is required for this endpoint.");
      const keys = Object.keys(ups);
      if (!keys.length) throw new Error("Add at least one update field.");
    }

    // update-plan / sandbox-update-plan: planId, note y al menos 1 update
    if (
      endpointSel.value === "update-plan" ||
      endpointSel.value === "sandbox-update-plan"
    ) {
      jsonBodyStr = buildUpdatePlanBodyStr(false);
      const bodyTest = JSON.parse(jsonBodyStr || "{}");
      const pid = String(bodyTest.planId || "").trim();
      const note = String(bodyTest.note || "").trim();
      const ups =
        bodyTest.updates && typeof bodyTest.updates === "object"
          ? bodyTest.updates
          : {};
      if (!pid) throw new Error("planId is required for this endpoint.");
      if (!note) throw new Error("note is required for this endpoint.");
      const keys = Object.keys(ups);
      if (!keys.length) throw new Error("Add at least one update field.");
    }

    // search-participants: at least one criteria
    if (endpointSel.value === "search-participants") {
      jsonBodyStr = buildSearchBodyStrSP(false);
      const bodyTest = JSON.parse(jsonBodyStr);
      const c = bodyTest.criteria || {};
      const hasAny = Object.values(c).some(
        (v) => v != null && String(v).trim() !== ""
      );
      if (!hasAny)
        throw new Error("Provide at least one search criteria field.");
    }

    // email-trigger: mirror controller preflight, including conditional fields.
    if (endpointSel.value === "email-trigger") {
      jsonBodyStr = buildEmailBodyStrET(false);
      const bodyTest = JSON.parse(jsonBodyStr);
      validateEmailBody(bodyTest);
    }

    // users-management create/edit (real + sandbox): build the body and
    // do light pre-flight (server still validates everything).
    if (
      endpointSel.value === "users-management-create" ||
      endpointSel.value === "sandbox-users-management-create"
    ) {
      jsonBodyStr = buildUsersManagementBodyStr(endpointSel.value, false);
      let bodyTest = {};
      try { bodyTest = JSON.parse(jsonBodyStr || "{}"); } catch {}
      const note = String(bodyTest.note || "").trim();
      const user = bodyTest.user && typeof bodyTest.user === "object" ? bodyTest.user : {};
      if (!note) throw new Error("note is required for this endpoint.");
      if (!String(user.email || "").trim()) throw new Error("user.email is required.");
      if (!String(user.password || "").trim()) throw new Error("user.password is required.");
      if (!String(user.passwordConfirmation || "").trim())
        throw new Error("user.passwordConfirmation is required.");
    }
    if (
      endpointSel.value === "users-management-edit" ||
      endpointSel.value === "sandbox-users-management-edit"
    ) {
      jsonBodyStr = buildUsersManagementBodyStr(endpointSel.value, false);
      let bodyTest = {};
      try { bodyTest = JSON.parse(jsonBodyStr || "{}"); } catch {}
      const userId = Number(bodyTest.userId);
      const note = String(bodyTest.note || "").trim();
      const updates = bodyTest.updates && typeof bodyTest.updates === "object" ? bodyTest.updates : {};
      const resetMfa = String(bodyTest.resetMfa || "none");
      if (!Number.isFinite(userId) || !Number.isInteger(userId) || userId <= 0)
        throw new Error("userId is required (positive integer).");
      if (!note) throw new Error("note is required for this endpoint.");
      if (Object.keys(updates).length === 0 && resetMfa === "none")
        throw new Error("Add at least one update field or set resetMfa.");
    }

    renderHeaders(metaStr, jsonBodyStr);
    if (metaStr) metaOut.value = metaStr;
    buildAndRenderSnippets(ep, metaStr, jsonBodyStr);

    const { base, headers, bodyPromise } = validateBasicsForRun({
      ep,
      baseUrl,
      token,
      xFilename,
      metaStr,
      pdfFile,
      jobId,
    });

    const url = ep.path.replace(":id", jobId.value || "");
    let body = bodyPromise ? await bodyPromise : undefined;
    if (endpointSel.value === "scrape-participant") body = jsonBodyStr;
    if (endpointSel.value === "scrape-plan") body = jsonBodyStr;
    if (endpointSel.value === "mfa-reset") body = jsonBodyStr;
    if (endpointSel.value === "search-participants") body = jsonBodyStr;
    if (endpointSel.value === "update-participant") body = jsonBodyStr;
    if (
      endpointSel.value === "update-plan" ||
      endpointSel.value === "sandbox-update-plan"
    )
      body = jsonBodyStr;
    if (endpointSel.value === "email-trigger") body = jsonBodyStr;
    if (
      endpointSel.value === "users-management-create" ||
      endpointSel.value === "users-management-edit" ||
      endpointSel.value === "sandbox-users-management-create" ||
      endpointSel.value === "sandbox-users-management-edit"
    )
      body = jsonBodyStr;

    const res = await fetch(base + url, { method: ep.method, headers, body });
    const text = await res.text();
    prettyResult(runResult, res.status, text);

    if (ep.pollJob && res.status === 202) {
      let data = {};
      try {
        data = JSON.parse(text);
      } catch {}
      if (!data.jobId) return;

      const renderState = (j) => {
        if (!j) {
          resetJobVisual();
          return;
        }
        const s = j.state ?? j.status;
        jobJson.textContent = JSON.stringify(j, null, 2);
        jobState.className = "status state-" + (s || "");
        jobState.querySelector(".txt").textContent = `${s || "-"} ${
          j.stage ? "— " + j.stage : ""
        }`;
      };

      const cancel = startPolling({
        base,
        jobId: data.jobId,
        tokenValue: headers["x-auth-token"],
        renderState,
        cancelBtn,
      });
      setCancelPolling(cancel);
    } else {
      if (cancelPolling) cancelPolling();
    }
  } catch (err) {
    runResult.textContent = "Error: " + (err.message || String(err));
  }
});

// ==== Init ====
renderBadges(endpointSel, endpointBadges, ENDPOINTS);
updateVisibility(endpointSel, metaBlock, jobArea, ENDPOINTS);
if (!section.value) section.value = "CONTRACTS & AGREEMENTS";
populateCaptionsFromSection(section, caption, otherWrap);
updateFileNameUI(pdfFile, fileNameEl);
refreshAllOutputs();

// ==== Scope wiring ====
let scopeReqId = 0;
async function refreshScopeFromToken() {
  const id = ++scopeReqId;
  const me = await fetchWhoami(baseUrl.value, token.value);
  if (id !== scopeReqId) return; // discard stale response
  renderMeBanner(me);
  applyScopeToEndpointSelect(endpointSel, me, ENDPOINTS);
}
let scopeRefreshTimer = null;
token.addEventListener("input", () => {
  clearTimeout(scopeRefreshTimer);
  scopeRefreshTimer = setTimeout(refreshScopeFromToken, 250);
});
token.addEventListener("change", refreshScopeFromToken);
refreshScopeFromToken();

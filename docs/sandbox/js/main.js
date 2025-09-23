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
import { runDryUpload } from "./endpoints/upload.js";
import { wireScrapeUI, buildScrapeBodyStr } from "./core/scrape-ui.js";
import {
  wireUpdateUI,
  buildUpdateBodyStr as buildUpdateBodyStrUP,
} from "./core/update-ui.js";

import {
  wireSearchUI,
  buildSearchBodyStr as buildSearchBodyStrSP,
} from "./core/search-ui.js";

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
const dryBtn = $("#dryBtn");
const runBtn = $("#runBtn");
const cancelBtn = $("#cancelBtn");

// ==== Runner outputs ====
const runResult = $("#runResult pre");
const jobArea = $("#jobArea");
const jobState = $("#jobState");
const jobJson = $("#jobJson pre");

// ==== Toast ====
const toast = $("#toast");

// ---- helpers ----
function renderHeaders(metaStr, jsonBodyStr = null) {
  const ep = ENDPOINTS[endpointSel.value];
  headersKV.innerHTML = "";
  const kv = [
    [
      "Content-Type",
      ep.group === "upload" ? "application/pdf" : "application/json",
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
  updateVisibility(endpointSel, metaBlock, dryBtn, jobArea, ENDPOINTS);
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

  if (endpointSel.value === "scrape-participant") {
    jsonBodyStr = buildScrapeBodyStr(false); // compact
  } else if (endpointSel.value === "mfa-reset") {
    const pid = (mfaParticipantId?.value || "").trim();
    jsonBodyStr = JSON.stringify({ participantId: pid });
  } else if (endpointSel.value === "update-participant") {
    jsonBodyStr = buildUpdateBodyStrUP(false);
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
  cancelPolling?.();
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

// Search UI
wireSearchUI({ onChange: refreshAllOutputs });

// Update Participant UI
wireUpdateUI({ onChange: refreshAllOutputs });

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
    const f = [...e.dataTransfer.files].find(
      (x) => x && (x.type === "application/pdf" || /\.pdf$/i.test(x.name))
    );
    setFile(f, pdfFile, xFilename, fileNameEl, runResult);
  });
})();

genBtn.addEventListener("click", (e) => {
  e.preventDefault();
  refreshAllOutputs();
});

// ---- Dry Run (upload sandbox only) ----
dryBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  if (endpointSel.value !== "sandbox-upload") {
    runResult.textContent = "Dry-Run applies to the sandbox-upload endpoint.";
    return;
  }
  try {
    const ep = ENDPOINTS[endpointSel.value];
    const metaStr = oneLineMeta({
      planId,
      section,
      caption,
      status,
      effectiveDate,
      captionOtherText,
    });
    renderHeaders(metaStr);
    buildAndRenderSnippets(ep, metaStr);
    metaOut.value = metaStr;

    const { base, headers, bodyPromise } = validateBasicsForRun({
      ep,
      baseUrl,
      token,
      xFilename,
      metaStr,
      pdfFile,
    });
    await runDryUpload({
      base,
      headers,
      bodyPromise,
      runResultEl: runResult,
    });
  } catch (err) {
    runResult.textContent = "Error: " + (err.message || String(err));
  }
});

let cancelPolling = null;
function setCancelPolling(fn) {
  cancelPolling = fn;
}
cancelBtn.addEventListener("click", () => {
  if (cancelPolling) cancelPolling();
});

// ---- Run (incluye polling para 202) ----
runBtn.addEventListener("click", async (e) => {
  e.preventDefault();
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

    // search-participants: at least one criteria must exist
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
    });

    const url = ep.path.replace(":id", jobId.value || "");
    let body = bodyPromise ? await bodyPromise : undefined;
    if (endpointSel.value === "scrape-participant") body = jsonBodyStr;
    if (endpointSel.value === "mfa-reset") body = jsonBodyStr;
    if (endpointSel.value === "search-participants") body = jsonBodyStr;
    if (endpointSel.value === "update-participant") body = jsonBodyStr;

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
      setCancelPolling(() => cancel());
    } else {
      if (cancelPolling) cancelPolling();
    }
  } catch (err) {
    runResult.textContent = "Error: " + (err.message || String(err));
  }
});

// ==== Init ====
renderBadges(endpointSel, endpointBadges, ENDPOINTS);
updateVisibility(endpointSel, metaBlock, dryBtn, jobArea, ENDPOINTS);
if (!section.value) section.value = "CONTRACTS & AGREEMENTS";
populateCaptionsFromSection(section, caption, otherWrap);
updateFileNameUI(pdfFile, fileNameEl);
refreshAllOutputs();

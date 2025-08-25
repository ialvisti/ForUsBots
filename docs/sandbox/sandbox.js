// docs/sandbox/sandbox.js (updated with token masking in headers + snippets)
(function () {
  const $ = (sel) => document.querySelector(sel);

  /* =========================
   *  Light/Dark theme toggle
   * ========================= */
  const themeSwitch = $("#themeSwitch");
  const themeLabel = $("#themeLabel");

  function applyTheme(mode) {
    // mode: 'light' | 'dark'
    document.documentElement.setAttribute("data-theme", mode);
    if (themeSwitch) themeSwitch.checked = mode === "light";
    if (themeLabel)
      themeLabel.textContent = mode === "light" ? "Light" : "Dark";
    try {
      localStorage.setItem("forusbots.theme", mode);
    } catch {}
  }

  (function initTheme() {
    let mode = "dark";
    try {
      const saved = localStorage.getItem("forusbots.theme");
      if (saved === "light" || saved === "dark") {
        mode = saved;
      } else if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: light)").matches
      ) {
        mode = "light";
      }
    } catch {}
    applyTheme(mode);
  })();

  if (themeSwitch) {
    themeSwitch.addEventListener("change", () => {
      applyTheme(themeSwitch.checked ? "light" : "dark");
    });
  }

  // =========================
  //  Sandbox core
  // =========================

  // Inputs base
  const baseUrl = $("#baseUrl");
  const token = $("#token");
  const endpointSel = $("#endpoint");
  const endpointBadges = $("#endpointBadges");

  // Upload controls
  const pdfFile = $("#pdfFile");
  const xFilename = $("#xFilename");
  const planId = $("#planId");
  const effectiveDate = $("#effectiveDate");
  const section = $("#section"); // <select>
  const caption = $("#caption"); // <select>
  const status = $("#status");
  const captionOtherText = $("#captionOtherText");
  const otherWrap = $("#otherWrap");
  const dropzone = $("#dropzone");
  const fileNameEl = $("#fileName");

  // Jobs controls
  const jobId = $("#jobId");

  // Outputs
  const headersKV = $("#headersKV");
  const metaBlock = $("#metaBlock");
  const metaOut = $("#metaOut");
  const curlCode = $("#curlCode");
  const httpieCode = $("#httpieCode");
  const nodeCode = $("#nodeCode");
  const pyCode = $("#pyCode");

  // Buttons
  const genBtn = $("#genBtn");
  const dryBtn = $("#dryBtn");
  const runBtn = $("#runBtn");
  const cancelBtn = $("#cancelBtn");

  // Runner outputs
  const runResult = $("#runResult pre");
  const jobArea = $("#jobArea");
  const jobState = $("#jobState");
  const jobJson = $("#jobJson pre");

  // Toast
  const toast = $("#toast");
  const showToast = (msg = "Copied ✅") => {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1200);
  };

  // Lock Base URL to origin (read-only)
  try {
    baseUrl.value = window.location.origin;
    baseUrl.readOnly = true;
    baseUrl.setAttribute("aria-readonly", "true");
    baseUrl.title = "Locked to this page’s origin";
  } catch {}

  // Endpoint config
  const ENDPOINTS = {
    "vault-upload": {
      label: "POST /forusbot/vault-file-upload",
      method: "POST",
      path: "/forusbot/vault-file-upload",
      group: "upload",
      needs: { token: true, pdf: true, xfilename: true, meta: true },
      pollJob: true,
    },
    "sandbox-upload": {
      label: "POST /forusbot/sandbox/vault-file-upload (dry-run)",
      method: "POST",
      path: "/forusbot/sandbox/vault-file-upload",
      group: "upload",
      needs: { token: false, pdf: false, xfilename: true, meta: true },
      pollJob: false,
    },
    "jobs-get": {
      label: "GET /forusbot/jobs/:id",
      method: "GET",
      path: "/forusbot/jobs/:id",
      group: "jobs",
      needs: { token: true, jobId: true },
      pollJob: false,
    },
    "jobs-delete": {
      label: "DELETE /forusbot/jobs/:id",
      method: "DELETE",
      path: "/forusbot/jobs/:id",
      group: "jobs",
      needs: { token: true, jobId: true },
      pollJob: false,
    },
    "status-get": {
      label: "GET /forusbot/status",
      method: "GET",
      path: "/forusbot/status",
      group: "misc",
      needs: { token: true },
      pollJob: false,
    },
  };

  // Section -> Captions mapping (order preserved)
  const SECTION_CAPTIONS = {
    "COVER LETTERS": ["Other"],
    "PLAN DOCUMENTS": [
      "Basic Plan Documents",
      "Adoption Agreement",
      "Joinder Agreement",
      "IRS Determination Letter",
      "Fidelity Bond",
      "Funding/QDRO/Loan",
      "Investment Policy Statement",
      "Other",
    ],
    "CONTRACTS & AGREEMENTS": [
      "Plan Service Agreement",
      "ADV Part II",
      "3(16) Contract",
      "Recordkeeper Agreement",
      "Sponsor Fee Disclosure",
      "Other",
    ],
    // Alias guard (typo)
    "CONTACTS & AGREEMENTS": [
      "Plan Service Agreement",
      "ADV Part II",
      "3(16) Contract",
      "Recordkeeper Agreement",
      "Sponsor Fee Disclosure",
      "Other",
    ],
    "PARTICIPANT NOTICES": [
      "Annual Notices",
      "Auto Enrollment Notice",
      "Participant Introduction Packet",
      "Summary Plan Description",
      "Participant Fee Disclosure",
      "ForUsAll Participant Fee Disclosure",
      "QDIA Notice",
      "Blackout Notice",
      "Summary Annual Report",
      "Fund Information",
      "Plan Highlights",
      "Safe Harbor Notice",
      "Force Out Notice",
      "Fund Lineup Change Notice",
      "LT Force Out Form",
      "Year End Notice Packet",
      "Summary of Material Modifications",
      "Other",
    ],
    COMPLIANCE: ["Form 5500", "Other"],
    "OTHER DOCUMENTS": ["Other"],
    "AUDIT DOCUMENTS": [
      "Election History",
      "Pay Data",
      "Cash Transfer",
      "Other",
    ],
  };

  function renderBadges() {
    const ep = ENDPOINTS[endpointSel.value];
    endpointBadges.innerHTML = "";
    const add = (txt) => {
      const b = document.createElement("div");
      b.className = "badge badge-endpoint";
      b.textContent = txt;
      endpointBadges.appendChild(b);
    };
    add(ep.label);
    if (ep.pollJob) add("GET /forusbot/jobs/:id");
  }

  function updateVisibility() {
    const ep = ENDPOINTS[endpointSel.value];
    document
      .querySelectorAll(".ep")
      .forEach((el) => el.classList.add("hidden"));
    document
      .querySelectorAll(".ep-" + ep.group)
      .forEach((el) => el.classList.remove("hidden"));
    metaBlock.classList.toggle("hidden", !ep.needs.meta);
    dryBtn.classList.toggle("hidden", endpointSel.value !== "sandbox-upload");
    const showJob =
      endpointSel.value === "vault-upload" ||
      endpointSel.value === "sandbox-upload";
    jobArea.classList.toggle("hidden", !showJob);
  }

  // Populate caption options from section
  function populateCaptionsFromSection(preserve = true) {
    const sec = (section.value || "").trim();
    const options = SECTION_CAPTIONS[sec] || ["Other"];
    const prev = preserve ? caption.value || "" : "";

    caption.innerHTML = "";
    let selectedSet = false;

    options.forEach((opt) => {
      const o = document.createElement("option");
      o.textContent = opt;
      o.value = opt;
      if (!selectedSet && prev && opt === prev) {
        o.selected = true;
        selectedSet = true;
      }
      caption.appendChild(o);
    });

    if (!selectedSet && caption.options.length) {
      caption.options[0].selected = true;
    }

    const now = (caption.value || "").toLowerCase();
    const isOtherForced =
      options.length === 1 && options[0].toLowerCase() === "other";
    const isOther = now === "other";
    otherWrap.classList.toggle("hidden", !(isOtherForced || isOther));
  }

  // caption -> toggle captionOtherText
  caption.addEventListener("change", () => {
    const isOther = (caption.value || "").trim().toLowerCase() === "other";
    otherWrap.classList.toggle("hidden", !isOther);
    refreshAllOutputs();
  });

  // --- File input UX: name display + drag & drop ---
  function updateFileNameUI() {
    const f = pdfFile.files && pdfFile.files[0];
    fileNameEl.textContent = f ? f.name : "No file selected.";
  }
  function setFile(f) {
    if (!f) return;
    if (!(f.type === "application/pdf" || /\.pdf$/i.test(f.name))) {
      runResult.textContent = "Error: please drag/select a valid PDF.";
      return;
    }
    const dt = new DataTransfer();
    dt.items.add(f);
    pdfFile.files = dt.files;
    updateFileNameUI();
    if (!xFilename.value) xFilename.value = f.name;
  }
  pdfFile.addEventListener("change", () => {
    const f = pdfFile.files && pdfFile.files[0];
    setFile(f);
  });
  dropzone.addEventListener("click", () => pdfFile.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pdfFile.click();
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
    setFile(f);
  });

  // ===== Helpers for masking secrets =====
  function maskSecret(s) {
    if (!s) return "(empty)";
    const len = s.length;
    const dots = "•".repeat(Math.min(len, 24));
    return len > 24 ? dots + "…" : dots;
  }

  // Build one-line x-meta
  function oneLineMeta() {
    const meta = {
      planId: planId.value ? Number(planId.value) : undefined,
      formData: {
        section: (section.value || "").trim(),
        caption: (caption.value || "").trim(),
        status: (status.value || "").trim(),
        effectiveDate: (effectiveDate.value || "").trim(),
      },
    };
    const isOther = (meta.formData.caption || "").toLowerCase() === "other";
    if (isOther)
      meta.formData.captionOtherText = (captionOtherText.value || "").trim();
    return JSON.stringify(meta);
  }

  // Render headers (token always masked, no toggle button)
  function renderHeaders(metaStr) {
    const ep = ENDPOINTS[endpointSel.value];
    headersKV.innerHTML = "";
    const kv = [
      [
        "Content-Type",
        ep.group === "upload" ? "application/pdf" : "application/json",
      ],
    ];
    if (ep.needs.token) kv.push(["x-auth-token", token.value || "(empty)"]);
    if (ep.needs.xfilename)
      kv.push(["x-filename", xFilename.value || "(empty)"]);
    if (ep.needs.meta) kv.push(["x-meta", metaStr || "(empty)"]);

    kv.forEach(([k, v]) => {
      const row = document.createElement("div");
      row.className = "kv";

      const kd = document.createElement("div");
      kd.className = "k";
      kd.textContent = k;

      const vd = document.createElement("div");
      vd.className = "v";

      if (k === "x-auth-token") {
        if (v && v !== "(empty)") {
          // Mostrar siempre enmascarado
          vd.textContent = maskSecret(v);
          vd.classList.add("secret"); // por si usas el estilo CSS opcional
        } else {
          vd.textContent = "(empty)";
        }
      } else {
        vd.textContent = v;
      }

      row.appendChild(kd);
      row.appendChild(vd);
      headersKV.appendChild(row);
    });
  }

  // Build language snippets (token always shown as placeholder)
  function buildSnippets(metaStr) {
    const ep = ENDPOINTS[endpointSel.value];
    const base = (baseUrl.value || window.location.origin).replace(/\/$/, "");
    const fileName = xFilename.value || "document.pdf";
    const tokLiteral = "YOUR_TOKEN_HERE"; // <- never show the real token
    const url = ep.path.replace(":id", jobId.value || "<jobId>");

    // cURL
    let curl = `curl -X ${ep.method} "${base}${url}" \\\n  -H "Content-Type: ${
      ep.group === "upload" ? "application/pdf" : "application/json"
    }"`;
    if (ep.needs.token) curl += ` \\\n  -H "x-auth-token: ${tokLiteral}"`;
    if (ep.needs.xfilename) curl += ` \\\n  -H "x-filename: ${fileName}"`;
    if (ep.needs.meta) curl += ` \\\n  -H 'x-meta: ${metaStr}'`;
    if (ep.group === "upload") curl += ` \\\n  --data-binary @./${fileName}`;

    // HTTPie
    let httpie = `http --body ${ep.method} ${base}${url} \\\n  Content-Type:${
      ep.group === "upload" ? "application/pdf" : "application/json"
    }`;
    if (ep.needs.token) httpie += ` \\\n  "x-auth-token:${tokLiteral}"`;
    if (ep.needs.xfilename) httpie += ` \\\n  "x-filename:${fileName}"`;
    if (ep.needs.meta) httpie += ` \\\n  "x-meta:${metaStr}"`;
    if (ep.group === "upload") httpie += ` \\\n  < ./${fileName}`;

    // Node
    let node = `// Node.js 18+
const base='${base}';
const token='${tokLiteral}';
const res = await fetch(base + '${url}', {
  method: '${ep.method}',
  headers: {`;
    if (ep.group === "upload")
      node += `\n    'Content-Type': 'application/pdf',`;
    else node += `\n    'Content-Type': 'application/json',`;
    if (ep.needs.token) node += `\n    'x-auth-token': token,`;
    if (ep.needs.xfilename) node += `\n    'x-filename': '${fileName}',`;
    if (ep.needs.meta) node += `\n    'x-meta': JSON.stringify(${metaStr}),`;
    node += `\n  },`;
    if (ep.group === "upload")
      node += `\n  body: require('node:fs').readFileSync('./${fileName}')`;
    node += `\n});\nconsole.log(res.status, await res.text());`;

    // Python
    let py = `# Python 3 + requests
import requests, json
base='${base}'
token='${tokLiteral}'
url='${url.replace(/'/g, "\\'")}'
headers={`;
    if (ep.group === "upload") py += `'Content-Type':'application/pdf',`;
    else py += `'Content-Type':'application/json',`;
    if (ep.needs.token) py += `'x-auth-token':token,`;
    if (ep.needs.xfilename) py += `'x-filename':'${fileName}',`;
    if (ep.needs.meta) py += `'x-meta': json.dumps(${metaStr}),`;
    py += `}
`;
    if (ep.group === "upload")
      py += `data=open('./${fileName}','rb').read()
`;
    else
      py += `data=None
`;
    py += `res=requests.request('${ep.method}', base+url, headers=headers, data=data)
print(res.status_code, res.text)`;

    curlCode.textContent = curl;
    httpieCode.textContent = httpie;
    nodeCode.textContent = node;
    pyCode.textContent = py;
  }

  function validateBasicsForRun() {
    const ep = ENDPOINTS[endpointSel.value];
    const base = (baseUrl.value || window.location.origin).replace(/\/$/, "");
    const headers = {};
    if (ep.group === "upload") headers["Content-Type"] = "application/pdf";
    else headers["Content-Type"] = "application/json";
    if (ep.needs.token) {
      if (!token.value)
        throw new Error("x-auth-token is required for this endpoint.");
      headers["x-auth-token"] = (token.value || "").trim();
    }
    let bodyPromise = null;
    let metaStr = "";
    if (ep.needs.xfilename) {
      const xf = (xFilename.value || "").trim();
      if (!xf) throw new Error("Fill in x-filename.");
      if (!/\.pdf$/i.test(xf))
        throw new Error("x-filename must end with '.pdf'.");
      headers["x-filename"] = xf;
    }
    if (ep.needs.meta) {
      metaStr = oneLineMeta();
      headers["x-meta"] = metaStr;
      const meta = JSON.parse(metaStr);
      const f = meta.formData || {};
      const missing = [];
      if (
        meta.planId === undefined ||
        meta.planId === null ||
        meta.planId === ""
      )
        missing.push("planId");
      ["section", "caption", "status", "effectiveDate"].forEach((k) => {
        if (!f[k] || String(f[k]).trim() === "") missing.push("formData." + k);
      });
      if (
        (f.caption || "").toLowerCase() === "other" &&
        (!f.captionOtherText || String(f.captionOtherText).trim() === "")
      ) {
        missing.push("formData.captionOtherText");
      }
      if (missing.length)
        throw new Error("Missing fields: " + missing.join(", "));
    }
    if (ep.group === "upload") {
      const file = pdfFile.files && pdfFile.files[0];
      if (ep.needs.pdf && !file) throw new Error("Select a PDF to test.");
      if (file) bodyPromise = file.arrayBuffer();
      const meta = metaStr ? JSON.parse(metaStr) : null;
      if (
        file &&
        meta &&
        /^document\s+missing$/i.test(meta.formData?.status || "")
      ) {
        throw new Error(
          "Status 'Document Missing' is not valid when a file is attached (422). Use 'Audit Ready'."
        );
      }
    }
    return { ep, base, headers, bodyPromise, metaStr };
  }

  function prettyResult(status, text) {
    let body = text;
    try {
      body = JSON.stringify(JSON.parse(text), null, 2);
    } catch {}
    runResult.textContent = `HTTP ${status}\n` + body;
  }

  function refreshAllOutputs() {
    const ep = ENDPOINTS[endpointSel.value];
    renderBadges();
    updateVisibility();
    // ensure caption options match current section
    populateCaptionsFromSection();
    // render meta/headers/snippets
    let metaStr = "";
    if (ep.needs.meta) metaStr = oneLineMeta();
    renderHeaders(metaStr);
    if (ep.needs.meta) {
      metaOut.value = metaStr;
      metaBlock.classList.remove("hidden");
    } else {
      metaOut.value = "";
      metaBlock.classList.add("hidden");
    }
    buildSnippets(metaStr);
  }

  // Polling helpers
  let polling = null;
  function cancelPolling() {
    if (polling) {
      clearInterval(polling);
      polling = null;
      cancelBtn.disabled = true;
    }
  }

  // Events
  endpointSel.addEventListener("change", () => {
    cancelPolling();
    refreshAllOutputs();
  });
  section.addEventListener("change", () => {
    populateCaptionsFromSection();
    refreshAllOutputs();
  });
  captionOtherText.addEventListener("input", refreshAllOutputs);
  status.addEventListener("change", refreshAllOutputs);
  [planId, effectiveDate, xFilename, jobId, token].forEach(
    (el) => el && el.addEventListener("input", refreshAllOutputs)
  );
  genBtn.addEventListener("click", (e) => {
    e.preventDefault();
    refreshAllOutputs();
  });

  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pre = document.querySelector(btn.getAttribute("data-copy"));
      navigator.clipboard
        .writeText(pre.textContent || "")
        .then(() => showToast());
    });
  });

  dryBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (endpointSel.value !== "sandbox-upload") {
      runResult.textContent = "Dry-Run applies to the sandbox-upload endpoint.";
      return;
    }
    try {
      const { base, headers, bodyPromise, metaStr } = validateBasicsForRun();
      renderHeaders(metaStr);
      buildSnippets(metaStr);
      if (metaStr) metaOut.value = metaStr;
      const body = bodyPromise ? await bodyPromise : new Uint8Array();
      const res = await fetch(base + "/forusbot/sandbox/vault-file-upload", {
        method: "POST",
        headers,
        body,
      });
      const txt = await res.text();
      prettyResult(res.status, txt);
    } catch (err) {
      runResult.textContent = "Error: " + (err.message || String(err));
    }
  });

  cancelBtn.addEventListener("click", cancelPolling);

  runBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    const ep = ENDPOINTS[endpointSel.value];
    try {
      const { base, headers, bodyPromise, metaStr } = validateBasicsForRun();
      renderHeaders(metaStr);
      buildSnippets(metaStr);
      if (metaStr) metaOut.value = metaStr;

      const url = ep.path.replace(":id", jobId.value || "");
      let body = undefined;
      if (bodyPromise) body = await bodyPromise;

      const res = await fetch(base + url, { method: ep.method, headers, body });
      const text = await res.text();
      prettyResult(res.status, text);

      if (ep.pollJob && res.status === 202) {
        let data = {};
        try {
          data = JSON.parse(text);
        } catch {}
        if (!data.jobId) return;
        cancelBtn.disabled = false;
        const renderState = (j) => {
          jobJson.textContent = JSON.stringify(j, null, 2);
          jobState.className = "status state-" + (j.state || "");
          jobState.querySelector(".txt").textContent = `${j.state || "-"} ${
            j.stage ? "— " + j.stage : ""
          }`;
        };
        const poll = async () => {
          try {
            const r = await fetch(base + "/forusbot/jobs/" + data.jobId, {
              headers: headers["x-auth-token"]
                ? { "x-auth-token": headers["x-auth-token"] }
                : {},
            });
            const j = await r.json();
            renderState(j);
            if (["SUCCEEDED", "FAILED", "CANCELED"].includes(j.state)) {
              cancelPolling();
            }
          } catch (e) {}
        };
        await poll();
        polling = setInterval(poll, 2500);
      } else {
        cancelPolling();
      }
    } catch (err) {
      runResult.textContent = "Error: " + (err.message || String(err));
    }
  });

  // Init
  renderBadges();
  updateVisibility();
  if (!section.value) section.value = "CONTRACTS & AGREEMENTS";
  populateCaptionsFromSection();
  updateFileNameUI();
  refreshAllOutputs();
})();

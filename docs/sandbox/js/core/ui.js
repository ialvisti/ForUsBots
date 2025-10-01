// docs/sandbox/js/core/ui.js
// UI helpers shared by sandbox
export function renderBadges(endpointSel, endpointBadges, ENDPOINTS) {
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

export function updateVisibility(
  endpointSel,
  metaBlock,
  dryBtn,
  jobArea,
  ENDPOINTS
) {
  const ep = ENDPOINTS[endpointSel.value];

  // Hide all groups, show current one
  document.querySelectorAll(".ep").forEach((el) => el.classList.add("hidden"));
  document
    .querySelectorAll(".ep-" + ep.group)
    .forEach((el) => el.classList.remove("hidden"));

  // x-meta block visibility
  metaBlock.classList.toggle("hidden", !ep.needs?.meta);

  // Dry button only for sandbox-upload
  if (dryBtn)
    dryBtn.classList.toggle("hidden", endpointSel.value !== "sandbox-upload");

  // Job area visible whenever endpoint implies polling (e.g., uploads or scrape)
  if (jobArea) jobArea.classList.toggle("hidden", !ep.pollJob);
}

// ---- Section -> Captions mapping
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
  "AUDIT DOCUMENTS": ["Election History", "Pay Data", "Cash Transfer", "Other"],
};

export function populateCaptionsFromSection(
  section,
  caption,
  otherWrap,
  preserve = true
) {
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

export function updateFileNameUI(pdfFile, fileNameEl) {
  const f = pdfFile.files && pdfFile.files[0];
  fileNameEl.textContent = f ? f.name : "No file selected.";
}

const ALLOWED_EXTS = new Set([".pdf", ".xlsx", ".csv", ".xls"]);
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
]);

const getExt = (name) => {
  const m = String(name || "")
    .trim()
    .match(/(\.[^.]+)$/);
  return m ? m[1].toLowerCase() : "";
};

export function setFile(f, pdfFile, xFilename, fileNameEl, runResult) {
  if (!f) return;

  const ext = getExt(f.name);
  const allowed = ALLOWED_MIMES.has(f.type) || ALLOWED_EXTS.has(ext);

  if (!allowed) {
    runResult.textContent =
      "Error: please drag/select a valid file (.pdf, .xlsx, .csv, .xls).";
    return;
  }

  const dt = new DataTransfer();
  dt.items.add(f);
  pdfFile.files = dt.files;

  updateFileNameUI(pdfFile, fileNameEl);

  // Autofill x-filename if empty
  if (!xFilename.value) xFilename.value = f.name;
}

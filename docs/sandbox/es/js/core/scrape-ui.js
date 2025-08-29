// docs/sandbox/js/core/scrape-ui.js
// UI builder + JSON body para /forusbot/scrape-participant
import { $ } from "./utils.js";

/** ====== Fuente de verdad del sandbox (sin endpoint de capacidades) ====== */
const AVAILABLE_MODULES = [
  {
    key: "census",
    label: "census",
    fields: {
      mode: "static",
      list: [
        "Partial SSN",
        "First Name",
        "Last Name",
        "Eligibility Status",
        "Crypto Enrollment",
        "Birth Date",
        "Hire Date",
        "Rehire Date",
        "Termination Date",
        "Projected Plan Entry Date",
        "Address 1",
        "Address 2",
        "City",
        "State",
        "Zip Code",
        "Primary Email",
        "Home Email",
        "Phone",
      ],
    },
  },
  {
    key: "savings_rate",
    label: "savings_rate",
    fields: {
      mode: "static",
      list: [
        "Current Pre-tax Percent",
        "Current Pre-tax Amount",
        "Current Roth Percent",
        "Current Roth Amount",
        "Record Keeper Site",
        "Employer Match Type",
        "Record Keeper",
        "Plan enrollment type",
        "Account Balance",
        "Account Balance As Of",
        "Employee Deferral Balance",
        "Roth Deferral Balance",
        "Rollover Balance",
        "Employer Match Balance",
        "Vested Balance",
        "Loan Balance",
        "YTD Employee contributions",
        "YTD Employer contributions",
        "Maxed out",
        "Auto escalation rate",
        "Auto escalation rate limit",
        "Auto escalation timing",
      ],
    },
  },
  {
    key: "loans",
    label: "loans",
    fields: {
      mode: "static",
      list: [
        "Participant Site",
        "Maximum Number of Loans",
        "Account Balance",
        "Account Balance As Of",
        "Loan History",
      ],
    },
  },
  {
    key: "plan_details",
    label: "plan_details",
    fields: {
      mode: "static",
      list: [
        "Plan Documents",
        "Plan Type",
        "Status",
        "Participant Site",
        "Plan enrollment type",
        "Auto Enrollment Rate",
        "Minimum Age",
        "Service Months",
        "Service hours",
        "Plan Entry Frequency",
        "Profit Sharing",
        "Force-out Limit",
        "Maximum Number of Loans",
      ],
    },
  },
  {
    key: "payroll",
    label: "payroll",
    fields: {
      mode: "mixed",
      static: ["Payroll Frequency", "Next Schedule paycheck"],
      // Input de years token: years:<all|YYYY[,YYYY...]>
      tokens: [{ name: "years", pattern: "years:<all|YYYY[,YYYY...]>" }],
      // Tablas concretas "Payroll YYYY"
      dynamic: { type: "yearTables", label: "Payroll YYYY" },
    },
  },
  // NEW: MFA (campo único)
  {
    key: "mfa",
    label: "mfa",
    fields: {
      mode: "static",
      list: ["MFA Status"],
    },
  },
];

/** ====== Elementos ====== */
const els = {
  participantId: null,
  strict: null,
  includeScreens: null,
  timeoutMs: null,
  returnMode: null,
  modulesList: null,
  addModuleBtn: null,
};
// callback global para disparar refresh desde controles dinámicos
let onChangeCb = null;

/** ====== Util ====== */
function optionEl(value, text, disabled = false, selected = false) {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = text;
  if (disabled) o.disabled = true;
  if (selected) o.selected = true;
  return o;
}
function currentModuleKeys() {
  return Array.from(document.querySelectorAll(".scrape-module-key")).map(
    (sel) => sel.value
  );
}

/** ====== Checkbox-Select (dropdown de checkboxes) ====== */
function makeChkSelect({ key, options = [] }) {
  const wrap = document.createElement("div");
  wrap.className = "chkselect";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "chkselect-btn";
  btn.textContent = "Select fields";

  const menu = document.createElement("div");
  menu.className = "chkselect-menu";

  options.forEach((f) => {
    const id = `chk_${key}_${f.replace(/\W+/g, "_")}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const line = document.createElement("label");
    line.className = "chkselect-item";
    line.innerHTML = `<input type="checkbox" value="${f}" id="${id}" /> <span>${f}</span>`;
    menu.appendChild(line);
  });

  const updateBtnText = () => {
    const n = menu.querySelectorAll('input[type="checkbox"]:checked').length;
    btn.textContent = n
      ? `${n} field${n > 1 ? "s" : ""} selected`
      : "Select fields";
  };

  // Eventos
  btn.addEventListener("click", () => {
    wrap.classList.toggle("open");
  });
  menu.addEventListener("change", () => {
    updateBtnText();
    onChangeCb?.(); // notificar cambios arriba
  });
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) wrap.classList.remove("open");
  });

  wrap.appendChild(btn);
  wrap.appendChild(menu);
  return wrap;
}

/** ====== Pintado de campos por módulo ====== */
function renderFieldsForModule(row, key) {
  const spec = AVAILABLE_MODULES.find((m) => m.key === key)?.fields || {
    mode: "none",
  };
  const fieldsBox = row.querySelector(".module-fields");
  fieldsBox.innerHTML = "";

  if (spec.mode === "none") {
    fieldsBox.innerHTML = `<div class="help">This module has no selectable fields. The extractor will return its default payload.</div>`;
    return;
  }

  // --- STATIC: dropdown de checkboxes ---
  const staticList = spec.list || spec.static;
  if (Array.isArray(staticList) && staticList.length) {
    const group = document.createElement("div");
    group.className = "field";
    const title = document.createElement("label");
    title.textContent = "Fields";
    group.appendChild(title);

    const chooser = makeChkSelect({ key, options: staticList });
    group.appendChild(chooser);
    fieldsBox.appendChild(group);
  }

  // --- YEARS TOKEN (siempre visible para payroll) ---
  if (key === "payroll" && spec.tokens?.some((t) => t.name === "years")) {
    const tokenWrap = document.createElement("div");
    tokenWrap.className = "field years-token-wrap";
    tokenWrap.innerHTML = `
      <br>
      <label>Years</label>
      <input type="text" class="years-token" placeholder="all  ·  or  ·  2024,2025" />
      <div class="help">You can pick all using "<code>all</code>" or specific years using <code>2024,2025</code>.</div>
    `;
    fieldsBox.appendChild(tokenWrap);
    const yi = tokenWrap.querySelector(".years-token");
    ["input", "change"].forEach((ev) =>
      yi.addEventListener(ev, () => onChangeCb?.())
    );
  }
}

/** ====== Construcción de filas ====== */
function buildRow({ key, removable }) {
  const wrap = document.createElement("div");
  wrap.className = "module-row";

  // Controls: select + remove
  const controls = document.createElement("div");
  controls.className = "module-row-controls";

  const fieldLeft = document.createElement("div");
  fieldLeft.className = "field";
  fieldLeft.innerHTML = `<label>module</label><select class="scrape-module-key"></select>`;
  controls.appendChild(fieldLeft);

  const actions = document.createElement("div");
  actions.className = "module-row-actions";
  const removeBtn = document.createElement("button");
  removeBtn.className = "btn ghost small remove-module";
  removeBtn.textContent = "Remove";
  removeBtn.disabled = !removable;
  actions.appendChild(removeBtn);
  controls.appendChild(actions);

  const fieldsBox = document.createElement("div");
  fieldsBox.className = "module-fields";

  wrap.appendChild(controls);
  wrap.appendChild(fieldsBox);
  return wrap;
}

function repopulateSelectOptions() {
  const used = new Set(currentModuleKeys());
  const selects = Array.from(document.querySelectorAll(".scrape-module-key"));

  selects.forEach((sel) => {
    const current = sel.value;
    sel.innerHTML = "";
    AVAILABLE_MODULES.forEach((m) => {
      const disabled = used.has(m.key) && m.key !== current;
      sel.appendChild(optionEl(m.key, m.label, disabled, m.key === current));
    });
  });

  const addBtn = $("#addModuleBtn");
  if (addBtn) addBtn.disabled = used.size >= AVAILABLE_MODULES.length;
}

function addModuleRow({ key, removable, onChange }) {
  const row = buildRow({ key, removable });
  els.modulesList.appendChild(row);

  const sel = row.querySelector(".scrape-module-key");
  repopulateSelectOptions();
  if (!sel.value) sel.value = key;

  renderFieldsForModule(row, sel.value);

  sel.addEventListener("change", () => {
    renderFieldsForModule(row, sel.value);
    repopulateSelectOptions();
    onChange?.();
  });
  row.addEventListener("input", () => onChange?.());
  row.addEventListener("change", () => onChange?.());
  row.querySelector(".remove-module")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (row.parentElement.children[0] === row) return; // never remove first
    row.remove();
    repopulateSelectOptions();
    onChange?.();
  });

  repopulateSelectOptions();
  return row;
}

/** ====== API ====== */
export function wireScrapeUI(arg) {
  const onChange = typeof arg === "function" ? arg : arg?.onChange;
  onChangeCb = onChange;
  const strictDefault = (arg && arg.strictDefault) ?? true;
  const hideTimeout = (arg && arg.hideTimeout) ?? true;

  els.participantId = $("#participantId");
  els.strict = $("#strict");
  els.includeScreens = $("#includeScreens");
  els.timeoutMs = $("#timeoutMs");
  els.returnMode = $("#returnMode");
  els.modulesList = $("#modulesList");
  els.addModuleBtn = $("#addModuleBtn");

  // Defaults
  if (els.strict) els.strict.checked = !!strictDefault;
  if (hideTimeout && els.timeoutMs) {
    const field = els.timeoutMs.closest(".field");
    if (field) field.classList.add("hidden");
  }

  // Fila por defecto (no removable)
  els.modulesList.innerHTML = "";
  addModuleRow({ key: "census", removable: false, onChange });

  // Botón "Add module"
  if (els.addModuleBtn) {
    els.addModuleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const used = new Set(currentModuleKeys());
      const next = AVAILABLE_MODULES.find((m) => !used.has(m.key));
      if (!next) return;
      addModuleRow({ key: next.key, removable: true, onChange });
      onChange?.();
    });
  }

  // Top-level change handlers
  ["input", "change"].forEach((ev) => {
    [els.participantId, els.strict, els.includeScreens, els.returnMode]
      .filter(Boolean)
      .forEach((el) => el.addEventListener(ev, () => onChange?.()));
  });
}

export function getScrapeBody() {
  const participantId = (els.participantId?.value || "").trim();

  const modules = [];
  Array.from(els.modulesList.querySelectorAll(".module-row")).forEach((row) => {
    const key = row.querySelector(".scrape-module-key")?.value;
    if (!key) return;

    const fields = new Set();

    // 1) static / mixed: checkboxes dentro del checkbox-select
    row
      .querySelectorAll(".chkselect-menu input[type='checkbox']:checked")
      .forEach((chk) => fields.add(chk.value));

    // 2) tokens: years (si hay algo escrito, se añade years:<...>)
    const yearsTokenInput = row.querySelector(".years-token");
    if (yearsTokenInput) {
      const raw = (yearsTokenInput.value || "").trim().toLowerCase();
      if (raw) {
        const tok = raw.startsWith("years:") ? raw : `years:${raw}`;
        fields.add(tok);
      }
    }

    // 3) dynamic: Payroll YYYY
    const yearTables = (row.querySelector(".year-tables")?.value || "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d{4}$/.test(s));
    yearTables.forEach((y) => fields.add(`Payroll ${y}`));

    const entry =
      fields.size > 0 ? { key, fields: Array.from(fields) } : { key };
    modules.push(entry);
  });

  const body = {
    participantId,
    modules: modules.length ? modules : undefined,
    strict: els.strict ? !!els.strict.checked : true, // default ON
    includeScreens: els.includeScreens
      ? !!els.includeScreens.checked
      : undefined,
    // timeoutMs omitido del sandbox
    return: (els.returnMode?.value || "").trim() || undefined,
  };

  Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);
  return body;
}

export function buildScrapeBodyStr(pretty = false) {
  const body = getScrapeBody();
  return JSON.stringify(body, null, pretty ? 2 : 0);
}

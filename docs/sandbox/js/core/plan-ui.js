// docs/sandbox/js/core/plan-ui.js
// UI builder + JSON body para /forusbot/scrape-plan
import { $ } from "./utils.js";

/** ====== Plan Modules (source of truth for sandbox) ====== */
const PLAN_MODULES = [
  {
    key: "basic_info",
    label: "basic_info",
    description: "Plan ID, company name, EIN, status, dates (16 fields)",
    fields: {
      mode: "static",
      list: [
        "plan_id",
        "version_id",
        "symlink",
        "sfdc_id",
        "company_name",
        "official_plan_name",
        "rm_id",
        "im_id",
        "service_type",
        "plan_type",
        "active",
        "status",
        "status_as_of",
        "is_3_16_only",
        "ein",
        "effective_date",
      ],
    },
  },
  {
    key: "plan_design",
    label: "plan_design",
    description: "Record keeper, eligibility, contributions, enrollment (26 fields)",
    fields: {
      mode: "static",
      list: [
        "record_keeper_id",
        "rk_plan_id",
        "external_name",
        "lt_plan_type",
        "accept_covid19_amendment",
        "fund_lineup_id",
        "enrollment_type",
        "eligibility_min_age",
        "eligibility_duration_value",
        "eligibility_duration_unit",
        "eligibility_hours_requirement",
        "plan_entry_frequency",
        "plan_entry_frequency_first_month",
        "plan_entry_frequency_second_month",
        "employer_contribution",
        "er_contribution_monthly_cap",
        "employer_contribution_cap",
        "employer_contribution_timing",
        "employer_contribution_options_qaca",
        "default_savings_rate",
        "contribution_type",
        "autoescalate_rate",
        "support_aftertax",
        "alts_crypto",
        "alts_waitlist_crypto",
        "max_crypto_percent_balance",
      ],
    },
  },
  {
    key: "onboarding",
    label: "onboarding",
    description: "First deferral date, blackout dates, enrollment method (6 fields)",
    fields: {
      mode: "static",
      list: [
        "first_deferral_date",
        "special_participation_date",
        "enrollment_method",
        "blackout_begins_date",
        "blackout_ends_date",
        "website_live_date",
      ],
    },
  },
  {
    key: "communications",
    label: "communications",
    description: "DAVE text, logo, Spanish participants, e-statement (6 fields)",
    fields: {
      mode: "static",
      list: [
        "dave_text",
        "logo",
        "spanish_participants",
        "e_statement",
        "raffle_prize",
        "raffle_date",
      ],
    },
  },
  {
    key: "extra_settings",
    label: "extra_settings",
    description: "RK upload mode, plan year, ER match eligibility (10 fields)",
    fields: {
      mode: "static",
      list: [
        "rk_upload_mode",
        "plan_year_start",
        "er_contribution_eligibility",
        "er_match_eligibility_age",
        "er_match_eligibility_duration_value",
        "er_match_eligibility_duration_unit",
        "er_match_eligibility_hours_requirement",
        "er_match_plan_entry_frequency",
        "er_match_plan_entry_frequency_first_month",
        "er_match_plan_entry_frequency_second_month",
      ],
    },
  },
  {
    key: "feature_flags",
    label: "feature_flags",
    description: "Payroll X-Ray, payroll issue, simple upload (3 fields)",
    fields: {
      mode: "static",
      list: [
        "payroll_xray",
        "payroll_issue",
        "simple_upload",
      ],
    },
  },
];

/** ====== Elements ====== */
const els = {
  planId: null,
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
  return Array.from(document.querySelectorAll(".plan-module-key")).map(
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
  const spec = PLAN_MODULES.find((m) => m.key === key)?.fields || {
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
  fieldLeft.innerHTML = `<label>module</label><select class="plan-module-key"></select>`;
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
  const selects = Array.from(document.querySelectorAll(".plan-module-key"));

  selects.forEach((sel) => {
    const current = sel.value;
    sel.innerHTML = "";
    PLAN_MODULES.forEach((m) => {
      const disabled = used.has(m.key) && m.key !== current;
      sel.appendChild(optionEl(m.key, m.label, disabled, m.key === current));
    });
  });

  const addBtn = $("#addPlanModuleBtn");
  if (addBtn) addBtn.disabled = used.size >= PLAN_MODULES.length;
}

function addModuleRow({ key, removable, onChange }) {
  const row = buildRow({ key, removable });
  els.modulesList.appendChild(row);

  const sel = row.querySelector(".plan-module-key");
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
export function wirePlanUI(arg) {
  const onChange = typeof arg === "function" ? arg : arg?.onChange;
  onChangeCb = onChange;
  const strictDefault = (arg && arg.strictDefault) ?? false; // plan defaults to false
  const hideTimeout = (arg && arg.hideTimeout) ?? true;

  els.planId = $("#scrapePlanId");
  els.strict = $("#planStrict");
  els.includeScreens = $("#planIncludeScreens");
  els.timeoutMs = $("#planTimeoutMs");
  els.returnMode = $("#planReturnMode");
  els.modulesList = $("#planModulesList");
  els.addModuleBtn = $("#addPlanModuleBtn");

  // Defaults
  if (els.strict) els.strict.checked = !!strictDefault;
  if (hideTimeout && els.timeoutMs) {
    const field = els.timeoutMs.closest(".field");
    if (field) field.classList.add("hidden");
  }

  // Fila por defecto (no removable)
  els.modulesList.innerHTML = "";
  addModuleRow({ key: "basic_info", removable: false, onChange });

  // Botón "Add module"
  if (els.addModuleBtn) {
    els.addModuleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const used = new Set(currentModuleKeys());
      const next = PLAN_MODULES.find((m) => !used.has(m.key));
      if (!next) return;
      addModuleRow({ key: next.key, removable: true, onChange });
      onChange?.();
    });
  }

  // Top-level change handlers
  ["input", "change"].forEach((ev) => {
    [els.planId, els.strict, els.includeScreens, els.returnMode]
      .filter(Boolean)
      .forEach((el) => el.addEventListener(ev, () => onChange?.()));
  });
}

export function getPlanBody() {
  const planId = (els.planId?.value || "").trim();

  const modules = [];
  Array.from(els.modulesList.querySelectorAll(".module-row")).forEach((row) => {
    const key = row.querySelector(".plan-module-key")?.value;
    if (!key) return;

    const fields = new Set();

    // static: checkboxes dentro del checkbox-select
    row
      .querySelectorAll(".chkselect-menu input[type='checkbox']:checked")
      .forEach((chk) => fields.add(chk.value));

    const entry =
      fields.size > 0 ? { key, fields: Array.from(fields) } : key;
    modules.push(entry);
  });

  const body = {
    planId,
    modules: modules.length ? modules : undefined,
    strict: els.strict ? !!els.strict.checked : false, // default OFF for plans
    includeScreens: els.includeScreens
      ? !!els.includeScreens.checked
      : undefined,
    // timeoutMs omitido del sandbox
    return: (els.returnMode?.value || "").trim() || undefined,
  };

  Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);
  return body;
}

export function buildPlanBodyStr(pretty = false) {
  const body = getPlanBody();
  return JSON.stringify(body, null, pretty ? 2 : 0);
}


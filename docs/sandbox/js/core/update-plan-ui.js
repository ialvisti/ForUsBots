// docs/sandbox/js/core/update-plan-ui.js
// UI + JSON body for POST /forusbot/update-plan and /forusbot/sandbox/update-plan.
// Fields are selected from a dropdown. Users don't type field names manually.

import { $ } from "./utils.js";

const FIELD_SPECS = [
  // Basic Info
  { name: "company_name", label: "Company Name", group: "Basic Info", type: "text" },
  { name: "official_plan_name", label: "Official Plan Name", group: "Basic Info", type: "text" },
  { name: "external_name", label: "External Name", group: "Basic Info", type: "text" },
  { name: "ein", label: "EIN", group: "Basic Info", type: "text" },
  { name: "symlink", label: "Symlink", group: "Basic Info", type: "text" },
  { name: "logo", label: "Logo URL", group: "Basic Info", type: "text" },
  { name: "rk_plan_id", label: "RK Plan ID", group: "Basic Info", type: "text" },

  // Administration
  { name: "rm_id", label: "Relationship Manager", group: "Administration", type: "text" },
  { name: "im_id", label: "Implementation Manager", group: "Administration", type: "text" },
  { name: "version_id", label: "Version ID", group: "Administration", type: "text" },

  // Status
  { name: "active", label: "Active", group: "Status", type: "checkbox", options: [
    { value: "true", label: "True" },
    { value: "false", label: "False" }
  ]},
  { name: "status", label: "Status", group: "Status", type: "select", options: [
    { value: "short_psa", label: "NCE" },
    { value: "extended_psa", label: "Implementation" },
    { value: "actively_managed", label: "Ongoing" },
    { value: "pending_termination", label: "Pending Termination" },
    { value: "terminated", label: "Terminated" }
  ]},
  { name: "effective_date", label: "Effective Date", group: "Status", type: "date" },
  { name: "status_as_of", label: "Status As Of", group: "Status", type: "date" },

  // Plan Design
  { name: "plan_type", label: "Plan Type", group: "Plan Design", type: "select", options: [
    { value: "conversion", label: "Conversion" },
    { value: "start_up", label: "Startup" }
  ]},
  { name: "service_type", label: "Service Type", group: "Plan Design", type: "select", options: [
    { value: "0", label: "Free" },
    { value: "10", label: "Full" }
  ]},
  { name: "lt_plan_type", label: "LT Plan Type", group: "Plan Design", type: "select", options: [
    { value: "mep", label: "MEP" },
    { value: "standalone", label: "Standalone" }
  ]},
  { name: "record_keeper_id", label: "Record Keeper", group: "Plan Design", type: "select", options: [
    { value: "1", label: "The Payroll Company" },
    { value: "3", label: "ACME" },
    { value: "4", label: "Fidelity" },
    { value: "7", label: "Empower" },
    { value: "2", label: "LT Trust" },
    { value: "54", label: "LT Trust (non-FUA)" },
    { value: "48", label: "Zahn Financial Services Inc." },
    { value: "9", label: "AXA" },
    { value: "46", label: "T. Rowe Price" },
    { value: "55", label: "Equitable" },
    { value: "26", label: "Securian" },
    { value: "17", label: "PAi" },
    { value: "6", label: "Ascensus" },
    { value: "10", label: "Transamerica" },
    { value: "29", label: "Pension Dynamics" },
    { value: "11", label: "Ubiquity" },
    { value: "21", label: "CUNA Mutual" },
    { value: "16", label: "ADP" },
    { value: "13", label: "John Hancock" },
    { value: "18", label: "BPAS" },
    { value: "19", label: "American Funds" },
    { value: "30", label: "Lincoln Financial" },
    { value: "8", label: "Schwab" },
    { value: "31", label: "Mutual of America" },
    { value: "27", label: "Mutual of Omaha" },
    { value: "15", label: "Nationwide" },
    { value: "22", label: "Newport" },
    { value: "20", label: "TD Ameritrade" },
    { value: "33", label: "The Standard" },
    { value: "12", label: "TIAA" },
    { value: "32", label: "Valic" },
    { value: "23", label: "Principal" },
    { value: "5", label: "Paychex" },
    { value: "25", label: "Pension Corporation of America" },
    { value: "34", label: "Milliman" },
    { value: "47", label: "Correll" },
    { value: "36", label: "Sentry" },
    { value: "37", label: "Fifth Third Bank" },
    { value: "35", label: "Voya for Engineered Profiles" },
    { value: "58", label: "Slavic" },
    { value: "49", label: "Guideline" },
    { value: "50", label: "Sentinel Benefits" },
    { value: "51", label: "FinDec" },
    { value: "52", label: "Human Interest" },
    { value: "53", label: "Millennium Pension Services" },
    { value: "42", label: "Voya for MDSI" },
    { value: "38", label: "Employee Fiduciary" },
    { value: "39", label: "Wells Fargo" },
    { value: "40", label: "Tester" },
    { value: "41", label: "Freedom One" },
    { value: "14", label: "Vanguard" },
    { value: "57", label: "Epic" },
    { value: "43", label: "Pensys, Inc" },
    { value: "44", label: "Johnson Financial Group" },
    { value: "45", label: "Ameritas" },
    { value: "59", label: "BlueStar" },
    { value: "28", label: "Empower Retirement" },
    { value: "24", label: "Voya" },
    { value: "60", label: "Vestwell" },
    { value: "61", label: "Betterment" },
    { value: "56", label: "Voya for PTS Group" }
  ]},
  { name: "enrollment_type", label: "Enrollment Type", group: "Plan Design", type: "select", options: [
    { value: "opt_in_for_all", label: "Opt in for all" },
    { value: "opt_out_for_all", label: "Opt out for all" },
    { value: "opt_out_new_hires_only", label: "Opt out for new hires only" }
  ]},
  { name: "contribution_type", label: "Contribution Type", group: "Plan Design", type: "select", options: [
    { value: "0", label: "Both dollar & percent" },
    { value: "1", label: "Dollar only" },
    { value: "2", label: "Percent only" }
  ]},
  { name: "roth_contributions_allowed", label: "Roth Contributions Allowed", group: "Plan Design", type: "checkbox", options: [
    { value: "true", label: "Yes" },
    { value: "false", label: "No" }
  ]},
  { name: "profit_sharing", label: "Profit Sharing", group: "Plan Design", type: "checkbox", options: [
    { value: "true", label: "Yes" },
    { value: "false", label: "No" }
  ]},
  { name: "e_statement", label: "E-Statement", group: "Plan Design", type: "checkbox", options: [
    { value: "true", label: "Yes" },
    { value: "false", label: "No" }
  ]},
  { name: "spanish_participants", label: "Spanish Participants", group: "Plan Design", type: "checkbox", options: [
    { value: "true", label: "Yes" },
    { value: "false", label: "No" }
  ]},
  { name: "eaca", label: "EACA", group: "Plan Design", type: "checkbox", options: [
    { value: "true", label: "True" },
    { value: "false", label: "False" }
  ]},
  { name: "is_3_16_only", label: "3(16) Standalone Only", group: "Plan Design", type: "checkbox", options: [
    { value: "true", label: "Yes" },
    { value: "false", label: "No" }
  ]},
  { name: "is_critical", label: "Is Critical", group: "Plan Design", type: "checkbox", options: [
    { value: "true", label: "Yes" },
    { value: "false", label: "No" }
  ]},
  { name: "roth_match_allowed", label: "Roth Match Allowed", group: "Plan Design", type: "checkbox", options: [
    { value: "true", label: "Yes" },
    { value: "false", label: "No" }
  ]},
  { name: "fund_lineup_id", label: "Fund Lineup ID", group: "Plan Design", type: "text" },
  { name: "rk_upload_mode", label: "RK Upload Mode", group: "Plan Design", type: "select", options: [
    { value: "legacy", label: "Legacy" },
    { value: "rk2", label: "RK2" }
  ]},
  { name: "enrollment_method", label: "Enrollment Method", group: "Plan Design", type: "select", options: [
    { value: "default", label: "Default rate" },
    { value: "higher_default_or_current", label: "Default or current rate if higher" },
    { value: "current", label: "Current rates" }
  ]},

  // Eligibility
  { name: "eligibility_min_age", label: "Eligibility Min Age", group: "Eligibility", type: "text" },
  { name: "eligibility_hours_requirement", label: "Eligibility Hours Requirement", group: "Eligibility", type: "text" },
  { name: "eligibility_duration_value", label: "Eligibility Duration (months)", group: "Eligibility", type: "text" },
  { name: "plan_entry_frequency", label: "Plan Entry Frequency", group: "Eligibility", type: "select", options: [
    { value: "i", label: "Immediate" },
    { value: "m", label: "Monthly" },
    { value: "q", label: "Quarterly" },
    { value: "sa", label: "Semi-annually" },
    { value: "a", label: "Annually" }
  ]},
  { name: "plan_entry_frequency_first_month", label: "Plan Entry Frequency (First Month)", group: "Eligibility", type: "select", options: [
    { value: "1", label: "January" },
    { value: "2", label: "February" },
    { value: "3", label: "March" },
    { value: "4", label: "April" },
    { value: "5", label: "May" },
    { value: "6", label: "June" },
    { value: "7", label: "July" },
    { value: "8", label: "August" },
    { value: "9", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" }
  ]},
  { name: "plan_entry_frequency_second_month", label: "Plan Entry Frequency (Second Month)", group: "Eligibility", type: "select", options: [
    { value: "1", label: "January" },
    { value: "2", label: "February" },
    { value: "3", label: "March" },
    { value: "4", label: "April" },
    { value: "5", label: "May" },
    { value: "6", label: "June" },
    { value: "7", label: "July" },
    { value: "8", label: "August" },
    { value: "9", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" }
  ]},
  { name: "weekly_assumed_hours", label: "Weekly Assumed Hours", group: "Eligibility", type: "text" },
  { name: "force_out_limit", label: "Force Out Limit", group: "Eligibility", type: "text" },
  { name: "loan_number_cap", label: "Loan Number Cap", group: "Eligibility", type: "text" },
  { name: "max_crypto_percent_balance", label: "Max Crypto Percent Balance", group: "Eligibility", type: "text" },

  // Employer Match
  { name: "employer_contribution", label: "Employer Contribution", group: "Employer Match", type: "select", options: [
    { value: "No employer contribution", label: "No Employer Contribution" },
    { value: "SH Match Traditional", label: "SH Match Traditional" },
    { value: "SH Match Other", label: "SH Match Other" },
    { value: "Non-SH match", label: "Non-SH Match" },
    { value: "SH 3% Non-elective", label: "SH 3% Non-elective" },
    { value: "SH Non-elective Other", label: "SH Non-elective Other" }
  ]},
  { name: "employer_contribution_formula", label: "Employer Contribution Formula", group: "Employer Match", type: "tiers" },
  { name: "employer_contribution_cap", label: "Employer Contribution Cap (%)", group: "Employer Match", type: "text" },
  { name: "er_contribution_monthly_cap", label: "ER Monthly Cap ($)", group: "Employer Match", type: "text" },
  { name: "employer_contribution_timing", label: "Employer Contribution Timing", group: "Employer Match", type: "select", options: [
    { value: "ongoing", label: "Ongoing" },
    { value: "year end", label: "Year-end" },
    { value: "quarterly", label: "Quarterly" }
  ]},

  // Savings & Auto-Escalation
  { name: "default_savings_rate", label: "Default Savings Rate (%)", group: "Savings & Auto-Escalation", type: "text" },
  { name: "max_deferral_rate", label: "Max Deferral Rate (%)", group: "Savings & Auto-Escalation", type: "text" },
  { name: "autoescalate_rate", label: "Auto-Escalation Rate (%)", group: "Savings & Auto-Escalation", type: "text" },
  { name: "autoescalation_limit", label: "Auto-Escalation Limit (%)", group: "Savings & Auto-Escalation", type: "text" },
  { name: "autoescalation_source", label: "Auto-Escalation Source", group: "Savings & Auto-Escalation", type: "select", options: [
    { value: "t+r", label: "Pre-tax + Roth" },
    { value: "t", label: "Pre-tax only" }
  ]},
  { name: "autoescalation_timing", label: "Auto-Escalation Timing", group: "Savings & Auto-Escalation", type: "select", options: [
    { value: "1", label: "January" },
    { value: "2", label: "February" },
    { value: "3", label: "March" },
    { value: "4", label: "April" },
    { value: "5", label: "May" },
    { value: "6", label: "June" },
    { value: "7", label: "July" },
    { value: "8", label: "August" },
    { value: "9", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" }
  ]},

  // Key Dates
  { name: "first_deferral_date", label: "First Deferral Date", group: "Key Dates", type: "date" },
  { name: "special_participation_date", label: "Special Participation Date", group: "Key Dates", type: "date" },
  { name: "blackout_begins_date", label: "Blackout Begins Date", group: "Key Dates", type: "date" },
  { name: "blackout_ends_date", label: "Blackout Ends Date", group: "Key Dates", type: "date" },
  { name: "website_live_date", label: "Website Live Date", group: "Key Dates", type: "date" },
  { name: "enrollment_window_begins", label: "Enrollment Window Begins", group: "Key Dates", type: "date" },
  { name: "enrollment_window_ends", label: "Enrollment Window Ends", group: "Key Dates", type: "date" },
  { name: "reenrollment_date", label: "Reenrollment Date", group: "Key Dates", type: "date" },

  // Compliance / Features
  { name: "accept_covid19_amendment", label: "Accept COVID-19 Amendment", group: "Compliance / Features", type: "checkbox", options: [
    { value: "true", label: "Yes" },
    { value: "false", label: "No" }
  ]},
  { name: "support_aftertax", label: "Support After-Tax", group: "Compliance / Features", type: "checkbox", options: [
    { value: "true", label: "Yes" },
    { value: "false", label: "No" }
  ]},
  { name: "alts_crypto", label: "Alts Crypto", group: "Compliance / Features", type: "checkbox", options: [
    { value: "true", label: "Yes" },
    { value: "false", label: "No" }
  ]},
  { name: "alts_waitlist_crypto", label: "Alts Waitlist Crypto", group: "Compliance / Features", type: "checkbox", options: [
    { value: "true", label: "Yes" },
    { value: "false", label: "No" }
  ]},

  // Audit & Organization
  { name: "audit_year", label: "Audit Year", group: "Audit & Organization", type: "select", options: [
    { value: "2016", label: "2016" },
    { value: "2017", label: "2017" },
    { value: "2018", label: "2018" },
    { value: "2019", label: "2019" },
    { value: "2020", label: "2020" },
    { value: "2021", label: "2021" },
    { value: "2022", label: "2022" },
    { value: "2023", label: "2023" },
    { value: "2024", label: "2024" },
    { value: "2025", label: "2025" },
    { value: "2026", label: "2026" }
  ]},
  { name: "organization_type", label: "Organization Type", group: "Audit & Organization", type: "select", options: [
    { value: "c-corp", label: "C-Corp" },
    { value: "llc", label: "LLC" },
    { value: "partnership", label: "Partnership" },
    { value: "s-corp", label: "S-Corp" },
    { value: "sole proprieter", label: "Sole Proprieter" },
    { value: "not for profit", label: "Not for profit" }
  ]},

  // Marketing & Events
  { name: "raffle_prize", label: "Raffle Prize", group: "Marketing & Events", type: "text" },
  { name: "raffle_date", label: "Raffle Date", group: "Marketing & Events", type: "date" },
];

function optionEl(value, text, { disabled = false, selected = false } = {}) {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = text;
  if (disabled) o.disabled = true;
  if (selected) o.selected = true;
  return o;
}

function usedNames(exceptRow = null) {
  const set = new Set();
  document.querySelectorAll(".upl-row").forEach((row) => {
    if (row === exceptRow) return;
    const sel = row.querySelector(".upl-label");
    const v = sel?.value?.trim();
    if (v) set.add(v);
  });
  return set;
}

function buildValueInput(spec) {
  const box = document.createElement("div");
  box.className = "upl-value";

  switch (spec.type) {
    case "checkbox": {
      const sel = document.createElement("select");
      sel.className = "upl-input";
      (spec.options || []).forEach((opt) => sel.appendChild(optionEl(opt.value, opt.label)));
      box.appendChild(sel);
      break;
    }
    case "select": {
      const sel = document.createElement("select");
      sel.className = "upl-input";
      sel.appendChild(optionEl("", "(choose a value)"));
      (spec.options || []).forEach((opt) => sel.appendChild(optionEl(opt.value, opt.label)));
      box.appendChild(sel);
      break;
    }
    case "date": {
      const i = document.createElement("input");
      i.type = "date";
      i.placeholder = "yyyy-mm-dd";
      i.className = "upl-input";
      box.appendChild(i);
      const help = document.createElement("div");
      help.className = "help";
      help.innerHTML = 'Leaving it empty sends <code>""</code> to clear the current date.';
      box.appendChild(help);
      break;
    }
    case "tiers": {
      const ta = document.createElement("textarea");
      ta.className = "upl-input";
      ta.rows = 3;
      ta.placeholder = '[{"match_value": 100, "percent_pay": 100}, {"match_value": 200, "percent_pay": 50}]';
      box.appendChild(ta);
      const help = document.createElement("div");
      help.className = "help";
      help.innerHTML = 'Paste a JSON array of <code>{match_value, percent_pay}</code> objects.';
      box.appendChild(help);
      break;
    }
    default: {
      const i = document.createElement("input");
      i.type = "text";
      i.className = "upl-input";
      box.appendChild(i);
    }
  }

  return box;
}

function renderRowValueUI(row, name) {
  const spec = FIELD_SPECS.find((f) => f.name === name) || {
    type: "text",
    name,
  };
  const holder = row.querySelector(".upl-value-wrap");
  holder.innerHTML = "";
  holder.appendChild(buildValueInput(spec));
}

function repopulateLabelSelects() {
  const rows = Array.from(document.querySelectorAll(".upl-row"));
  const groups = {};
  FIELD_SPECS.forEach((f) => {
    if (!groups[f.group]) groups[f.group] = [];
    groups[f.group].push(f);
  });

  rows.forEach((row) => {
    const sel = row.querySelector(".upl-label");
    const current = sel.value;
    const used = usedNames(row);

    sel.innerHTML = "";
    sel.appendChild(optionEl("", "(choose a field)"));
    Object.keys(groups)
      .sort()
      .forEach((groupName) => {
        const optgroup = document.createElement("optgroup");
        optgroup.label = groupName;
        groups[groupName].forEach((f) => {
          const disabled = used.has(f.name);
          optgroup.appendChild(
            optionEl(f.name, f.label, {
              disabled,
              selected: f.name === current,
            })
          );
        });
        sel.appendChild(optgroup);
      });
  });

  const addBtn = $("#uplAddRow");
  if (addBtn) {
    const usedCount = usedNames(null).size;
    addBtn.disabled = usedCount >= FIELD_SPECS.length;
  }
}

function addRow({ onChange } = {}) {
  const row = document.createElement("div");
  row.className = "module-row upl-row";

  const controls = document.createElement("div");
  controls.className = "module-row-controls";

  const fieldLeft = document.createElement("div");
  fieldLeft.className = "field";
  fieldLeft.innerHTML =
    '<label>field</label><select class="upl-label"></select>';
  controls.appendChild(fieldLeft);

  const actions = document.createElement("div");
  actions.className = "module-row-actions";
  const removeBtn = document.createElement("button");
  removeBtn.className = "btn ghost small";
  removeBtn.textContent = "Remove";
  actions.appendChild(removeBtn);
  controls.appendChild(actions);

  const fields = document.createElement("div");
  fields.className = "module-fields";
  const valueWrap = document.createElement("div");
  valueWrap.className = "upl-value-wrap";
  fields.appendChild(valueWrap);

  row.appendChild(controls);
  row.appendChild(fields);

  $("#uplRows").appendChild(row);

  repopulateLabelSelects();
  const sel = row.querySelector(".upl-label");
  sel.addEventListener("change", () => {
    renderRowValueUI(row, sel.value);
    repopulateLabelSelects();
    onChange?.();
  });

  removeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    row.remove();
    repopulateLabelSelects();
    onChange?.();
  });

  row.addEventListener("input", () => onChange?.());
  row.addEventListener("change", () => onChange?.());

  return row;
}

export function wireUpdatePlanUI({ onChange } = {}) {
  const rows = $("#uplRows");
  const addBtn = $("#uplAddRow");

  if (!rows) return;

  rows.innerHTML = "";
  addRow({ onChange });

  if (addBtn) {
    addBtn.addEventListener("click", (e) => {
      e.preventDefault();
      addRow({ onChange });
      onChange?.();
    });
  }

  const pid = $("#uplPlanId");
  const note = $("#uplNote");
  const includeScreens = $("#uplIncludeScreens");
  const timeoutMs = $("#uplTimeoutMs");

  ["input", "change"].forEach((ev) => {
    [pid, note, includeScreens, timeoutMs].forEach((el) => el?.addEventListener(ev, () => onChange?.()));
  });
}

export function buildUpdatePlanBodyStr(pretty = false) {
  const planId = ($("#uplPlanId")?.value || "").trim();
  const note = ($("#uplNote")?.value || "").trim();
  const includeScreens = $("#uplIncludeScreens")?.checked;
  const timeoutMs = ($("#uplTimeoutMs")?.value || "").trim();

  const updates = {};
  document.querySelectorAll(".upl-row").forEach((row) => {
    const name = row.querySelector(".upl-label")?.value || "";
    if (!name) return;
    const input = row.querySelector(".upl-input");
    if (!input) return;

    let v = "";
    if (input.tagName === "SELECT") {
      v = input.value || "";
    } else if (input.tagName === "TEXTAREA") {
      const raw = (input.value || "").trim();
      if (!raw) {
        v = [];
      } else {
        try {
          v = JSON.parse(raw);
        } catch {
          v = raw;
        }
      }
    } else {
      v = String(input.value ?? "");
    }
    updates[name] = v;
  });

  const body = { planId, note, updates };
  if (includeScreens) body.includeScreens = true;
  if (timeoutMs) {
    const ms = parseInt(timeoutMs, 10);
    if (Number.isFinite(ms)) body.timeoutMs = ms;
  }

  const json = pretty ? JSON.stringify(body, null, 2) : JSON.stringify(body);
  return json;
}

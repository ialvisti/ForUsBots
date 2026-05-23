// docs/sandbox/js/core/users-management-ui.js
//
// UI + JSON body para POST /forusbot/users-management/{create,edit} y sus
// variantes /sandbox/...
//
// CREATE: form visual fijo arriba (firstName, lastName, email, password,
//   role, active, isNewDashboardUser, notAnEmployee) + bloques colapsables
//   (multi-selects con chips, optional, metadata, raw JSON).
// EDIT  : userId + note + resetMfa fijos + "Add field" rows estilo
//   update-plan-ui.js para elegir qué actualizar (patch semantics).
// Multi-selects: chips removibles construidos a partir de input + Enter /
//   coma / paste de "1, 2, 3".
// Escape hatch: <details> "Raw JSON" con textarea. Si el operador escribe
//   ahí, el body se construye desde el raw y se ignora el builder visual.

import { $ } from "./utils.js";

// ============================================================================
// FIELD_SPECS para el dropdown del EDIT
// ============================================================================

const FIELD_SPECS = [
  // Basic
  { name: "firstName", label: "First name", group: "Basic", type: "text" },
  { name: "lastName", label: "Last name", group: "Basic", type: "text" },
  { name: "email", label: "Email", group: "Basic", type: "email" },
  {
    name: "password",
    label: "Password",
    group: "Basic",
    type: "password",
    pairsWith: "passwordConfirmation",
  },
  {
    name: "passwordConfirmation",
    label: "Password confirmation",
    group: "Basic",
    type: "password",
  },

  // Access
  {
    name: "role",
    label: "Role",
    group: "Access",
    type: "select",
    options: [
      { value: "1", label: "1 — forus_admin" },
      { value: "2", label: "2 — sponsor_admin" },
      { value: "3", label: "3 — sponsor_rep" },
      { value: "4", label: "4 — super_admin" },
      { value: "5", label: "5 — cs_admin" },
      { value: "6", label: "6 — auditor" },
    ],
  },
  { name: "sponsorIds", label: "Sponsor IDs", group: "Access", type: "chips" },
  { name: "userGroupIds", label: "User group IDs", group: "Access", type: "chips" },
  { name: "payrollSetupIds", label: "Payroll setup IDs", group: "Access", type: "chips" },

  // Status
  {
    name: "active",
    label: "Active",
    group: "Status",
    type: "checkbox",
    options: [
      { value: "true", label: "active" },
      { value: "false", label: "inactive" },
    ],
  },
  {
    name: "isNewDashboardUser",
    label: "Dashboard",
    group: "Status",
    type: "checkbox",
    options: [
      { value: "true", label: "new" },
      { value: "false", label: "old" },
    ],
  },
  {
    name: "notAnEmployee",
    label: "Not an employee",
    group: "Status",
    type: "checkbox",
    options: [
      { value: "true", label: "true" },
      { value: "false", label: "false" },
    ],
  },

  // Identification
  { name: "participantId", label: "Participant ID", group: "Identification", type: "text" },
];

// ============================================================================
// Estado interno de "raw dirty" — si el operador edita el raw, gana
// ============================================================================

const rawDirty = { create: false, edit: false };

function isRawActive(mode) {
  return rawDirty[mode] === true;
}

function getRawValue(mode) {
  const id = mode === "create" ? "umCreateBody" : "umEditBody";
  return ($(`#${id}`)?.value || "").trim();
}

// ============================================================================
// Chips helpers
// ============================================================================

function chipEl(idStr, { onChange } = {}) {
  const chip = document.createElement("span");
  chip.className = "um-chip";
  chip.dataset.id = idStr;
  chip.textContent = idStr;

  const x = document.createElement("button");
  x.type = "button";
  x.className = "um-chip-x";
  x.setAttribute("aria-label", `Remove ${idStr}`);
  x.textContent = "×";
  x.addEventListener("click", (e) => {
    e.preventDefault();
    chip.remove();
    onChange?.();
  });

  chip.appendChild(x);
  return chip;
}

function addChipsFromText(container, text, { onChange } = {}) {
  if (!container) return;
  const existing = new Set(
    Array.from(container.querySelectorAll(".um-chip")).map((c) => c.dataset.id)
  );
  const tokens = String(text || "")
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  let added = false;
  for (const tok of tokens) {
    const n = Number(tok);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) continue;
    const idStr = String(n);
    if (existing.has(idStr)) continue;
    existing.add(idStr);
    container.appendChild(chipEl(idStr, { onChange }));
    added = true;
  }
  if (added) onChange?.();
  return added;
}

function readChipsIds(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(".um-chip")).map((c) =>
    Number(c.dataset.id)
  );
}

function clearChips(container) {
  if (!container) return;
  container.innerHTML = "";
}

function wireChipsInput(containerEl, inputEl, { onChange } = {}) {
  if (!containerEl || !inputEl) return;

  const commit = () => {
    const txt = inputEl.value;
    if (!txt) return;
    addChipsFromText(containerEl, txt, { onChange });
    inputEl.value = "";
  };

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "," || e.key === ";") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && inputEl.value === "") {
      const last = containerEl.querySelector(".um-chip:last-child");
      if (last) {
        last.remove();
        onChange?.();
      }
    }
  });

  inputEl.addEventListener("paste", (e) => {
    const txt = (e.clipboardData || window.clipboardData)?.getData("text") || "";
    if (/[,\s;]/.test(txt)) {
      e.preventDefault();
      addChipsFromText(containerEl, txt, { onChange });
      inputEl.value = "";
    }
  });

  inputEl.addEventListener("blur", () => {
    if (inputEl.value.trim()) commit();
  });
}

// ============================================================================
// CREATE — lectura del form visual
// ============================================================================

function readCreateUser() {
  const user = {};
  const set = (k, v) => {
    if (v === undefined || v === null) return;
    if (typeof v === "string" && v === "") return;
    user[k] = v;
  };
  set("firstName", $("#umcFirstName")?.value.trim() || "");
  set("lastName", $("#umcLastName")?.value.trim() || "");
  set("email", $("#umcEmail")?.value.trim() || "");
  set("password", $("#umcPassword")?.value || "");
  set("passwordConfirmation", $("#umcPasswordConfirmation")?.value || "");

  const role = $("#umcRole")?.value || "";
  if (role) {
    const n = Number(role);
    if (Number.isFinite(n)) user.role = n;
  }

  const active = $("#umcActive")?.value;
  if (active === "true") user.active = true;
  else if (active === "false") user.active = false;

  const dash = $("#umcIsNewDashboardUser")?.value;
  if (dash === "true") user.isNewDashboardUser = true;
  else if (dash === "false") user.isNewDashboardUser = false;

  const notAnEmp = $("#umcNotAnEmployee");
  if (notAnEmp) user.notAnEmployee = !!notAnEmp.checked;

  set("participantId", $("#umcParticipantId")?.value.trim() || "");

  const sponsorIds = readChipsIds($("#umcSponsorChips"));
  if (sponsorIds.length) user.sponsorIds = sponsorIds;
  const userGroupIds = readChipsIds($("#umcUserGroupChips"));
  if (userGroupIds.length) user.userGroupIds = userGroupIds;
  const payrollSetupIds = readChipsIds($("#umcPayrollChips"));
  if (payrollSetupIds.length) user.payrollSetupIds = payrollSetupIds;

  return user;
}

function buildCreateBody(pretty) {
  if (isRawActive("create")) {
    const raw = getRawValue("create");
    if (raw) return raw;
  }

  const user = readCreateUser();
  const note = ($("#umcNote")?.value || "").trim();
  const includeScreens = !!$("#umcIncludeScreens")?.checked;
  const timeoutMsRaw = ($("#umcTimeoutMs")?.value || "").trim();

  const body = { user, note };
  if (includeScreens) body.includeScreens = true;
  if (timeoutMsRaw) {
    const n = parseInt(timeoutMsRaw, 10);
    if (Number.isFinite(n)) body.timeoutMs = n;
  }
  return pretty ? JSON.stringify(body, null, 2) : JSON.stringify(body);
}

// ============================================================================
// EDIT — add-field-row pattern
// ============================================================================

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
  document.querySelectorAll(".ume-row").forEach((row) => {
    if (row === exceptRow) return;
    const v = row.querySelector(".ume-label")?.value?.trim();
    if (v) set.add(v);
  });
  return set;
}

function buildValueInput(spec, { onChange } = {}) {
  const box = document.createElement("div");
  box.className = "ume-value";

  switch (spec.type) {
    case "checkbox": {
      const sel = document.createElement("select");
      sel.className = "ume-input";
      (spec.options || []).forEach((opt) =>
        sel.appendChild(optionEl(opt.value, opt.label))
      );
      box.appendChild(sel);
      break;
    }
    case "select": {
      const sel = document.createElement("select");
      sel.className = "ume-input";
      sel.appendChild(optionEl("", "(choose a value)"));
      (spec.options || []).forEach((opt) =>
        sel.appendChild(optionEl(opt.value, opt.label))
      );
      box.appendChild(sel);
      break;
    }
    case "password": {
      const i = document.createElement("input");
      i.type = "password";
      i.className = "ume-input";
      i.autocomplete = "new-password";
      box.appendChild(i);
      if (spec.pairsWith) {
        const help = document.createElement("div");
        help.className = "help";
        help.innerHTML = `Don't forget to also add <code>${spec.pairsWith}</code> with the same value.`;
        box.appendChild(help);
      }
      break;
    }
    case "email": {
      const i = document.createElement("input");
      i.type = "email";
      i.className = "ume-input";
      box.appendChild(i);
      break;
    }
    case "chips": {
      const chipsBox = document.createElement("div");
      chipsBox.className = "um-chips ume-input-chips";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "um-chip-input ume-input-chipsinput";
      input.placeholder =
        "Type ID and press Enter or comma (paste \"1, 2, 3\" supported)";
      box.appendChild(chipsBox);
      box.appendChild(input);
      // wire after DOM insertion (deferred)
      setTimeout(() => wireChipsInput(chipsBox, input, { onChange }), 0);
      break;
    }
    default: {
      const i = document.createElement("input");
      i.type = "text";
      i.className = "ume-input";
      box.appendChild(i);
    }
  }
  return box;
}

function renderRowValueUI(row, name, { onChange } = {}) {
  const spec =
    FIELD_SPECS.find((f) => f.name === name) || { type: "text", name };
  const holder = row.querySelector(".ume-value-wrap");
  holder.innerHTML = "";
  holder.appendChild(buildValueInput(spec, { onChange }));
}

function repopulateLabelSelects() {
  const rows = Array.from(document.querySelectorAll(".ume-row"));
  const groups = {};
  FIELD_SPECS.forEach((f) => {
    if (!groups[f.group]) groups[f.group] = [];
    groups[f.group].push(f);
  });

  rows.forEach((row) => {
    const sel = row.querySelector(".ume-label");
    if (!sel) return;
    const current = sel.value;
    const used = usedNames(row);

    sel.innerHTML = "";
    sel.appendChild(optionEl("", "(choose a field)"));
    Object.keys(groups).forEach((groupName) => {
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

  const addBtn = $("#umeAddRow");
  if (addBtn) {
    const usedCount = usedNames(null).size;
    addBtn.disabled = usedCount >= FIELD_SPECS.length;
  }
}

function addEditRow({ onChange } = {}) {
  const rowsHost = $("#umeRows");
  if (!rowsHost) return null;

  const row = document.createElement("div");
  row.className = "module-row ume-row";

  const controls = document.createElement("div");
  controls.className = "module-row-controls";

  const fieldLeft = document.createElement("div");
  fieldLeft.className = "field";
  fieldLeft.innerHTML =
    '<label>field</label><select class="ume-label"></select>';
  controls.appendChild(fieldLeft);

  const actions = document.createElement("div");
  actions.className = "module-row-actions";
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn ghost small";
  removeBtn.textContent = "Remove";
  actions.appendChild(removeBtn);
  controls.appendChild(actions);

  const fields = document.createElement("div");
  fields.className = "module-fields";
  const valueWrap = document.createElement("div");
  valueWrap.className = "ume-value-wrap";
  fields.appendChild(valueWrap);

  row.appendChild(controls);
  row.appendChild(fields);
  rowsHost.appendChild(row);

  repopulateLabelSelects();

  const sel = row.querySelector(".ume-label");
  sel.addEventListener("change", () => {
    renderRowValueUI(row, sel.value, { onChange });
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

function readEditUpdates() {
  const updates = {};
  document.querySelectorAll(".ume-row").forEach((row) => {
    const name = row.querySelector(".ume-label")?.value || "";
    if (!name) return;
    const spec = FIELD_SPECS.find((f) => f.name === name);
    if (!spec) return;

    if (spec.type === "chips") {
      const container = row.querySelector(".ume-input-chips");
      const ids = readChipsIds(container);
      // Always include — empty array is a meaningful "clear"
      updates[name] = ids;
      return;
    }

    const input = row.querySelector(".ume-input");
    if (!input) return;
    const raw = String(input.value ?? "");

    if (spec.type === "checkbox") {
      if (raw === "true") updates[name] = true;
      else if (raw === "false") updates[name] = false;
      return;
    }
    if (spec.type === "select" && spec.name === "role") {
      if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n)) updates[name] = n;
      }
      return;
    }
    updates[name] = raw;
  });
  return updates;
}

function buildEditBody(pretty) {
  if (isRawActive("edit")) {
    const raw = getRawValue("edit");
    if (raw) return raw;
  }

  const userIdRaw = ($("#umeUserId")?.value || "").trim();
  const userId = userIdRaw ? Number(userIdRaw) : 0;
  const note = ($("#umeNote")?.value || "").trim();
  const resetMfa = ($("#umeResetMfa")?.value || "none").trim();
  const includeScreens = !!$("#umeIncludeScreens")?.checked;
  const timeoutMsRaw = ($("#umeTimeoutMs")?.value || "").trim();
  const updates = readEditUpdates();

  const body = { userId, updates, resetMfa, note };
  if (includeScreens) body.includeScreens = true;
  if (timeoutMsRaw) {
    const n = parseInt(timeoutMsRaw, 10);
    if (Number.isFinite(n)) body.timeoutMs = n;
  }
  return pretty ? JSON.stringify(body, null, 2) : JSON.stringify(body);
}

// ============================================================================
// Public API
// ============================================================================

export function buildUsersManagementBodyStr(endpointKey, pretty = false) {
  const isCreate = endpointKey.endsWith("create");
  return isCreate ? buildCreateBody(pretty) : buildEditBody(pretty);
}

export function wireUsersManagementUI({ onChange } = {}) {
  // ---- CREATE wiring ----
  const createInputs = [
    "#umcFirstName",
    "#umcLastName",
    "#umcEmail",
    "#umcPassword",
    "#umcPasswordConfirmation",
    "#umcRole",
    "#umcActive",
    "#umcIsNewDashboardUser",
    "#umcNotAnEmployee",
    "#umcParticipantId",
    "#umcNote",
    "#umcIncludeScreens",
    "#umcTimeoutMs",
  ];
  createInputs.forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    ["input", "change"].forEach((ev) =>
      el.addEventListener(ev, () => onChange?.())
    );
  });

  // Chips for create
  wireChipsInput($("#umcSponsorChips"), $("#umcSponsorInput"), { onChange });
  wireChipsInput($("#umcUserGroupChips"), $("#umcUserGroupInput"), { onChange });
  wireChipsInput($("#umcPayrollChips"), $("#umcPayrollInput"), { onChange });

  // Raw JSON (create)
  const umcBody = $("#umCreateBody");
  if (umcBody) {
    umcBody.addEventListener("input", () => {
      rawDirty.create = (umcBody.value || "").trim().length > 0;
      onChange?.();
    });
  }
  const umcRawReset = $("#umcRawReset");
  if (umcRawReset) {
    umcRawReset.addEventListener("click", (e) => {
      e.preventDefault();
      rawDirty.create = false;
      if (umcBody) umcBody.value = "";
      onChange?.();
    });
  }

  // ---- EDIT wiring ----
  const editScalarInputs = [
    "#umeUserId",
    "#umeNote",
    "#umeResetMfa",
    "#umeIncludeScreens",
    "#umeTimeoutMs",
  ];
  editScalarInputs.forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    ["input", "change"].forEach((ev) =>
      el.addEventListener(ev, () => onChange?.())
    );
  });

  const rowsHost = $("#umeRows");
  if (rowsHost) rowsHost.innerHTML = "";
  const addBtn = $("#umeAddRow");
  if (addBtn) {
    addBtn.addEventListener("click", (e) => {
      e.preventDefault();
      addEditRow({ onChange });
      onChange?.();
    });
  }

  // Raw JSON (edit)
  const umeBody = $("#umEditBody");
  if (umeBody) {
    umeBody.addEventListener("input", () => {
      rawDirty.edit = (umeBody.value || "").trim().length > 0;
      onChange?.();
    });
  }
  const umeRawReset = $("#umeRawReset");
  if (umeRawReset) {
    umeRawReset.addEventListener("click", (e) => {
      e.preventDefault();
      rawDirty.edit = false;
      if (umeBody) umeBody.value = "";
      onChange?.();
    });
  }
}

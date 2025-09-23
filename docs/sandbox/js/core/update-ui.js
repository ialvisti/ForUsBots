// docs/sandbox/js/core/update-ui.js
// UI + JSON body para POST /forusbot/forusall-update-participant

import { $ } from "./utils.js";

/** === Etiquetas EXACTAS aceptadas por el backend (map del controller) === */
const FIELD_SPECS = [
  { label: "First Name", type: "text" },
  { label: "Last Name", type: "text" },
  { label: "Preferred First Name", type: "text" },
  { label: "Preferred Last Name", type: "text" },
  { label: "Eligibility Status", type: "elig" }, // select A,D,I,X,U
  { label: "Birth Date", type: "date" },
  { label: "Hire Date", type: "date" },
  { label: "Rehire Date", type: "date" },
  { label: "Termination Date", type: "date" },
  { label: "Projected Plan Entry Date", type: "date" },
  { label: "Address 1", type: "text" },
  { label: "Address 2", type: "text" },
  { label: "City", type: "text" },
  { label: "State", type: "state" }, // 2 letras
  { label: "Zip Code", type: "zip" },
  { label: "Primary Email", type: "email" },
  { label: "Home Email", type: "email" },
  { label: "Phone", type: "tel" },
];

const ELIG_VALUES = ["A", "D", "I", "X", "U"];

function optionEl(value, text, { disabled = false, selected = false } = {}) {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = text;
  if (disabled) o.disabled = true;
  if (selected) o.selected = true;
  return o;
}

function usedLabels(exceptRow = null) {
  const set = new Set();
  document.querySelectorAll(".up-row").forEach((row) => {
    if (row === exceptRow) return;
    const sel = row.querySelector(".up-label");
    const v = sel?.value?.trim();
    if (v) set.add(v);
  });
  return set;
}

function buildValueInput(spec) {
  const box = document.createElement("div");
  box.className = "up-value";

  switch (spec.type) {
    case "elig": {
      const sel = document.createElement("select");
      sel.className = "up-input";
      ELIG_VALUES.forEach((v) => sel.appendChild(optionEl(v, v)));
      box.appendChild(sel);
      break;
    }
    case "date": {
      const i = document.createElement("input");
      i.type = "date";
      i.placeholder = "yyyy-mm-dd";
      i.className = "up-input";
      box.appendChild(i);
      // Tip aclaratorio
      const help = document.createElement("div");
      help.className = "help";
      help.innerHTML =
        'Leaving it empty sends <code>""</code> to clear the current date.';
      box.appendChild(help);
      break;
    }
    case "state": {
      const i = document.createElement("input");
      i.type = "text";
      i.maxLength = 2;
      i.placeholder = "CA";
      i.className = "up-input";
      i.addEventListener("input", () => {
        i.value = (i.value || "").toUpperCase().slice(0, 2);
      });
      box.appendChild(i);
      break;
    }
    case "zip": {
      const i = document.createElement("input");
      i.type = "text";
      i.inputMode = "numeric";
      i.placeholder = "94107";
      i.className = "up-input";
      box.appendChild(i);
      break;
    }
    case "email": {
      const i = document.createElement("input");
      i.type = "email";
      i.placeholder = "name@company.com";
      i.className = "up-input";
      box.appendChild(i);
      break;
    }
    case "tel": {
      const i = document.createElement("input");
      i.type = "tel";
      i.placeholder = "1111111111";
      i.className = "up-input";
      box.appendChild(i);
      break;
    }
    default: {
      const i = document.createElement("input");
      i.type = "text";
      i.className = "up-input";
      box.appendChild(i);
    }
  }

  return box;
}

function renderRowValueUI(row, label) {
  const spec = FIELD_SPECS.find((f) => f.label === label) || {
    type: "text",
    label,
  };
  const holder = row.querySelector(".up-value-wrap");
  holder.innerHTML = "";
  holder.appendChild(buildValueInput(spec));
}

function repopulateLabelSelects() {
  const rows = Array.from(document.querySelectorAll(".up-row"));
  rows.forEach((row) => {
    const sel = row.querySelector(".up-label");
    const current = sel.value;
    const used = usedLabels(row);

    sel.innerHTML = "";
    sel.appendChild(optionEl("", "(choose a field)"));
    FIELD_SPECS.forEach((f) => {
      const disabled = used.has(f.label);
      sel.appendChild(
        optionEl(f.label, f.label, {
          disabled,
          selected: f.label === current,
        })
      );
    });
  });

  // Botón Add: deshabilitar cuando ya no quedan campos libres
  const addBtn = $("#upAddRow");
  if (addBtn) {
    const usedCount = usedLabels(null).size;
    addBtn.disabled = usedCount >= FIELD_SPECS.length;
  }
}

function addRow({ onChange } = {}) {
  const row = document.createElement("div");
  row.className = "module-row up-row";

  const controls = document.createElement("div");
  controls.className = "module-row-controls";

  const fieldLeft = document.createElement("div");
  fieldLeft.className = "field";
  fieldLeft.innerHTML =
    '<label>field</label><select class="up-label"></select>';
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
  valueWrap.className = "up-value-wrap";
  fields.appendChild(valueWrap);

  row.appendChild(controls);
  row.appendChild(fields);

  $("#upRows").appendChild(row);

  // poblar select y UI inicial
  repopulateLabelSelects();
  const sel = row.querySelector(".up-label");
  sel.addEventListener("change", () => {
    renderRowValueUI(row, sel.value);
    repopulateLabelSelects();
    onChange?.();
  });

  // remove
  removeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    row.remove();
    repopulateLabelSelects();
    onChange?.();
  });

  // cambios en el input
  row.addEventListener("input", () => onChange?.());
  row.addEventListener("change", () => onChange?.());

  return row;
}

/** ===== API ===== */
export function wireUpdateUI({ onChange } = {}) {
  const pid = $("#upParticipantId");
  const note = $("#upNote");
  const rows = $("#upRows");
  const addBtn = $("#upAddRow");

  if (!rows) return;

  rows.innerHTML = "";
  addRow({ onChange }); // fila inicial

  if (addBtn) {
    addBtn.addEventListener("click", (e) => {
      e.preventDefault();
      addRow({ onChange });
      onChange?.();
    });
  }

  ["input", "change"].forEach((ev) => {
    [pid, note].forEach((el) => el?.addEventListener(ev, () => onChange?.()));
  });
}

export function buildUpdateBodyStr(pretty = false) {
  const participantId = ($("#upParticipantId")?.value || "").trim();
  const note = ($("#upNote")?.value || "").trim();

  const updates = {};
  document.querySelectorAll(".up-row").forEach((row) => {
    const label = row.querySelector(".up-label")?.value || "";
    if (!label) return;
    const input = row.querySelector(".up-input");
    if (!input) return;

    let v = "";
    if (input.tagName === "SELECT") {
      v = input.value || "";
    } else {
      v = String(input.value ?? "");
      // Para fechas: si vacío -> "", permite limpiar en server
      // Para texto: si vacío -> "", también fuerza limpiar si aplica
      // El controller ya valida formatos especiales.
    }
    updates[label] = v;
  });

  const body = { participantId, note, updates };
  const json = pretty ? JSON.stringify(body, null, 2) : JSON.stringify(body);
  return json;
}

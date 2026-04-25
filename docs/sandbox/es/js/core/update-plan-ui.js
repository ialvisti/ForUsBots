// docs/sandbox/es/js/core/update-plan-ui.js
// UI + JSON body for POST /forusbot/update-plan and /forusbot/sandbox/update-plan.
// Los campos se seleccionan del dropdown. Los usuarios no escriben nombres de campo manualmente.

import { $ } from "./utils.js";

const FIELD_SPECS = [
  // Basic Info
  { name: "company_name", label: "Nombre de la Empresa", group: "Información Básica", type: "text" },
  { name: "official_plan_name", label: "Nombre Oficial del Plan", group: "Información Básica", type: "text" },
  { name: "external_name", label: "Nombre Externo", group: "Información Básica", type: "text" },
  { name: "ein", label: "EIN", group: "Información Básica", type: "text" },
  { name: "symlink", label: "Symlink", group: "Información Básica", type: "text" },

  // Status
  { name: "active", label: "Activo", group: "Estado", type: "checkbox", options: [
    { value: "true", label: "Verdadero" },
    { value: "false", label: "Falso" }
  ]},
  { name: "status", label: "Estado", group: "Estado", type: "select", options: [
    { value: "short_psa", label: "NCE" },
    { value: "extended_psa", label: "Implementación" },
    { value: "actively_managed", label: "En Curso" },
    { value: "pending_termination", label: "Pendiente de Terminación" },
    { value: "terminated", label: "Terminado" }
  ]},
  { name: "effective_date", label: "Fecha Efectiva", group: "Estado", type: "date" },
  { name: "status_as_of", label: "Estado a Partir de", group: "Estado", type: "date" },

  // Plan Design
  { name: "plan_type", label: "Tipo de Plan", group: "Diseño del Plan", type: "select", options: [
    { value: "conversion", label: "Conversión" },
    { value: "start_up", label: "Inicio" }
  ]},
  { name: "service_type", label: "Tipo de Servicio", group: "Diseño del Plan", type: "select", options: [
    { value: "0", label: "Gratuito" },
    { value: "10", label: "Completo" }
  ]},
  { name: "lt_plan_type", label: "Tipo de Plan LT", group: "Diseño del Plan", type: "select", options: [
    { value: "mep", label: "MEP" },
    { value: "standalone", label: "Independiente" }
  ]},
  { name: "record_keeper_id", label: "Custodio de Registros", group: "Diseño del Plan", type: "select", options: [
    { value: "1", label: "The Payroll Company" },
    { value: "3", label: "ACME" },
    { value: "4", label: "Fidelity" },
    { value: "7", label: "Empower" },
    { value: "2", label: "LT Trust" },
    { value: "54", label: "LT Trust (no-FUA)" },
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
  { name: "enrollment_type", label: "Tipo de Inscripción", group: "Diseño del Plan", type: "select", options: [
    { value: "opt_in_for_all", label: "Optar por participar para todos" },
    { value: "opt_out_for_all", label: "Optar por no participar para todos" },
    { value: "opt_out_new_hires_only", label: "Optar por no participar solo para nuevas contrataciones" }
  ]},
  { name: "contribution_type", label: "Tipo de Aportación", group: "Diseño del Plan", type: "select", options: [
    { value: "0", label: "Dólar y porcentaje" },
    { value: "1", label: "Solo dólar" },
    { value: "2", label: "Solo porcentaje" }
  ]},
  { name: "roth_contributions_allowed", label: "Aportaciones Roth Permitidas", group: "Diseño del Plan", type: "checkbox", options: [
    { value: "true", label: "Sí" },
    { value: "false", label: "No" }
  ]},
  { name: "profit_sharing", label: "Participación en Ganancias", group: "Diseño del Plan", type: "checkbox", options: [
    { value: "true", label: "Sí" },
    { value: "false", label: "No" }
  ]},
  { name: "e_statement", label: "Estado Electrónico", group: "Diseño del Plan", type: "checkbox", options: [
    { value: "true", label: "Sí" },
    { value: "false", label: "No" }
  ]},
  { name: "spanish_participants", label: "Participantes en Español", group: "Diseño del Plan", type: "checkbox", options: [
    { value: "true", label: "Sí" },
    { value: "false", label: "No" }
  ]},
  { name: "eaca", label: "EACA", group: "Diseño del Plan", type: "checkbox", options: [
    { value: "true", label: "Verdadero" },
    { value: "false", label: "Falso" }
  ]},

  // Eligibility
  { name: "eligibility_min_age", label: "Edad Mínima de Elegibilidad", group: "Elegibilidad", type: "text" },
  { name: "eligibility_hours_requirement", label: "Requisito de Horas de Elegibilidad", group: "Elegibilidad", type: "text" },
  { name: "eligibility_duration_value", label: "Duración de Elegibilidad (meses)", group: "Elegibilidad", type: "text" },
  { name: "plan_entry_frequency", label: "Frecuencia de Entrada al Plan", group: "Elegibilidad", type: "select", options: [
    { value: "i", label: "Inmediato" },
    { value: "m", label: "Mensual" },
    { value: "q", label: "Trimestral" },
    { value: "sa", label: "Semestral" },
    { value: "a", label: "Anual" }
  ]},

  // Employer Match
  { name: "employer_contribution", label: "Aportación del Empleador", group: "Coincidencia del Empleador", type: "select", options: [
    { value: "No employer contribution", label: "Sin Aportación del Empleador" },
    { value: "SH Match Traditional", label: "Coincidencia Tradicional SH" },
    { value: "SH Match Other", label: "Otra Coincidencia SH" },
    { value: "Non-SH match", label: "Coincidencia No-SH" },
    { value: "SH 3% Non-elective", label: "SH 3% No Electivo" },
    { value: "SH Non-elective Other", label: "Otro SH No Electivo" }
  ]},
  { name: "employer_contribution_formula", label: "Fórmula de Aportación del Empleador", group: "Coincidencia del Empleador", type: "tiers" },
  { name: "employer_contribution_cap", label: "Límite de Aportación del Empleador (%)", group: "Coincidencia del Empleador", type: "text" },
  { name: "er_contribution_monthly_cap", label: "Límite Mensual de ER ($)", group: "Coincidencia del Empleador", type: "text" },
  { name: "employer_contribution_timing", label: "Tiempo de Aportación del Empleador", group: "Coincidencia del Empleador", type: "select", options: [
    { value: "ongoing", label: "Continuo" },
    { value: "year end", label: "Fin de Año" },
    { value: "quarterly", label: "Trimestral" }
  ]},

  // Savings & Auto-Escalation
  { name: "default_savings_rate", label: "Tasa de Ahorro por Defecto (%)", group: "Ahorros y Aumento Automático", type: "text" },
  { name: "max_deferral_rate", label: "Tasa de Aplazamiento Máximo (%)", group: "Ahorros y Aumento Automático", type: "text" },
  { name: "autoescalate_rate", label: "Tasa de Aumento Automático (%)", group: "Ahorros y Aumento Automático", type: "text" },
  { name: "autoescalation_limit", label: "Límite de Aumento Automático (%)", group: "Ahorros y Aumento Automático", type: "text" },
  { name: "autoescalation_source", label: "Fuente de Aumento Automático", group: "Ahorros y Aumento Automático", type: "select", options: [
    { value: "t+r", label: "Pre-impuesto + Roth" },
    { value: "t", label: "Solo pre-impuesto" }
  ]},
  { name: "autoescalation_timing", label: "Tiempo de Aumento Automático", group: "Ahorros y Aumento Automático", type: "select", options: [
    { value: "1", label: "Enero" },
    { value: "2", label: "Febrero" },
    { value: "3", label: "Marzo" },
    { value: "4", label: "Abril" },
    { value: "5", label: "Mayo" },
    { value: "6", label: "Junio" },
    { value: "7", label: "Julio" },
    { value: "8", label: "Agosto" },
    { value: "9", label: "Septiembre" },
    { value: "10", label: "Octubre" },
    { value: "11", label: "Noviembre" },
    { value: "12", label: "Diciembre" }
  ]},

  // Key Dates
  { name: "first_deferral_date", label: "Primera Fecha de Aplazamiento", group: "Fechas Clave", type: "date" },
  { name: "special_participation_date", label: "Fecha Especial de Participación", group: "Fechas Clave", type: "date" },
  { name: "blackout_begins_date", label: "Inicio de Restricción", group: "Fechas Clave", type: "date" },
  { name: "blackout_ends_date", label: "Fin de Restricción", group: "Fechas Clave", type: "date" },
  { name: "website_live_date", label: "Fecha de Inicio del Sitio Web", group: "Fechas Clave", type: "date" },
  { name: "enrollment_window_begins", label: "Inicio de la Ventana de Inscripción", group: "Fechas Clave", type: "date" },
  { name: "enrollment_window_ends", label: "Fin de la Ventana de Inscripción", group: "Fechas Clave", type: "date" },
  { name: "reenrollment_date", label: "Fecha de Reincripción", group: "Fechas Clave", type: "date" },

  // Compliance / Features
  { name: "accept_covid19_amendment", label: "Aceptar Enmienda COVID-19", group: "Cumplimiento / Características", type: "checkbox", options: [
    { value: "true", label: "Sí" },
    { value: "false", label: "No" }
  ]},
  { name: "support_aftertax", label: "Soporte Después de Impuestos", group: "Cumplimiento / Características", type: "checkbox", options: [
    { value: "true", label: "Sí" },
    { value: "false", label: "No" }
  ]},
  { name: "alts_crypto", label: "Alts Crypto", group: "Cumplimiento / Características", type: "checkbox", options: [
    { value: "true", label: "Sí" },
    { value: "false", label: "No" }
  ]},
  { name: "alts_waitlist_crypto", label: "Lista de Espera de Alts Crypto", group: "Cumplimiento / Características", type: "checkbox", options: [
    { value: "true", label: "Sí" },
    { value: "false", label: "No" }
  ]},
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
      sel.appendChild(optionEl("", "(elige un valor)"));
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
      help.innerHTML = 'Dejando vacío envía <code>""</code> para limpiar la fecha actual.';
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
      help.innerHTML = 'Pega un array JSON de objetos <code>{match_value, percent_pay}</code>.';
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
    sel.appendChild(optionEl("", "(elige un campo)"));
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
    '<label>campo</label><select class="upl-label"></select>';
  controls.appendChild(fieldLeft);

  const actions = document.createElement("div");
  actions.className = "module-row-actions";
  const removeBtn = document.createElement("button");
  removeBtn.className = "btn ghost small";
  removeBtn.textContent = "Eliminar";
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

// docs/sandbox/js/core/users-management-ui.js
//
// Builder UI para POST /forusbot/users-management/{create,edit} y sus
// dry-runs. Usa dos <textarea> con plantillas JSON pre-llenas (una para
// create y otra para edit) — el operador edita el JSON directamente.
// El UI HTML correspondiente vive en la sección `.ep .ep-users-management`
// en docs/sandbox/index.html (EN) y docs/sandbox/es/index.html (ES).

const CREATE_TEMPLATE = {
  user: {
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    passwordConfirmation: "",
    role: 2,
    sponsorIds: [],
    userGroupIds: [],
    payrollSetupIds: [],
    active: true,
    isNewDashboardUser: true,
    participantId: "",
    notAnEmployee: true,
  },
  note: "",
  includeScreens: false,
  timeoutMs: 30000,
};

const EDIT_TEMPLATE = {
  userId: 0,
  updates: {
    firstName: "",
    role: 2,
    active: true,
  },
  resetMfa: "none",
  note: "",
  includeScreens: false,
  timeoutMs: 30000,
};

function getEl(id) {
  return document.getElementById(id);
}

/**
 * Lee el contenido del textarea correspondiente al endpoint y devuelve el
 * string JSON. Si el textarea está vacío, devuelve la plantilla por defecto.
 */
export function buildUsersManagementBodyStr(endpointKey, pretty = false) {
  const isCreate = endpointKey.endsWith("create");
  const ta = getEl(isCreate ? "umCreateBody" : "umEditBody");
  const template = isCreate ? CREATE_TEMPLATE : EDIT_TEMPLATE;
  const raw = (ta?.value || "").trim();
  if (!raw) {
    return JSON.stringify(template, null, pretty ? 2 : 0);
  }
  try {
    const obj = JSON.parse(raw);
    return JSON.stringify(obj, null, pretty ? 2 : 0);
  } catch {
    // Si el JSON es inválido, devolvemos el raw tal cual para que el
    // operador vea el error en el snippet/preview.
    return raw;
  }
}

/**
 * Inicializa los textareas con la plantilla por defecto si están vacíos, y
 * registra los listeners para refrescar el preview del request al editar.
 */
export function wireUsersManagementUI({ onChange } = {}) {
  const createTa = getEl("umCreateBody");
  const editTa = getEl("umEditBody");
  if (createTa && !createTa.value.trim()) {
    createTa.value = JSON.stringify(CREATE_TEMPLATE, null, 2);
  }
  if (editTa && !editTa.value.trim()) {
    editTa.value = JSON.stringify(EDIT_TEMPLATE, null, 2);
  }
  if (createTa) createTa.addEventListener("input", () => onChange?.());
  if (editTa) editTa.addEventListener("input", () => onChange?.());
}

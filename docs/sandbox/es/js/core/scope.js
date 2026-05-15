// docs/sandbox/es/js/core/scope.js
// Cableado del scope del token en la sandbox: hace fetch a /forusbot/whoami,
// pinta el banner del usuario y deshabilita las <option> del selector cuando
// el scope del token las deniega. Tokens legacy (sin scope) → no-op.

const STRINGS = {
  anonymous: "anónimo",
  loading: "cargando…",
  noAccount: "(sin cuenta)",
  deniedSuffix: " 🚫",
  overrideSuffix: " ⚠️ override",
  accountLabel: (alias) => `cuenta: ${alias}`,
};

function endpointSig(ep) {
  return `${ep.method} ${ep.path}`;
}

export async function fetchWhoami(baseUrl, tokenValue) {
  const token = String(tokenValue || "").trim();
  if (!token) return null;
  const base = String(baseUrl || "").replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/forusbot/whoami`, {
      method: "GET",
      headers: { "x-auth-token": token },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function renderMeBanner(me) {
  const nameEl = document.getElementById("me-name");
  const roleEl = document.getElementById("me-role");
  const accEl = document.getElementById("me-account");
  if (!nameEl || !roleEl || !accEl) return;

  if (!me || !me.ok) {
    nameEl.textContent = STRINGS.anonymous;
    roleEl.textContent = "—";
    accEl.textContent = STRINGS.noAccount;
    return;
  }
  nameEl.textContent = me.user?.name || STRINGS.anonymous;
  roleEl.textContent = me.role || "—";
  accEl.textContent = me.accountAlias
    ? STRINGS.accountLabel(me.accountAlias)
    : STRINGS.noAccount;
}

function originalLabel(optionEl) {
  if (!optionEl.dataset.originalLabel) {
    optionEl.dataset.originalLabel = optionEl.textContent;
  }
  return optionEl.dataset.originalLabel;
}

function resetOption(optionEl) {
  optionEl.disabled = false;
  optionEl.classList.remove("scope-override");
  optionEl.textContent = originalLabel(optionEl);
}

export function applyScopeToEndpointSelect(selectEl, me, ENDPOINTS) {
  if (!selectEl) return;
  const options = Array.from(selectEl.options);
  options.forEach(resetOption);

  if (!me || !me.scope) return;

  const scope = me.scope;
  const deniedFeatures = new Set(scope.deniedFeatures || []);
  const deniedEndpoints = new Set(scope.deniedEndpoints || []);
  const allowedEndpoints = new Set(scope.allowedEndpoints || []);

  for (const opt of options) {
    const ep = ENDPOINTS[opt.value];
    if (!ep) continue;
    const feature = ep.feature || null;
    const sig = endpointSig(ep);

    const featureDenied = feature && deniedFeatures.has(feature);
    const endpointDenied = deniedEndpoints.has(sig);
    const endpointAllowed = allowedEndpoints.has(sig);

    const denied = (featureDenied || endpointDenied) && !endpointAllowed;
    const override = endpointAllowed && (featureDenied || endpointDenied);

    if (denied) {
      opt.disabled = true;
      opt.textContent = originalLabel(opt) + STRINGS.deniedSuffix;
    } else if (override) {
      opt.classList.add("scope-override");
      opt.textContent = originalLabel(opt) + STRINGS.overrideSuffix;
    }
  }

  const current = selectEl.options[selectEl.selectedIndex];
  if (current && current.disabled) {
    const firstEnabled = options.find((o) => !o.disabled);
    if (firstEnabled) {
      selectEl.value = firstEnabled.value;
      selectEl.dispatchEvent(new Event("change"));
    }
  }
}

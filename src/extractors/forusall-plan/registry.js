// src/extractors/forusall-plan/registry.js
const basic_info = require("./modules/basic_info");
const plan_design = require("./modules/plan_design");
const onboarding = require("./modules/onboarding");
const communications = require("./modules/communications");
const extra_settings = require("./modules/extra_settings");
const feature_flags = require("./modules/feature_flags");

const REGISTRY = {
  basic_info,
  plan_design,
  onboarding,
  communications,
  extra_settings,
  feature_flags,
};

function getExtractor(key) {
  return REGISTRY[String(key || "").toLowerCase()] || null;
}

function getSupportedFields(key) {
  const mod = getExtractor(key);
  if (!mod) return null;
  const f = mod.SUPPORTED_FIELDS;
  return Array.isArray(f) ? [...f] : null;
}

function getFieldPolicy(key) {
  const mod = getExtractor(key);
  if (!mod) return null;
  return mod.FIELD_POLICY || null;
}

function supportsFieldFiltering(key) {
  const mod = getExtractor(key);
  if (!mod) return false;
  // Soporta si declara estáticos o si trae una policy / normalizador
  if (Array.isArray(mod.SUPPORTED_FIELDS) && mod.SUPPORTED_FIELDS.length)
    return true;
  if (mod.FIELD_POLICY) return true;
  if (typeof mod.normalizeFields === "function") return true;
  return false;
}

/**
 * Valida/normaliza fields para un módulo.
 * - Usa normalizeFields() del módulo si existe.
 * - Si no existe, valida contra SUPPORTED_FIELDS "estáticos".
 */
function validateFieldsForModule(key, fields) {
  const mod = getExtractor(key);
  if (!mod) return { ok: false, reason: "unknown_module" };

  const arr = Array.isArray(fields) ? fields : [];

  // Sin fields: OK (el extractor aplicará defaults)
  if (!arr.length)
    return { ok: true, normalized: null, errors: [], unknown: [] };

  if (typeof mod.normalizeFields === "function") {
    const { normalized, errors, unknown } = mod.normalizeFields(arr);
    return {
      ok: errors.length === 0 && unknown.length === 0,
      normalized,
      errors,
      unknown,
    };
  }

  // Fallback legado: solo estáticos
  const supported = getSupportedFields(key);
  if (!supported)
    return { ok: false, reason: "fields_not_supported_for_module" };
  const unknown = arr.filter((f) => !supported.includes(f));
  return {
    ok: unknown.length === 0,
    normalized: arr,
    errors: [],
    unknown,
  };
}

function supportedKeys() {
  return Object.keys(REGISTRY);
}

module.exports = {
  getExtractor,
  getSupportedFields,
  getFieldPolicy,
  supportsFieldFiltering,
  validateFieldsForModule,
  supportedKeys,
};


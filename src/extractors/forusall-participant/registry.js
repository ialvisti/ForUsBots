// src/extractors/forusall-participant/registry.js
const census = require('./modules/census');               // función + SUPPORTED_FIELDS
const savings_rate = require('./modules/savings_rate');   // función + SUPPORTED_FIELDS
const loans = require('./modules/loans');                 // función + SUPPORTED_FIELDS
const plan_details = require('./modules/plan_details');
const payroll = require('./modules/payroll');

const REGISTRY = {
  census,
  savings_rate,
  loans,
  plan_details,
  payroll,
  // Próximos módulos:
  // plan_details: require('./modules/plan_details'),
  // payroll: require('./modules/payroll'),
  // communications: require('./modules/communications'),
  // documents: require('./modules/documents'),
  // mfa: require('./modules/mfa'),
};

function getExtractor(key) {
  return REGISTRY[String(key || '').toLowerCase()] || null;
}

function getSupportedFields(key) {
  const mod = getExtractor(key);
  if (!mod) return null;
  const f = mod.SUPPORTED_FIELDS;
  return Array.isArray(f) ? [...f] : null;
}

function supportsFieldFiltering(key) {
  const f = getSupportedFields(key);
  return Array.isArray(f) && f.length > 0;
}

function supportedKeys() {
  return Object.keys(REGISTRY);
}

module.exports = { getExtractor, getSupportedFields, supportsFieldFiltering, supportedKeys };

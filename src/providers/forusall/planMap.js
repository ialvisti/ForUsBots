// src/providers/forusall/planMap.js
// Mapeo de módulos de plan (keys del API) -> metadata para localizar paneles y navegar.

const MODULES = {
  basic_info: {
    key: "basic_info",
    navLabel: null, // No requiere navegación (está siempre visible en top-level)
    panelSelector: "#bitemporal-plan-attrs",
    ready: { selector: "#plan_id" },
    description: "Basic plan information (company name, EIN, status, dates)",
  },

  plan_design: {
    key: "plan_design",
    navLabel: "Plan Design",
    synonyms: ["PLAN DESIGN", "Design"],
    panelSelector: "#plan-design",
    ready: { selector: "#record_keeper_id" },
    navSelector: 'a[href="#plan-design"]',
    description: "Plan design settings (eligibility, contributions, enrollment)",
  },

  onboarding: {
    key: "onboarding",
    navLabel: "Onboarding",
    synonyms: ["ONBOARDING"],
    panelSelector: "#onboarding",
    ready: { selector: "#first_deferral_date" },
    navSelector: 'a[href="#onboarding"]',
    description: "Onboarding dates and conversion settings",
  },

  communications: {
    key: "communications",
    navLabel: "Communications",
    synonyms: ["COMMUNICATIONS"],
    panelSelector: "#communications",
    ready: { selector: "#dave_text" },
    navSelector: 'a[href="#communications"]',
    description: "Communication preferences and branding",
  },

  extra_settings: {
    key: "extra_settings",
    navLabel: "Extra Settings",
    synonyms: ["EXTRA SETTINGS", "Extra"],
    panelSelector: "#extra-settings",
    ready: { selector: "#rk_upload_mode" },
    navSelector: 'a[href="#extra-settings"]',
    description: "Advanced eligibility and matching rules",
  },

  feature_flags: {
    key: "feature_flags",
    navLabel: "Feature Flags",
    synonyms: ["FEATURE FLAGS", "Features"],
    panelSelector: "#feature-flags",
    ready: { selector: "#payroll_xray" },
    navSelector: 'a[href="#feature-flags"]',
    description: "Feature toggles and flags",
  },
};

function allowedKeys() {
  return Object.keys(MODULES);
}

function getSpec(key) {
  return MODULES[key] || null;
}

module.exports = { MODULES, allowedKeys, getSpec };


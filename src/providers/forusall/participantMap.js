// src/providers/forusall/participantMap.js
// Mapeo estable de módulos (keys del API) -> metadata para localizar paneles y (si hiciera falta) navegar.

const MODULES = {
  census: {
    key: 'census',
    navLabel: 'Census',
    synonyms: ['CENSUS', 'Employee Census'],
    panelSelector: '#census',
    ready: { selector: '#census-details' }
    // navSelector: 'a[href="#census"]'
  },

  savings_rate: {
    key: 'savings_rate',
    navLabel: 'Savings Rate',
    synonyms: ['Savings Rate', 'SAVINGS RATE'],
    panelSelector: '#savings-rate',
    ready: { selector: '#savings-rate-details' }
    // navSelector: 'a[href="#savings-rate"]'
  },

  plan_details: {
    key: 'plan_details',
    navLabel: 'Plan Details',
    synonyms: ['Plan Details', 'PLAN DETAILS', 'Plan'],
    panelSelector: '#plan',
    ready: { selector: '#plan-details' }
    // navSelector: 'a[href="#plan"]'
  },

  loans: {
    key: 'loans',
    navLabel: 'Loans',
    synonyms: ['Loan', 'LOAN', 'Loans'],
    panelSelector: '#loan',
    ready: { selector: '#loan-details' }
    // navSelector: 'a[href="#loan"]'
  },

  payroll: {
    key: 'payroll',
    navLabel: 'Payroll',
    synonyms: ['PAYROLL'],
    panelSelector: '#payroll',
    ready: { selector: '#payroll-details' }
    // navSelector: 'a[href="#payroll"]'
  },

  communications: {
    key: 'communications',
    navLabel: 'Communications',
    synonyms: ['COMMS', 'Communications'],
    panelSelector: '#comms',
    ready: { selector: '#comms' }
    // navSelector: 'a[href="#comms"]'
  },

  documents: {
    key: 'documents',
    navLabel: 'Documents',
    synonyms: ['DOCS', 'Documents'],
    panelSelector: '#docs',
    ready: { selector: '#docs' }
    // navSelector: 'a[href="#docs"]'
  },

  mfa: {
    key: 'mfa',
    navLabel: 'MFA',
    synonyms: ['MFA', 'Multi-Factor'],
    panelSelector: '#mfa',
    ready: { selector: '#mfa' }
    // navSelector: 'a[href="#mfa"]'
  },
};

function allowedKeys() { return Object.keys(MODULES); }
function getSpec(key) { return MODULES[key] || null; }

module.exports = { MODULES, allowedKeys, getSpec };

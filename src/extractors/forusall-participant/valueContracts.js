'use strict';

function money(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = String(value ?? '').trim().match(/^\$?\s*(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)$/);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

function balance(value) {
  const raw = String(value ?? '').trim();
  const date = raw.match(/(?:\(?\s*as\s+of\s+|\(\s*)(\d{4}-\d{2}-\d{2})\s*\)?\s*$/i);
  const amount = money(date ? raw.slice(0, date.index).trim() : raw);
  const asOf = date && !Number.isNaN(Date.parse(date[1])) && new Date(date[1]).toISOString().slice(0, 10) === date[1] ? date[1] : null;
  return { amount, asOf, dataState: amount === null || (date && !asOf) ? 'parse_error' : 'ok' };
}

module.exports = { money, balance };

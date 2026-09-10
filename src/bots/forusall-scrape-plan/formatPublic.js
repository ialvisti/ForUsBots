// Aplana el shape interno de scrape-plan al shape público.
// Interno: result.data = { planId, url, modulesRequested, modules:[{key,status,data,...}], notes?, planHistory? }
// Público: { planId, [moduleKey]: moduleData, notes?, planHistory? }
module.exports = function formatPublic(result) {
  if (!result || !result.data) return null;

  const out = { planId: result.data.planId || null };

  for (const m of result.data.modules || []) {
    if (m && m.status === "ok" && m.data && m.key) {
      out[m.key] = m.data;
    }
  }

  if (result.data.notes != null) {
    out.notes = result.data.notes;
  }

  if (result.data.planHistory != null) {
    out.planHistory = result.data.planHistory;
  }

  return out;
};

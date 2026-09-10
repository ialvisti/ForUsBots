// Aplana el shape interno de scrape-participant al shape público.
// Interno: result.data = { participantId, url, modulesRequested, modules:[{key,status,data,...}], full? }
// Público: { participantId, [moduleKey]: moduleData, ... }
module.exports = function formatPublic(result) {
  if (!result || !result.data) return null;

  const out = { participantId: result.data.participantId || null };

  const modules = {};
  for (const m of result.data.modules || []) {
    if (m?.key && m.diagnostics) modules[m.key] = m.diagnostics;
    if (m && ["ok", "partial"].includes(m.status) && m.data && m.key) {
      out[m.key] = m.data;
    }
  }

  if (Object.keys(modules).length) out.extractionDiagnostics = { schemaVersion: 1, modules };

  return out;
};

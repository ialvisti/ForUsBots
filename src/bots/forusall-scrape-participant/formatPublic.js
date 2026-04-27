// Aplana el shape interno de scrape-participant al shape público.
// Interno: result.data = { participantId, url, modulesRequested, modules:[{key,status,data,...}], full? }
// Público: { participantId, [moduleKey]: moduleData, ... }
module.exports = function formatPublic(result) {
  if (!result || !result.data) return null;

  const out = { participantId: result.data.participantId || null };

  for (const m of result.data.modules || []) {
    if (m && m.status === "ok" && m.data && m.key) {
      out[m.key] = m.data;
    }
  }

  return out;
};

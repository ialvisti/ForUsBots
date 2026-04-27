// Aplana update-plan al shape público.
// Interno: result.data = { planId, url, applied, skipped, notePreview, evidencePath }
// Público: { planId, applied:{...}, skipped:[...] }
module.exports = function formatPublic(result) {
  if (!result || !result.data) return null;

  const d = result.data;

  let applied = {};
  if (d.applied && typeof d.applied === "object" && !Array.isArray(d.applied)) {
    applied = d.applied;
  }

  return {
    planId: d.planId || null,
    applied,
    skipped: Array.isArray(d.skipped) ? d.skipped : [],
  };
};

// Aplana users-management al shape público.
// Interno: result.data = {
//   mode, userId, flashNotice, applied[], skipped[], mfaReset|null,
//   submitDialogs[], notePreview, evidencePath
// }
module.exports = function formatPublic(result) {
  if (!result || !result.data) return null;
  const d = result.data;
  return {
    mode: d.mode || null,
    userId: d.userId ?? null,
    flashNotice: d.flashNotice || null,
    applied: Array.isArray(d.applied) ? d.applied : [],
    skipped: Array.isArray(d.skipped) ? d.skipped : [],
    mfaReset: d.mfaReset || null,
  };
};

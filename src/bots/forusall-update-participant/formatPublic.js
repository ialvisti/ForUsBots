// Aplana update-participant al shape público.
// Interno: result.data = { participantId, participantUrl, updatesApplied, confirmMode, confirmText }
// `updatesApplied` puede traer { applied:{...}, skipped:[...] } o el objeto plano.
// Público: { participantId, applied:{...}, skipped:[...] }
module.exports = function formatPublic(result) {
  if (!result || !result.data) return null;

  const d = result.data;
  const ua = d.updatesApplied;

  let applied = {};
  let skipped = [];

  if (ua && typeof ua === "object" && !Array.isArray(ua)) {
    if (ua.applied && typeof ua.applied === "object") {
      applied = ua.applied;
      skipped = Array.isArray(ua.skipped) ? ua.skipped : [];
    } else {
      applied = ua;
    }
  }

  return {
    participantId: d.participantId || null,
    applied,
    skipped,
  };
};

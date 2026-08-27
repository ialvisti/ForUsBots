// Aplana update-participant al shape público.
// Interno: result.data = { participantId, participantUrl, updatesApplied, confirmMode, confirmText }
// `updatesApplied` puede traer { applied:{...}, skipped:[...] } o el objeto plano.
// Público: { participantId, updateStatus, statusMessage, applied:{...}, skipped:[...] }
module.exports = function formatPublic(result, record) {
  if (!result || !result.data) return null;

  const outerData = result.data;
  const isLegacyNested =
    outerData &&
    typeof outerData === "object" &&
    !Array.isArray(outerData) &&
    typeof outerData.code === "string" &&
    outerData.data &&
    typeof outerData.data === "object" &&
    !Array.isArray(outerData.data);
  const d = isLegacyNested ? outerData.data : outerData;
  const ua = d.updatesApplied;
  const meta = (record && record.meta) || {};

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
    participantId: d.participantId ?? meta.participantId ?? null,
    updateStatus:
      (isLegacyNested && outerData.code) || result.code || null,
    statusMessage: result.message || d.confirmText || null,
    applied,
    skipped,
  };
};

// Aplana vault-file-upload al shape público.
// Interno: result.data = { postSubmitResult, clearedSnapshot, evidence }
// record.meta = { planId, filename, section, caption, status, effectiveDate }
// Público: { planId, fileName, status }
module.exports = function formatPublic(result, record) {
  const meta = (record && record.meta) || {};
  const data = (result && result.data) || {};

  return {
    planId: meta.planId != null ? meta.planId : null,
    fileName: meta.filename || null,
    status:
      data.postSubmitResult === "cleared"
        ? "audit_ready"
        : data.postSubmitResult || meta.status || null,
  };
};

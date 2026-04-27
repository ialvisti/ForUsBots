// Aplana mfa-reset al shape público.
// Interno: result.data = { participantId, confirmMessage, alertMessage, evidencePath }
// y result.code in {MFA_RESET_OK, MFA_NOT_ENROLLED, MFA_RESET_ERROR}
// Público: { participantId, reset: boolean }
module.exports = function formatPublic(result, record) {
  const data = (result && result.data) || {};
  const code = (result && result.code) || null;
  const meta = (record && record.meta) || {};

  return {
    participantId: data.participantId || meta.participantId || null,
    reset: code === "MFA_RESET_OK",
  };
};

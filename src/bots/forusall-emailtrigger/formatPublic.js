// Aplana email-trigger al shape público.
// Interno: result.data = details del flow handler (varía por emailType).
// record.meta = { planId, emailType }
// Público: { planId, emailType, recipientsTargeted? }
module.exports = function formatPublic(result, record) {
  const data = (result && result.data) || {};
  const meta = (record && record.meta) || {};

  const out = {
    planId: meta.planId != null ? meta.planId : null,
    emailType: meta.emailType || null,
  };

  const recipients =
    data.recipientsTargeted ??
    data.targeted ??
    data.count ??
    data.recipients ??
    null;

  if (typeof recipients === "number") {
    out.recipientsTargeted = recipients;
  }

  return out;
};

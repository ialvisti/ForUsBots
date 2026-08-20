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

  if (meta.reportYear != null) out.reportYear = meta.reportYear;
  if (meta.mode) out.mode = meta.mode;

  const recipients =
    data.recipientsTargeted ??
    data.targeted ??
    data.count ??
    data.recipients ??
    null;

  if (typeof recipients === "number") {
    out.recipientsTargeted = recipients;
  }

  const gate = data.documentGate;
  const gateHashes = Array.isArray(gate?.pdfSha256s)
    ? gate.pdfSha256s.map((value) => String(value || ""))
    : [];
  const hashesValid =
    gateHashes.length > 0 &&
    gateHashes.every((value) => /^[a-f0-9]{64}$/.test(value)) &&
    JSON.stringify(gateHashes) ===
      JSON.stringify([...new Set(gateHashes)].sort());
  if (
    gate &&
    gate.version === "v1" &&
    gate.verified === true &&
    gate.documentCount === gateHashes.length &&
    hashesValid &&
    /^[a-f0-9]{64}$/.test(String(gate.aggregateSha256 || ""))
  ) {
    out.documentGate = {
      version: "v1",
      verified: true,
      documentCount: gate.documentCount,
      pdfSha256s: gateHashes,
      aggregateSha256: gate.aggregateSha256,
      manifestStable: gate.manifestStable === true,
      objectVersionStable: gate.objectVersionStable === true,
    };
    if (
      Array.isArray(gate.evidence) &&
      gate.evidence.length === gateHashes.length &&
      gate.evidence.every(
        (item, index) =>
          item &&
          item.pdfSha256 === gateHashes[index] &&
          (item.provider === "document_ai" || item.provider === "vision") &&
          Number.isSafeInteger(item.pagesInspected) &&
          item.pagesInspected > 0
      )
    ) {
      out.documentGate.evidence = gate.evidence.map((item) => ({
        pdfSha256: item.pdfSha256,
        provider: item.provider,
        pagesInspected: item.pagesInspected,
        totalPages: item.totalPages,
        truncated: item.truncated,
        documentMarkerMatch: item.documentMarkerMatch,
        planNameScore: item.planNameScore,
        einMatch: item.einMatch,
        yearMatch: item.yearMatch,
      }));
    }
  }
  if (typeof data.emailTriggered === "boolean") {
    out.emailTriggered = data.emailTriggered;
  }

  return out;
};

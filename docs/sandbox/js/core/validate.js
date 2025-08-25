// docs/sandbox/js/core/validate.js
// Lanza Error() en invalidaciones y devuelve { base, headers, bodyPromise }
export function validateBasicsForRun({
  ep,
  baseUrl,
  token,
  xFilename,
  metaStr,
  pdfFile,
}) {
  const base = (baseUrl.value || window.location.origin).replace(/\/$/, "");
  const headers = {};
  headers["Content-Type"] =
    ep.group === "upload" ? "application/pdf" : "application/json";

  if (ep.needs.token) {
    if (!token.value)
      throw new Error("x-auth-token is required for this endpoint.");
    headers["x-auth-token"] = (token.value || "").trim();
  }

  if (ep.needs.xfilename) {
    const xf = (xFilename.value || "").trim();
    if (!xf) throw new Error("Fill in x-filename.");
    if (!/\.pdf$/i.test(xf))
      throw new Error("x-filename must end with '.pdf'.");
    headers["x-filename"] = xf;
  }

  if (ep.needs.meta) {
    headers["x-meta"] = metaStr;
    const meta = JSON.parse(metaStr);
    const f = meta.formData || {};
    const missing = [];
    if (meta.planId === undefined || meta.planId === null || meta.planId === "")
      missing.push("planId");
    ["section", "caption", "status", "effectiveDate"].forEach((k) => {
      if (!f[k] || String(f[k]).trim() === "") missing.push("formData." + k);
    });
    if (
      (f.caption || "").toLowerCase() === "other" &&
      (!f.captionOtherText || String(f.captionOtherText).trim() === "")
    ) {
      missing.push("formData.captionOtherText");
    }
    if (missing.length)
      throw new Error("Missing fields: " + missing.join(", "));
  }

  let bodyPromise = null;
  if (ep.group === "upload") {
    const file = pdfFile.files && pdfFile.files[0];
    if (ep.needs.pdf && !file) throw new Error("Select a PDF to test.");
    if (file) bodyPromise = file.arrayBuffer();

    const meta = metaStr ? JSON.parse(metaStr) : null;
    if (
      file &&
      meta &&
      /^document\s+missing$/i.test(meta.formData?.status || "")
    ) {
      throw new Error(
        "Status 'Document Missing' is not valid when a file is attached (422). Use 'Audit Ready'."
      );
    }
  }

  return { base, headers, bodyPromise };
}

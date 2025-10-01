// docs/sandbox/js/core/validate.js
// Throws Error() on invalid cases and returns { base, headers, bodyPromise }

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

  // For uploads, send raw binary; backend doesn't require a specific type.
  headers["Content-Type"] =
    ep.group === "upload" ? "application/octet-stream" : "application/json";

  const ALLOWED_EXTS = new Set([".pdf", ".xlsx", ".csv", ".xls"]);
  const getExt = (name) => {
    const m = String(name || "")
      .trim()
      .match(/(\.[^.]+)$/);
    return m ? m[1].toLowerCase() : "";
  };

  if (ep.needs.token) {
    if (!token.value)
      throw new Error("x-auth-token is required for this endpoint.");
    headers["x-auth-token"] = (token.value || "").trim();
  }

  let xf = "";
  let xfExt = "";
  if (ep.needs.xfilename) {
    xf = (xFilename.value || "").trim();
    if (!xf) throw new Error("Fill in x-filename.");

    xfExt = getExt(xf);
    if (!xfExt) {
      throw new Error(
        "x-filename must include an extension. Allowed: .pdf, .xlsx, .csv, .xls."
      );
    }
    if (!ALLOWED_EXTS.has(xfExt)) {
      throw new Error(
        "Invalid x-filename extension. Allowed: .pdf, .xlsx, .csv, .xls."
      );
    }
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

    // Keep the flag name 'pdf' for backward compatibility, but allow any of the supported types.
    if (ep.needs.pdf && !file) throw new Error("Select a file to test.");

    if (file) {
      const fileExt = getExt(file.name);
      if (!ALLOWED_EXTS.has(fileExt)) {
        throw new Error(
          "Selected file type is not allowed. Allowed: .pdf, .xlsx, .csv, .xls."
        );
      }
      // If x-filename is provided, ensure its extension matches the selected file's extension
      if (ep.needs.xfilename && xfExt && fileExt && xfExt !== fileExt) {
        throw new Error(
          `x-filename extension (${xfExt}) must match the selected file's extension (${fileExt}).`
        );
      }
      bodyPromise = file.arrayBuffer();
    }

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

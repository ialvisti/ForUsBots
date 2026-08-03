// docs/sandbox/js/core/validate.js
// Lanza Error() en invalidaciones y devuelve { base, headers, bodyPromise }
export function validateBasicsForRun({
  ep,
  baseUrl,
  token,
  xFilename,
  metaStr,
  pdfFile,
  jobId,
}) {
  const base = (baseUrl.value || window.location.origin).replace(/\/$/, "");
  const headers = {};

  // Para uploads, mandamos binario; el backend no requiere tipo específico.
  headers["Content-Type"] =
    ep.group === "upload" ? "application/octet-stream" : "application/json";

  const allowedExts = new Set(ep.allowedExts || [".pdf"]);
  const allowedList = Array.from(allowedExts).join(", ");
  const getExt = (name) => {
    const m = String(name || "")
      .trim()
      .match(/(\.[^.]+)$/);
    return m ? m[1].toLowerCase() : "";
  };

  if (ep.needs.token) {
    if (!token.value)
      throw new Error("x-auth-token es obligatorio para este endpoint.");
    headers["x-auth-token"] = (token.value || "").trim();
  }

  if (ep.needs.jobId && !String(jobId?.value || "").trim()) {
    throw new Error("jobId es obligatorio para este endpoint.");
  }

  let xf = "";
  let xfExt = "";
  if (ep.needs.xfilename) {
    xf = (xFilename.value || "").trim();
    if (!xf) throw new Error("Completa x-filename.");

    xfExt = getExt(xf);
    if (!xfExt) {
      throw new Error(
        `x-filename debe incluir una extensión. Permitidas: ${allowedList}.`
      );
    }
    if (!allowedExts.has(xfExt)) {
      throw new Error(
        `Extensión de x-filename no válida. Permitidas: ${allowedList}.`
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
      throw new Error("Faltan campos: " + missing.join(", "));
  }

  let bodyPromise = null;
  if (ep.group === "upload") {
    const file = pdfFile.files && pdfFile.files[0];

    // Mantenemos el flag 'pdf' por compatibilidad, pero permitimos más tipos.
    if (ep.needs.pdf && !file) throw new Error("Selecciona un archivo para probar.");

    if (file) {
      const fileExt = getExt(file.name);
      if (!allowedExts.has(fileExt)) {
        throw new Error(
          `El tipo de archivo no está permitido. Permitidos: ${allowedList}.`
        );
      }
      // Si viene x-filename, sus extensiones deben coincidir
      if (ep.needs.xfilename && xfExt && fileExt && xfExt !== fileExt) {
        throw new Error(
          `La extensión de x-filename (${xfExt}) debe coincidir con la del archivo seleccionado (${fileExt}).`
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
        "El estado 'Document Missing' no es válido cuando hay un archivo adjunto (422). Usa 'Audit Ready'."
      );
    }
  }

  return { base, headers, bodyPromise };
}

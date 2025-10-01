// src/bots/forusall-upload/controller.js
const fs = require("fs/promises");
const path = require("path");
const { FIXED } = require("../../providers/forusall/config");
const runFlow = require("./runFlow");
const { setPdfTitle } = require("../../engine/utils/pdf"); // PDF internal title
const queue = require("../../engine/queue"); // queue and status

// 422 quick check if they send "Document Missing" with an attached file
function prevalidate(metaIn, hasBinary) {
  const f = metaIn?.formData || {};
  const status = String(f.status || "").trim();
  if (
    !metaIn?.options?.skipPrevalidation &&
    hasBinary &&
    /^document\s+missing$/i.test(status)
  ) {
    const err = new Error(
      "Status 'Document Missing' is not valid when a file is attached"
    );
    err.http = 422;
    err.payload = {
      ok: false,
      errorType: "validation",
      error: err.message,
      hint: "Use 'Audit Ready' or another status allowed by the portal",
    };
    throw err;
  }
}

const ALLOWED_EXTS = new Set([".pdf", ".xlsx", ".csv", ".xls"]);
function mimeFromExt(ext) {
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".xls":
      return "application/vnd.ms-excel";
    case ".csv":
      return "text/csv";
    default:
      return "application/octet-stream";
  }
}

module.exports = async function controller(req, res) {
  let warnings = [];
  try {
    const filenameHdr = req.header("x-filename");
    if (!filenameHdr) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing header x-filename", warnings });
    }

    // ✅ Early filename validation: must include an allowed extension (case-insensitive)
    const safeBase = path.basename(String(filenameHdr).trim());
    const ext = path.extname(safeBase).toLowerCase();
    if (!ext) {
      return res.status(400).json({
        ok: false,
        errorType: "validation",
        error:
          "Header x-filename must include a file extension (e.g., 'document.pdf')",
        hint: "Valid examples: x-filename: report_2025-08-18.pdf | payroll_2025-08-18.xlsx",
        warnings,
      });
    }
    if (!ALLOWED_EXTS.has(ext)) {
      return res.status(400).json({
        ok: false,
        errorType: "validation",
        error:
          "Invalid file type. Allowed extensions are: .pdf, .xlsx, .csv, .xls",
        hint: "Examples: contract_1704-02-29.pdf | data_upload.xls | export.csv | template.xlsx",
        warnings,
      });
    }

    const metaHdr = req.header("x-meta");
    if (!metaHdr) {
      return res
        .status(400)
        .json({ ok: false, error: "Missing header x-meta", warnings });
    }

    // 1) Parse
    let metaIn;
    try {
      metaIn = JSON.parse(metaHdr);
    } catch (err) {
      return res.status(400).json({
        ok: false,
        errorType: "parse",
        error: "x-meta is not valid JSON",
        parseMessage: err && err.message ? err.message : String(err),
        hint: "Send x-meta in a single line, double-quoted JSON, without single quotes or line breaks.",
        exampleMeta: {
          planId: 580,
          formData: {
            section: "CONTRACTS & AGREEMENTS",
            caption: "Recordkeeper Agreement",
            status: "Audit Ready",
            effectiveDate: "2025-05-02",
            captionOtherText: "(Only if caption=Other)",
          },
        },
        warnings,
      });
    }

    // 2) Minimal validations (accumulated)
    const missing = [];
    if (
      metaIn.planId === undefined ||
      metaIn.planId === null ||
      String(metaIn.planId).trim?.() === ""
    )
      missing.push("planId");
    if (!metaIn.formData || typeof metaIn.formData !== "object") {
      missing.push("formData");
    } else {
      const f = metaIn.formData;
      const reqKeys = ["section", "caption", "status", "effectiveDate"];
      for (const k of reqKeys) {
        if (f[k] === undefined || f[k] === null || String(f[k]).trim() === "") {
          missing.push(`formData.${k}`);
        }
      }
      const isOther =
        String(f.caption || "")
          .trim()
          .toLowerCase() === "other";
      if (
        isOther &&
        (!f.captionOtherText || String(f.captionOtherText).trim() === "")
      ) {
        missing.push("formData.captionOtherText (required when caption=Other)");
      }
    }

    if (missing.length) {
      return res.status(400).json({
        ok: false,
        errorType: "validation",
        error: "Missing or empty fields in x-meta",
        missing,
        hint: "Make sure to send all required fields in x-meta (single line JSON).",
        exampleMeta: {
          planId: 580,
          formData: {
            section: "CONTRACTS & AGREEMENTS",
            caption: "Recordkeeper Agreement",
            status: "Audit Ready",
            effectiveDate: "2025-05-02",
            captionOtherText: "(Only if caption=Other)",
          },
        },
        warnings,
      });
    }

    // 3) Binary
    if (!req.body || !req.body.length) {
      return res
        .status(400)
        .json({
          ok: false,
          error: "Empty body (Binary file missing)",
          warnings,
        });
    }

    // 4) Warning for captionOtherText when caption != Other
    const isOther =
      String(metaIn.formData.caption || "")
        .trim()
        .toLowerCase() === "other";
    if (
      !isOther &&
      metaIn.formData.captionOtherText &&
      String(metaIn.formData.captionOtherText).trim() !== ""
    ) {
      if (!(metaIn.options && metaIn.options.suppressCaptionOtherMismatch)) {
        warnings.push(
          "captionOtherText was ignored because caption != 'Other'"
        );
      }
    }

    // 5) Pre-validation 422 (business rule)
    prevalidate(metaIn, !!req.body.length);

    // 6) Save temp binary with a UNIQUE PREFIX to avoid collisions
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempName = `${unique}__${safeBase}`;
    const filePath = path.join("/tmp", tempName);
    await fs.writeFile(filePath, req.body);

    // 6.1) Update internal PDF title ONLY for PDF
    const isPdf = ext === ".pdf";
    if (isPdf) {
      try {
        const title = path.parse(safeBase).name;
        await setPdfTitle(filePath, title);
      } catch (e) {
        warnings.push(`Unable to update the internal PDF title: ${e.message}`);
      }
    }

    // 6.2) Read the (possibly updated) file for upload preserving ORIGINAL NAME
    let fileBuffer;
    try {
      fileBuffer = await fs.readFile(filePath);
    } catch (e) {
      return res
        .status(500)
        .json({
          ok: false,
          error: `Unable to prepare the file: ${e.message}`,
          warnings,
        });
    }

    // === createdBy resolution (robust) ===
    const a = req.auth || {};
    const u = (a && a.user) || {};
    const createdBy =
      metaIn &&
      typeof metaIn === "object" &&
      metaIn.createdBy &&
      typeof metaIn.createdBy === "object"
        ? metaIn.createdBy
        : {
            name: u.name || null,
            email: u.email || null,
            id: u.id || null,
            role: a.role || (a.isAdmin ? "admin" : "user"),
            at: new Date().toISOString(),
          };

    // 7) Build final META with provider fixed config (including createdBy)
    const meta = {
      loginUrl: FIXED.loginUrl,
      uploadUrlTemplate: FIXED.uploadUrlTemplate,
      selectors: FIXED.selectors,
      planId: metaIn.planId,
      formData: metaIn.formData,
      options: { ...FIXED.options, ...(metaIn.options || {}) },
      createdBy,
    };

    // 8) Submit (we return 202 immediately) + cleanup /tmp after finishing
    const minimalForm = metaIn.formData || {};
    const jobMeta = {
      planId: metaIn.planId,
      filename: safeBase,
      section: minimalForm.section,
      caption: minimalForm.caption,
      status: minimalForm.status,
      effectiveDate: minimalForm.effectiveDate,
      createdBy,
    };

    const mimeType = mimeFromExt(ext);

    const accepted = queue.submit({
      botId: "vault-file-upload",
      meta: jobMeta,
      run: async (jobCtx) => {
        try {
          // Prefer filePayload to preserve the original file name in the upload
          return await runFlow({
            meta,
            localFilePath: filePath, // (compat; not used if filePayload is present)
            filePayload: { name: safeBase, mimeType, buffer: fileBuffer },
            warnings,
            jobCtx, // for stage tracking if runFlow uses it
          });
        } finally {
          try {
            await fs.unlink(filePath);
          } catch {}
        }
      },
    });

    // 202 Accepted + Location to the job
    res.set("Location", `/forusbot/jobs/${accepted.jobId}`);
    return res.status(202).json({
      ok: true,
      jobId: accepted.jobId,
      acceptedAt: accepted.acceptedAt,
      queuePosition: accepted.queuePosition,
      estimate: accepted.estimate,
      capacitySnapshot: accepted.capacitySnapshot,
    });
  } catch (err) {
    if (err.http === 422 && err.payload) {
      return res.status(422).json({ ...err.payload, warnings });
    }
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message, warnings });
  }
};

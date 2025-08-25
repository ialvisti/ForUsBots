// src/bots/forusall-upload/controller.js
const fs = require('fs/promises');
const path = require('path');
const { FIXED } = require('../../providers/forusall/config');
const runFlow = require('./runFlow');
const { setPdfTitle } = require('../../engine/utils/pdf'); // título interno del PDF
const queue = require('../../engine/queue'); // cola y estado

// 422 rápido si envían “Document Missing” con archivo adjunto
function prevalidate(metaIn, hasBinary) {
  const f = metaIn?.formData || {};
  const status = String(f.status || '').trim();
  if (!metaIn?.options?.skipPrevalidation && hasBinary && /^document\s+missing$/i.test(status)) {
    const err = new Error("Status 'Document Missing' no es válido cuando se adjunta un archivo");
    err.http = 422;
    err.payload = {
      ok: false,
      errorType: 'validation',
      error: err.message,
      hint: "Usa 'Audit Ready' u otro estado permitido por el portal",
    };
    throw err;
  }
}

module.exports = async function controller(req, res) {
  let warnings = [];
  try {
    const filenameHdr = req.header('x-filename');
    if (!filenameHdr) {
      return res.status(400).json({ ok: false, error: 'Falta header x-filename', warnings });
    }

    // ✅ Validación temprana del nombre: debe traer extensión .pdf (case-insensitive)
    const safeBase = path.basename(String(filenameHdr).trim());
    const ext = path.extname(safeBase).toLowerCase();
    if (!ext) {
      return res.status(400).json({
        ok: false,
        errorType: 'validation',
        error: "Header x-filename debe incluir la extensión del archivo (p. ej. 'documento.pdf')",
        hint: "Ejemplo válido: x-filename: reporte_2025-08-18.pdf",
        warnings,
      });
    }
    if (ext !== '.pdf') {
      return res.status(400).json({
        ok: false,
        errorType: 'validation',
        error: "Solo se aceptan PDF: x-filename debe terminar en '.pdf'",
        hint: "Ejemplo válido: x-filename: contrato_1704-02-29.pdf",
        warnings,
      });
    }

    const metaHdr = req.header('x-meta');
    if (!metaHdr) {
      return res.status(400).json({ ok: false, error: 'Falta header x-meta', warnings });
    }

    // 1) Parse
    let metaIn;
    try {
      metaIn = JSON.parse(metaHdr);
    } catch (err) {
      return res.status(400).json({
        ok: false,
        errorType: 'parse',
        error: 'x-meta no es JSON válido',
        parseMessage: err && err.message ? err.message : String(err),
        hint: 'Envía x-meta en UNA sola línea, con comillas dobles, sin comillas simples y sin saltos de línea.',
        exampleMeta: {
          planId: 580,
          formData: {
            section: 'CONTRACTS & AGREEMENTS',
            caption: 'Recordkeeper Agreement',
            status: 'Audit Ready',
            effectiveDate: '2025-05-02',
            captionOtherText: '(solo si caption=Other)'
          }
        },
        warnings,
      });
    }

    // 2) Validaciones mínimas y acumuladas
    const missing = [];
    if (metaIn.planId === undefined || metaIn.planId === null || String(metaIn.planId).trim?.() === '') missing.push('planId');
    if (!metaIn.formData || typeof metaIn.formData !== 'object') {
      missing.push('formData');
    } else {
      const f = metaIn.formData;
      const reqKeys = ['section', 'caption', 'status', 'effectiveDate'];
      for (const k of reqKeys) {
        if (f[k] === undefined || f[k] === null || String(f[k]).trim() === '') {
          missing.push(`formData.${k}`);
        }
      }
      const isOther = String(f.caption || '').trim().toLowerCase() === 'other';
      if (isOther && (!f.captionOtherText || String(f.captionOtherText).trim() === '')) {
        missing.push('formData.captionOtherText (required when caption=Other)');
      }
    }

    if (missing.length) {
      return res.status(400).json({
        ok: false,
        errorType: 'validation',
        error: 'Campos faltantes o vacíos en x-meta',
        missing,
        hint: 'Asegúrate de enviar todos los campos requeridos en x-meta (una sola línea JSON).',
        exampleMeta: {
          planId: 580,
          formData: {
            section: 'CONTRACTS & AGREEMENTS',
            caption: 'Recordkeeper Agreement',
            status: 'Audit Ready',
            effectiveDate: '2025-05-02',
            captionOtherText: '(solo si caption=Other)'
          }
        },
        warnings,
      });
    }

    // 3) Binario
    if (!req.body || !req.body.length) {
      return res.status(400).json({ ok: false, error: 'Body vacío (faltó el binario)', warnings });
    }

    // 4) Warning para captionOtherText cuando caption != Other
    const isOther = String(metaIn.formData.caption || '').trim().toLowerCase() === 'other';
    if (!isOther && metaIn.formData.captionOtherText && String(metaIn.formData.captionOtherText).trim() !== '') {
      if (!(metaIn.options && metaIn.options.suppressCaptionOtherMismatch)) {
        warnings.push("captionOtherText fue ignorado porque caption != 'Other'");
      }
    }

    // 5) Pre-validación 422 (regla de negocio)
    prevalidate(metaIn, !!req.body.length);

    // 6) Guardar binario temporal con PREFIJO ÚNICO para evitar colisiones
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempName = `${unique}__${safeBase}`;
    const filePath = path.join('/tmp', tempName);
    await fs.writeFile(filePath, req.body);

    // 6.1) Actualizar título interno del PDF al nombre original (sin extensión)
    try {
      const title = path.parse(safeBase).name;
      await setPdfTitle(filePath, title);
    } catch (e) {
      warnings.push(`No se pudo actualizar el título interno del PDF: ${e.message}`);
    }

    // 6.2) Leer el archivo ya titulado para subir con NOMBRE ORIGINAL (no el temp)
    let fileBuffer;
    try {
      fileBuffer = await fs.readFile(filePath);
    } catch (e) {
      return res.status(500).json({ ok: false, error: `No se pudo preparar el archivo: ${e.message}`, warnings });
    }

    // === NUEVO: resolver createdBy de forma robusta ===
    //  - Preferimos lo que metió el middleware en metaIn.createdBy (server-trusted).
    //  - Fallback a req.auth por si viniera vacío (defensivo).
    const a = req.auth || {};
    const u = (a && a.user) || {};
    const createdBy =
      (metaIn && typeof metaIn === 'object' && metaIn.createdBy && typeof metaIn.createdBy === 'object')
        ? metaIn.createdBy
        : {
            name: u.name || null,
            email: u.email || null,
            id: u.id || null,
            role: a.role || (a.isAdmin ? 'admin' : 'user'),
            at: new Date().toISOString()
          };

    // 7) Construir META final con config fija del proveedor (incluyendo createdBy)
    const meta = {
      loginUrl: FIXED.loginUrl,
      uploadUrlTemplate: FIXED.uploadUrlTemplate,
      selectors: FIXED.selectors,
      planId: metaIn.planId,
      formData: metaIn.formData,
      options: { ...FIXED.options, ...(metaIn.options || {}) },
      createdBy, // ⬅️ importante para trazabilidad en flow/evidence si se usa
    };

    // 8) Submit (no esperamos el resultado) + cleanup /tmp al terminar
    const minimalForm = metaIn.formData || {};
    const jobMeta = {
      planId: metaIn.planId,
      filename: safeBase,
      section: minimalForm.section,
      caption: minimalForm.caption,
      status: minimalForm.status,
      effectiveDate: minimalForm.effectiveDate,
      createdBy, // ⬅️ clave: queue.submit lo usa para persistir en jobsById
    };

    const accepted = queue.submit({
      botId: 'vault-file-upload',
      meta: jobMeta,
      run: async (jobCtx) => {
        try {
          // Preferimos filePayload para preservar el nombre original en el upload
          return await runFlow({
            meta,
            localFilePath: filePath, // (por compat; no se usará si filePayload está presente)
            filePayload: { name: safeBase, mimeType: 'application/pdf', buffer: fileBuffer },
            warnings,
            jobCtx, // para stage tracking si runFlow lo usa
          });
        } finally {
          try { await fs.unlink(filePath); } catch {}
        }
      },
    });

    // 202 Accepted + Location al job
    res.set('Location', `/forusbot/jobs/${accepted.jobId}`);
    return res.status(202).json({
      ok: true,
      jobId: accepted.jobId,
      acceptedAt: accepted.acceptedAt,
      queuePosition: accepted.queuePosition,
      estimate: accepted.estimate,                // { method, avgDurationSeconds, startSeconds, finishSeconds, startAt, finishAt }
      capacitySnapshot: accepted.capacitySnapshot // { maxConcurrency, running, queued, slotsAvailable }
      // Nota: no incluimos createdBy aquí para no romper clientes; se ve en /jobs y /jobs/:id
    });

  } catch (err) {
    if (err.http === 422 && err.payload) {
      return res.status(422).json({ ...err.payload, warnings });
    }
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message, warnings });
  }
};

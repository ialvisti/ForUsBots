// src/engine/utils/pdf.js
const fs = require('fs/promises');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

function looksLikePdf(buf) {
  // %PDF-1.x al inicio
  return buf && buf.slice(0, 5).toString() === '%PDF-';
}

/**
 * Reescribe el título (Document Info / XMP) de un PDF.
 * - filePath: ruta al PDF
 * - title: nuevo título (recomendado sin extensión)
 */
async function setPdfTitle(filePath, title) {
  const raw = await fs.readFile(filePath);

  // seguridad mínima para no tocar no-PDFs
  if (!looksLikePdf(raw)) {
    throw new Error('El archivo no parece un PDF (cabecera %PDF ausente)');
  }

  const pdfDoc = await PDFDocument.load(raw, { updateMetadata: true });
  // set both info & viewer title bar
  pdfDoc.setTitle(title, { showInWindowTitleBar: true });

  const out = await pdfDoc.save();
  await fs.writeFile(filePath, out);
  return true;
}

module.exports = { setPdfTitle };

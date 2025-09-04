// src/engine/evidence.js
const fs = require("fs/promises");
const path = require("path");

function envBool(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

const EVIDENCE_ENABLED = envBool(process.env.EVIDENCE_ENABLED);

async function ensureDir(p) {
  try {
    await fs.mkdir(p, { recursive: true });
  } catch {}
}

async function saveEvidence(
  page,
  tag,
  { returnEvidenceBase64 = true, saveEvidenceToTmp = true } = {}
) {
  if (!EVIDENCE_ENABLED) {
    // No-op: mantenemos forma del contrato para no romper callers
    return {};
  }
  const folder = "/tmp/evidence";
  if (saveEvidenceToTmp) await ensureDir(folder);
  const file = `${new Date().toISOString().replace(/:/g, "-")}_${tag}.png`;
  const absPath = path.join(folder, file);
  const buf = await page.screenshot({
    fullPage: true,
    path: saveEvidenceToTmp ? absPath : undefined,
  });
  const res = {};
  if (saveEvidenceToTmp) res.path = absPath;
  if (returnEvidenceBase64) res.base64 = buf.toString("base64");
  return res;
}

module.exports = { saveEvidence, ensureDir };

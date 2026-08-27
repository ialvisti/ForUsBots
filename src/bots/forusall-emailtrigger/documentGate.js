"use strict";

const crypto = require("crypto");
const { GoogleAuth } = require("google-auth-library");
const { PDFDocument } = require("pdf-lib");

const PREVIEW_DOCUMENT_HOST =
  "employer-portal-production.s3.amazonaws.com";
const PREVIEW_DOCUMENT_PATH_PREFIX = "/fv_documents/";
const DEFAULT_MAX_PDF_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_DOCUMENTS = 20;
const DEFAULT_MAX_ROWS = 5000;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_PLAN_NAME_MIN_SCORE = 0.82;
const VISUAL_OCR_PROVIDERS = new Set(["document_ai", "vision"]);
const VERIFY_PATH = "/v1/verify-sar";

class DocumentGateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DocumentGateError";
    this.code = code;
  }
}

function positiveEnvInt(env, name, fallback) {
  const value = Number.parseInt(String(env[name] || ""), 10);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function securePlanNameMinScore(env) {
  const raw = String(env.SAR_DOCUMENT_PLAN_NAME_MIN_SCORE || "").trim();
  if (!raw) return DEFAULT_PLAN_NAME_MIN_SCORE;
  const value = Number(raw);
  return Number.isFinite(value) &&
    value >= DEFAULT_PLAN_NAME_MIN_SCORE &&
    value <= 1
    ? value
    : null;
}

function parseVerifierBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.href.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function getDocumentGateConfig(env = process.env) {
  const baseUrl = parseVerifierBaseUrl(env.SAR_DOCUMENT_VERIFIER_URL);
  const audience = parseVerifierBaseUrl(
    env.SAR_DOCUMENT_VERIFIER_AUDIENCE || baseUrl
  );
  const enabled = ["1", "true", "yes", "on"].includes(
    String(env.SAR_DOCUMENT_GATE_ENABLED || "")
      .trim()
      .toLowerCase()
  );
  const planNameMinScore = securePlanNameMinScore(env);
  return Object.freeze({
    configured: Boolean(
      enabled && baseUrl && audience && planNameMinScore !== null
    ),
    enabled,
    baseUrl,
    audience,
    maxPdfBytes: positiveEnvInt(
      env,
      "SAR_PREVIEW_MAX_PDF_BYTES",
      DEFAULT_MAX_PDF_BYTES
    ),
    maxDocuments: positiveEnvInt(
      env,
      "SAR_PREVIEW_MAX_DOCUMENTS",
      DEFAULT_MAX_DOCUMENTS
    ),
    maxRows: positiveEnvInt(env, "SAR_PREVIEW_MAX_ROWS", DEFAULT_MAX_ROWS),
    timeoutMs: positiveEnvInt(
      env,
      "SAR_DOCUMENT_VERIFIER_TIMEOUT_MS",
      DEFAULT_TIMEOUT_MS
    ),
    planNameMinScore,
  });
}

function isDocumentGateConfigured(env = process.env) {
  return getDocumentGateConfig(env).configured;
}

function documentGateFailure(code = "SAR_DOCUMENT_GATE_FAILED") {
  return new DocumentGateError(code, "SAR preview document verification failed");
}

function normalizePreviewDocumentUrl(value) {
  try {
    const url = new URL(String(value || "").replaceAll("&amp;", "&"));
    const decodedPath = decodeURIComponent(url.pathname);
    const pathSegments = decodedPath.split("/");
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== PREVIEW_DOCUMENT_HOST ||
      url.port ||
      url.username ||
      url.password ||
      url.hash ||
      !url.pathname.startsWith(PREVIEW_DOCUMENT_PATH_PREFIX) ||
      url.pathname === PREVIEW_DOCUMENT_PATH_PREFIX ||
      decodedPath.includes("\0") ||
      pathSegments.includes("..")
    ) {
      throw documentGateFailure("SAR_PREVIEW_REFERENCE_REJECTED");
    }
    return url.href;
  } catch (error) {
    if (error instanceof DocumentGateError) throw error;
    throw documentGateFailure("SAR_PREVIEW_REFERENCE_REJECTED");
  }
}

function normalizePreviewManifest(manifest, { maxRows } = {}) {
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw documentGateFailure("SAR_PREVIEW_MANIFEST_INVALID");
  }
  const limit = Number.isSafeInteger(maxRows) ? maxRows : DEFAULT_MAX_ROWS;
  if (manifest.length > limit) {
    throw documentGateFailure("SAR_PREVIEW_MANIFEST_TOO_LARGE");
  }

  return manifest.map((entry, index) => {
    if (
      !entry ||
      entry.rowNumber !== index + 1 ||
      typeof entry.fileName !== "string" ||
      !entry.fileName.trim() ||
      typeof entry.fileUrl !== "string" ||
      !entry.fileUrl.trim()
    ) {
      throw documentGateFailure("SAR_PREVIEW_MANIFEST_INVALID");
    }
    return {
      rowNumber: index + 1,
      fileName: entry.fileName.trim(),
      fileUrl: normalizePreviewDocumentUrl(entry.fileUrl),
    };
  });
}

function fingerprintPreviewManifest(manifest) {
  const canonical = manifest.map(({ rowNumber, fileName, fileUrl }) => ({
    rowNumber,
    fileName,
    fileUrl,
  }));
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical), "utf8")
    .digest("hex");
}

function fingerprintPreviewParticipantSelections(values) {
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.some(
      (value) =>
        typeof value !== "string" ||
        !value ||
        value.length > 200
    ) ||
    new Set(values).size !== values.length
  ) {
    throw documentGateFailure("SAR_PREVIEW_SELECTION_INVALID");
  }
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(values), "utf8")
    .digest("hex");
}

function headerValue(headers, name) {
  return String(headers?.get?.(name) || "").trim();
}

function parseContentLength(headers) {
  const raw = headerValue(headers, "content-length");
  if (!/^\d+$/.test(raw)) {
    throw documentGateFailure("SAR_PREVIEW_OBJECT_METADATA_INVALID");
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw documentGateFailure("SAR_PREVIEW_OBJECT_METADATA_INVALID");
  }
  return value;
}

function readObjectMetadata(response) {
  const etag = headerValue(response.headers, "etag");
  const versionId = headerValue(response.headers, "x-amz-version-id");
  const length = parseContentLength(response.headers);
  if (!etag || !versionId || versionId.toLowerCase() === "null") {
    throw documentGateFailure("SAR_PREVIEW_OBJECT_METADATA_INVALID");
  }
  return { etag, versionId, length };
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch {
    throw documentGateFailure("SAR_DOCUMENT_GATE_NETWORK_FAILED");
  } finally {
    clearTimeout(timeout);
  }
}

async function readBodyLimited(response, maxBytes) {
  const chunks = [];
  let total = 0;
  const body = response.body;
  if (!body) throw documentGateFailure("SAR_PREVIEW_PDF_INVALID");

  if (typeof body.getReader === "function") {
    const reader = body.getReader();
    let finished = false;
    try {
      while (!finished) {
        const { done, value } = await reader.read();
        if (done) {
          finished = true;
          continue;
        }
        const chunk = Buffer.from(value);
        total += chunk.length;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          throw documentGateFailure("SAR_PREVIEW_PDF_TOO_LARGE");
        }
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock?.();
    }
  } else {
    for await (const value of body) {
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) {
        throw documentGateFailure("SAR_PREVIEW_PDF_TOO_LARGE");
      }
      chunks.push(chunk);
    }
  }
  return Buffer.concat(chunks, total);
}

async function downloadPreviewPdf(
  fileUrl,
  {
    fetchImpl = globalThis.fetch,
    maxPdfBytes = DEFAULT_MAX_PDF_BYTES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pdfLoader = PDFDocument.load,
  } = {}
) {
  const normalizedUrl = normalizePreviewDocumentUrl(fileUrl);
  const response = await fetchWithTimeout(
    fetchImpl,
    normalizedUrl,
    {
      method: "GET",
      redirect: "manual",
      headers: { accept: "application/pdf" },
    },
    timeoutMs
  );
  if (!response || response.status !== 200) {
    throw documentGateFailure("SAR_PREVIEW_DOWNLOAD_FAILED");
  }

  const object = readObjectMetadata(response);
  if (object.length > maxPdfBytes) {
    throw documentGateFailure("SAR_PREVIEW_PDF_TOO_LARGE");
  }
  const bytes = await readBodyLimited(response, maxPdfBytes);
  if (
    bytes.length !== object.length ||
    bytes.length < 5 ||
    bytes.subarray(0, 5).toString("ascii") !== "%PDF-"
  ) {
    throw documentGateFailure("SAR_PREVIEW_PDF_INVALID");
  }

  let pageCount;
  try {
    const pdf = await pdfLoader(bytes, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    pageCount = pdf.getPageCount();
    if (!Number.isSafeInteger(pageCount) || pageCount <= 0) {
      throw documentGateFailure("SAR_PREVIEW_PDF_INVALID");
    }
  } catch (error) {
    if (error instanceof DocumentGateError) throw error;
    throw documentGateFailure("SAR_PREVIEW_PDF_INVALID");
  }

  return {
    fileUrl: normalizedUrl,
    bytes,
    pdfSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    pageCount,
    ...object,
  };
}

const authClients = new Map();

async function getAdcIdTokenHeaders(audience, endpoint) {
  let client = authClients.get(audience);
  if (!client) {
    const auth = new GoogleAuth();
    client = await auth.getIdTokenClient(audience);
    authClients.set(audience, client);
  }
  return await client.getRequestHeaders(endpoint);
}

function buildExpectation(expectedDocument, planIdentity) {
  const planNames = Array.isArray(planIdentity?.planNames)
    ? planIdentity.planNames.filter(Boolean)
    : [];
  const ein = String(planIdentity?.ein || "").replace(/\D/g, "");
  if (
    !expectedDocument ||
    expectedDocument.schemaVersion !== 1 ||
    expectedDocument.kind !== "summary_annual_report" ||
    expectedDocument.identitySource !== "forusall_plan" ||
    !Number.isSafeInteger(expectedDocument.planId) ||
    !Number.isSafeInteger(expectedDocument.planYear) ||
    planNames.length === 0 ||
    !/^\d{9}$/.test(ein)
  ) {
    throw documentGateFailure("SAR_DOCUMENT_EXPECTATION_INVALID");
  }
  return {
    schemaVersion: 1,
    planId: expectedDocument.planId,
    planYear: expectedDocument.planYear,
    planNames,
    ein,
  };
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sanitizeVerifierEvidence(
  value,
  pdfSha256,
  {
    planNameMinScore = DEFAULT_PLAN_NAME_MIN_SCORE,
    expectedTotalPages,
  } = {}
) {
  if (
    !Number.isFinite(planNameMinScore) ||
    planNameMinScore < DEFAULT_PLAN_NAME_MIN_SCORE ||
    planNameMinScore > 1 ||
    !Number.isSafeInteger(expectedTotalPages) ||
    expectedTotalPages <= 0 ||
    !value ||
    value.schemaVersion !== 1 ||
    !VISUAL_OCR_PROVIDERS.has(value.provider) ||
    !Number.isSafeInteger(value.pagesInspected) ||
    value.pagesInspected <= 0 ||
    !Number.isSafeInteger(value.totalPages) ||
    value.totalPages <= 0 ||
    value.totalPages !== expectedTotalPages ||
    value.pagesInspected !== value.totalPages ||
    value.truncated !== false ||
    value.documentMarkerMatch !== true ||
    typeof value.planNameScore !== "number" ||
    !Number.isFinite(value.planNameScore) ||
    value.planNameScore < planNameMinScore ||
    value.planNameScore > 1 ||
    value.einMatch !== true ||
    value.yearMatch !== true
  ) {
    throw documentGateFailure("SAR_DOCUMENT_VERIFIER_RESPONSE_INVALID");
  }
  return {
    pdfSha256,
    provider: value.provider,
    pagesInspected: value.pagesInspected,
    totalPages: value.totalPages,
    truncated: value.truncated,
    documentMarkerMatch: value.documentMarkerMatch,
    planNameScore: value.planNameScore,
    einMatch: value.einMatch,
    yearMatch: value.yearMatch,
  };
}

async function verifyPdfWithService(
  downloaded,
  expectation,
  {
    config,
    fetchImpl = globalThis.fetch,
    getAuthHeaders = getAdcIdTokenHeaders,
  }
) {
  if (!config?.configured) {
    throw documentGateFailure("SAR_DOCUMENT_VERIFIER_NOT_CONFIGURED");
  }
  const endpoint = `${config.baseUrl}${VERIFY_PATH}`;
  let authHeaders;
  try {
    authHeaders = await getAuthHeaders(config.audience, endpoint);
  } catch {
    throw documentGateFailure("SAR_DOCUMENT_VERIFIER_AUTH_FAILED");
  }

  const headers = new Headers(authHeaders || {});
  headers.set("content-type", "application/pdf");
  headers.set("x-sar-expectation", base64UrlJson(expectation));
  headers.set("x-sar-pdf-sha256", downloaded.pdfSha256);

  const response = await fetchWithTimeout(
    fetchImpl,
    endpoint,
    {
      method: "POST",
      redirect: "manual",
      headers,
      body: downloaded.bytes,
    },
    config.timeoutMs
  );
  if (!response || response.status !== 200) {
    throw documentGateFailure("SAR_DOCUMENT_VERIFIER_REJECTED");
  }

  let payload;
  try {
    const raw = await readBodyLimited(response, 64 * 1024);
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    throw documentGateFailure("SAR_DOCUMENT_VERIFIER_RESPONSE_INVALID");
  }
  if (
    payload?.schemaVersion !== 1 ||
    payload?.verified !== true ||
    String(payload?.pdfSha256 || "") !== downloaded.pdfSha256
  ) {
    throw documentGateFailure("SAR_DOCUMENT_VERIFIER_REJECTED");
  }
  return sanitizeVerifierEvidence(payload.evidence, downloaded.pdfSha256, {
    planNameMinScore: config.planNameMinScore,
    expectedTotalPages: downloaded.pageCount,
  });
}

async function verifyPreviewDocuments(
  { manifest, expectedDocument, planIdentity },
  dependencies = {}
) {
  const config = dependencies.config || getDocumentGateConfig();
  if (!config.configured) {
    throw documentGateFailure("SAR_DOCUMENT_VERIFIER_NOT_CONFIGURED");
  }
  const normalizedManifest = normalizePreviewManifest(manifest, {
    maxRows: config.maxRows,
  });
  const expectation = buildExpectation(expectedDocument, planIdentity);
  const manifestFingerprint = fingerprintPreviewManifest(normalizedManifest);
  const uniqueUrls = [...new Set(normalizedManifest.map((row) => row.fileUrl))];
  if (uniqueUrls.length > config.maxDocuments) {
    throw documentGateFailure("SAR_PREVIEW_MANIFEST_TOO_LARGE");
  }
  const objects = [];

  for (const fileUrl of uniqueUrls) {
    const downloaded = await downloadPreviewPdf(fileUrl, {
      fetchImpl: dependencies.fetchImpl,
      maxPdfBytes: config.maxPdfBytes,
      timeoutMs: config.timeoutMs,
      pdfLoader: dependencies.pdfLoader,
    });
    const evidence = await verifyPdfWithService(downloaded, expectation, {
      config,
      fetchImpl: dependencies.fetchImpl,
      getAuthHeaders: dependencies.getAuthHeaders,
    });
    objects.push({
      fileUrl: downloaded.fileUrl,
      pdfSha256: downloaded.pdfSha256,
      etag: downloaded.etag,
      versionId: downloaded.versionId,
      length: downloaded.length,
      evidence,
    });
  }

  const pdfSha256s = [...new Set(objects.map((item) => item.pdfSha256))].sort();
  const aggregateSha256 = crypto
    .createHash("sha256")
    .update(pdfSha256s.join("\n"), "utf8")
    .digest("hex");
  const evidenceByHash = new Map(
    objects.map((item) => [item.pdfSha256, item.evidence])
  );
  const evidence = pdfSha256s.map((hash) => evidenceByHash.get(hash));
  if (
    evidence.length !== pdfSha256s.length ||
    evidence.some(
      (item, index) => !item || item.pdfSha256 !== pdfSha256s[index]
    )
  ) {
    throw documentGateFailure("SAR_DOCUMENT_VERIFIER_RESPONSE_INVALID");
  }

  return {
    normalizedManifest,
    manifestFingerprint,
    objects,
    documentGate: {
      version: "v1",
      verified: true,
      documentCount: pdfSha256s.length,
      pdfSha256s,
      aggregateSha256,
      evidence,
    },
  };
}

async function assertPreviewObjectsStable(
  objects,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {}
) {
  if (!Array.isArray(objects) || objects.length === 0) {
    throw documentGateFailure("SAR_PREVIEW_OBJECT_METADATA_INVALID");
  }
  for (const previous of objects) {
    const response = await fetchWithTimeout(
      fetchImpl,
      normalizePreviewDocumentUrl(previous.fileUrl),
      { method: "HEAD", redirect: "manual" },
      timeoutMs
    );
    if (!response || response.status !== 200) {
      throw documentGateFailure("SAR_PREVIEW_OBJECT_CHANGED");
    }
    const current = readObjectMetadata(response);
    if (
      current.etag !== previous.etag ||
      current.versionId !== previous.versionId ||
      current.length !== previous.length
    ) {
      throw documentGateFailure("SAR_PREVIEW_OBJECT_CHANGED");
    }
  }
  return true;
}

module.exports = {
  DocumentGateError,
  PREVIEW_DOCUMENT_HOST,
  PREVIEW_DOCUMENT_PATH_PREFIX,
  VERIFY_PATH,
  assertPreviewObjectsStable,
  buildExpectation,
  downloadPreviewPdf,
  fingerprintPreviewManifest,
  fingerprintPreviewParticipantSelections,
  getDocumentGateConfig,
  isDocumentGateConfigured,
  normalizePreviewDocumentUrl,
  normalizePreviewManifest,
  sanitizeVerifierEvidence,
  verifyPdfWithService,
  verifyPreviewDocuments,
};

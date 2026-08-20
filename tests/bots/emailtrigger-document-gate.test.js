"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { PDFDocument } = require("pdf-lib");

const {
  DocumentGateError,
  assertPreviewObjectsStable,
  downloadPreviewPdf,
  fingerprintPreviewParticipantSelections,
  getDocumentGateConfig,
  normalizePreviewDocumentUrl,
  verifyPreviewDocuments,
} = require("../../src/bots/forusall-emailtrigger/documentGate");

const BASE = "https://sar-verifier-example.run.app";
const PDF_URL =
  "https://employer-portal-production.s3.amazonaws.com/fv_documents/acme.pdf";
const EXPECTED = Object.freeze({
  schemaVersion: 1,
  kind: "summary_annual_report",
  planId: 627,
  planYear: 2025,
  identitySource: "forusall_plan",
});

test("participant selection fingerprint rejects empty or duplicate values", () => {
  assert.match(
    fingerprintPreviewParticipantSelections(["participant-1", "participant-2"]),
    /^[a-f0-9]{64}$/
  );
  assert.throws(
    () => fingerprintPreviewParticipantSelections(["participant-1", ""]),
    { code: "SAR_PREVIEW_SELECTION_INVALID" }
  );
  assert.throws(
    () =>
      fingerprintPreviewParticipantSelections([
        "participant-1",
        "participant-1",
      ]),
    { code: "SAR_PREVIEW_SELECTION_INVALID" }
  );
});
const IDENTITY = Object.freeze({
  planNames: ["Acme 401(k) Plan", "Acme"],
  ein: "123456789",
});

async function makePdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 200]);
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

function pdfResponse(bytes, overrides = {}) {
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-length": String(bytes.length),
      etag: '"fixture-etag"',
      "x-amz-version-id": "fixture-version",
      ...overrides,
    },
  });
}

function verifierResponse(hash, evidence = {}) {
  return new Response(
    JSON.stringify({
      schemaVersion: 1,
      verified: true,
      pdfSha256: hash,
      evidence: {
        schemaVersion: 1,
        provider: "document_ai",
        pagesInspected: 1,
        totalPages: 1,
        truncated: false,
        textChars: 500,
        documentMarkerMatch: true,
        planNameScore: 1,
        einMatch: true,
        yearMatch: true,
        reasons: ["must never propagate"],
        verifiedAt: "2026-08-20T00:00:00Z",
        ...evidence,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function config(overrides = {}) {
  return {
    configured: true,
    enabled: true,
    baseUrl: BASE,
    audience: BASE,
    maxPdfBytes: 1024 * 1024,
    maxDocuments: 20,
    maxRows: 5000,
    timeoutMs: 1000,
    ...overrides,
  };
}

test("gate configuration requires enablement and valid HTTPS URLs", () => {
  assert.equal(
    getDocumentGateConfig({
      SAR_DOCUMENT_GATE_ENABLED: "true",
      SAR_DOCUMENT_VERIFIER_URL: BASE,
    }).configured,
    true
  );
  assert.equal(
    getDocumentGateConfig({
      SAR_DOCUMENT_GATE_ENABLED: "false",
      SAR_DOCUMENT_VERIFIER_URL: BASE,
    }).configured,
    false
  );
  assert.equal(
    getDocumentGateConfig({
      SAR_DOCUMENT_GATE_ENABLED: "true",
      SAR_DOCUMENT_VERIFIER_URL: "http://127.0.0.1:8080",
    }).configured,
    false
  );
});

test("preview URL allowlist rejects alternate hosts and paths", () => {
  assert.equal(normalizePreviewDocumentUrl(PDF_URL), PDF_URL);
  for (const value of [
    "https://evil.example/fv_documents/acme.pdf",
    "https://employer-portal-production.s3.amazonaws.com/other/acme.pdf",
    "https://employer-portal-production.s3.amazonaws.com/fv_documents/../secret",
    "http://employer-portal-production.s3.amazonaws.com/fv_documents/acme.pdf",
  ]) {
    assert.throws(() => normalizePreviewDocumentUrl(value), DocumentGateError);
  }
});

test("PDF download validates bytes, parsing, size and immutable S3 metadata", async () => {
  const pdf = await makePdf();
  const downloaded = await downloadPreviewPdf(PDF_URL, {
    fetchImpl: async () => pdfResponse(pdf),
    maxPdfBytes: pdf.length + 1,
  });
  assert.match(downloaded.pdfSha256, /^[a-f0-9]{64}$/);
  assert.equal(downloaded.length, pdf.length);
  assert.equal(downloaded.versionId, "fixture-version");

  await assert.rejects(
    downloadPreviewPdf(PDF_URL, {
      fetchImpl: async () => pdfResponse(pdf, { "x-amz-version-id": "null" }),
    }),
    { code: "SAR_PREVIEW_OBJECT_METADATA_INVALID" }
  );
  await assert.rejects(
    downloadPreviewPdf(PDF_URL, {
      fetchImpl: async () =>
        pdfResponse(Buffer.from("not a pdf"), {
          "content-length": String(Buffer.byteLength("not a pdf")),
        }),
    }),
    { code: "SAR_PREVIEW_PDF_INVALID" }
  );
});

test("verifies each unique Preview URL and returns only compact OCR evidence", async () => {
  const pdf = await makePdf();
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (options.method === "GET") return pdfResponse(pdf);
    const claimedHash = options.headers.get("x-sar-pdf-sha256");
    const encoded = options.headers.get("x-sar-expectation");
    const expectation = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    );
    assert.deepEqual(expectation, {
      schemaVersion: 1,
      planId: 627,
      planYear: 2025,
      planNames: IDENTITY.planNames,
      ein: IDENTITY.ein,
    });
    assert.equal(url, `${BASE}/v1/verify-sar`);
    assert.deepEqual(Buffer.from(options.body), pdf);
    return verifierResponse(claimedHash);
  };

  const result = await verifyPreviewDocuments(
    {
      manifest: Array.from({ length: 250 }, (_, index) => ({
        rowNumber: index + 1,
        fileName: `participant-${index + 1}-SAR-2025.pdf`,
        fileUrl: PDF_URL,
      })),
      expectedDocument: EXPECTED,
      planIdentity: IDENTITY,
    },
    {
      config: config({ maxRows: 500 }),
      fetchImpl,
      getAuthHeaders: async () => ({ authorization: "Bearer test-token" }),
    }
  );

  assert.equal(calls.filter((call) => call.options.method === "GET").length, 1);
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 1);
  assert.equal(result.documentGate.documentCount, 1);
  assert.equal(result.documentGate.evidence.length, 1);
  assert.deepEqual(Object.keys(result.documentGate.evidence[0]).sort(), [
    "documentMarkerMatch",
    "einMatch",
    "pagesInspected",
    "pdfSha256",
    "planNameScore",
    "provider",
    "totalPages",
    "truncated",
    "yearMatch",
  ]);
  assert.doesNotMatch(
    JSON.stringify(result.documentGate),
    /Acme|123456789|fv_documents|reasons|verifiedAt|textChars/
  );
});

test("deduplicates identical PDF hashes across distinct URLs", async () => {
  const pdf = await makePdf();
  const secondUrl = PDF_URL.replace("acme.pdf", "copy.pdf");
  const fetchImpl = async (_url, options) => {
    if (options.method === "GET") return pdfResponse(pdf);
    return verifierResponse(options.headers.get("x-sar-pdf-sha256"));
  };
  const result = await verifyPreviewDocuments(
    {
      manifest: [PDF_URL, secondUrl].map((fileUrl, index) => ({
        rowNumber: index + 1,
        fileName: `Acme-${index}-SAR-2025.pdf`,
        fileUrl,
      })),
      expectedDocument: EXPECTED,
      planIdentity: IDENTITY,
    },
    {
      config: config(),
      fetchImpl,
      getAuthHeaders: async () => ({ authorization: "Bearer test-token" }),
    }
  );

  assert.equal(result.objects.length, 2);
  assert.equal(result.documentGate.pdfSha256s.length, 1);
  assert.equal(result.documentGate.documentCount, 1);
  assert.equal(result.documentGate.evidence.length, 1);
});

test("re-HEAD rejects a changed S3 version before click", async () => {
  await assert.rejects(
    assertPreviewObjectsStable(
      [
        {
          fileUrl: PDF_URL,
          etag: '"old"',
          versionId: "old-version",
          length: 100,
        },
      ],
      {
        fetchImpl: async () =>
          new Response(null, {
            status: 200,
            headers: {
              etag: '"new"',
              "x-amz-version-id": "new-version",
              "content-length": "100",
            },
          }),
      }
    ),
    { code: "SAR_PREVIEW_OBJECT_CHANGED" }
  );
});

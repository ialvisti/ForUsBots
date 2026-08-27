const test = require("node:test");
const assert = require("node:assert/strict");

const commonPath = require.resolve(
  "../../src/bots/forusall-emailtrigger/flows/_common"
);
const {
  getPreviewFileNames: extractPreviewFileNames,
  getPreviewManifest: extractPreviewManifest,
  previewAllRowsReady,
} = require(commonPath);
delete require.cache[commonPath];
let previewFileNames = ["Acme_627_SAR_2025.pdf", "Beta_627_SAR_2025.pdf"];

require.cache[commonPath] = {
  id: commonPath,
  filename: commonPath,
  loaded: true,
  exports: {
    getPreviewFileNames: async () => previewFileNames,
    getPreviewManifest: async () =>
      previewFileNames.map((fileName, index) => ({
        rowNumber: index + 1,
        fileName,
        fileUrl: `https://employer-portal-production.s3.amazonaws.com/fv_documents/document-${
          index + 1
        }.pdf`,
      })),
    getPreviewParticipantSelections: async (page) =>
      page.selectionStates?.shift?.() || page.selectionState || {
        count: previewFileNames.length,
        checkedCount: previewFileNames.length,
        enabledCount: previewFileNames.length,
        values: previewFileNames.map((_, index) => String(index + 1)),
      },
    waitForAllPreviewRows: async (page) => {
      if (page.waitForAllRowsError) throw page.waitForAllRowsError;
      const expectedTotal = page.expectedTotal ?? previewFileNames.length;
      return { expectedTotal, rowCount: expectedTotal };
    },
    waitForUrl: async () => true,
    ensurePreviewLongWait: async () => ({ ok: true, tookMs: 5 }),
    waitTableOrEmpty: async () => ({ state: "rows", waitedMs: 5, rows: 2 }),
  },
};

const documentGatePath = require.resolve(
  "../../src/bots/forusall-emailtrigger/documentGate"
);
require.cache[documentGatePath] = {
  id: documentGatePath,
  filename: documentGatePath,
  loaded: true,
  exports: {
    assertPreviewObjectsStable: async () => true,
    fingerprintPreviewManifest: () => "manifest-fingerprint",
    fingerprintPreviewParticipantSelections: (values) =>
      `selection:${JSON.stringify(values)}`,
    getDocumentGateConfig: () => ({ maxDocuments: 20, timeoutMs: 1000 }),
    normalizePreviewManifest: (manifest) => manifest,
    verifyPreviewDocuments: async () => ({
      manifestFingerprint: "manifest-fingerprint",
      objects: [{ opaque: true }],
      documentGate: {
        version: "v1",
        verified: true,
        documentCount: 1,
        pdfSha256s: ["a".repeat(64)],
        aggregateSha256: "b".repeat(64),
      },
    }),
  },
};

const planIdentityPath = require.resolve(
  "../../src/bots/forusall-emailtrigger/planIdentity"
);
require.cache[planIdentityPath] = {
  id: planIdentityPath,
  filename: planIdentityPath,
  loaded: true,
  exports: {
    extractPlanIdentity: async () => ({
      planNames: ["Fixture Plan"],
      ein: "123456789",
    }),
  },
};

const runSummaryAnnualNotice = require("../../src/bots/forusall-emailtrigger/flows/summary_annual_notice");
const {
  clickVerifiedSummaryTrigger,
  inspectSummaryTriggerControl,
  isTrustedTriggerEmailsUrl,
  isTrustedTriggerProcessRequest,
  isTrustedTriggerRedirectRequest,
  isTrustedTriggerRedirectResponse,
  observePortalJavascriptTriggerResponses,
  validatePortalJavascriptTriggerRequest,
  installPortalJavascriptTriggerRequestGuard,
  validatePortalJavascriptTriggerResponse,
} = runSummaryAnnualNotice;

test("preview extraction preserves every row including a missing filename", async () => {
  const headers = [{ textContent: "Participant" }, { textContent: "File Name" }];
  const rows = [
    {
      querySelectorAll: () => [
        { textContent: "Participant A" },
        { textContent: "Acme_SAR_2025.pdf" },
      ],
    },
    {
      querySelectorAll: () => [
        { textContent: "Participant B" },
        { textContent: "" },
      ],
    },
    {
      querySelectorAll: () => [
        { textContent: "Participant C" },
        { textContent: "Beta_SAR_2025.pdf" },
      ],
    },
  ];
  const table = {
    querySelectorAll(selector) {
      if (selector === "thead th") return headers;
      if (selector === 'tbody tr[role="row"]') return rows;
      return [];
    },
  };
  const page = {
    async evaluate(callback) {
      const originalDocument = global.document;
      global.document = { querySelector: () => table };
      try {
        return callback();
      } finally {
        global.document = originalDocument;
      }
    },
  };

  assert.deepEqual(await extractPreviewFileNames(page), [
    "Acme_SAR_2025.pdf",
    null,
    "Beta_SAR_2025.pdf",
  ]);
});

test("preview manifest extracts File Name and File S3 Loc for every row", async () => {
  const locationAnchor = {
    href: "https://employer-portal-production.s3.amazonaws.com/fv_documents/acme.pdf",
    getAttribute: () => "/ignored-relative-link",
  };
  const headers = [
    { textContent: "Participant" },
    { textContent: "File Name" },
    { textContent: "File S3 Loc" },
  ];
  const cells = [
    { textContent: "Participant A" },
    { textContent: "Acme_SAR_2025.pdf" },
    { textContent: "", querySelector: () => locationAnchor },
  ];
  const table = {
    querySelectorAll(selector) {
      if (selector === "thead th") return headers;
      if (selector === 'tbody tr[role="row"]') {
        return [{ querySelectorAll: () => cells }];
      }
      return [];
    },
  };
  const page = {
    async evaluate(callback) {
      const originalDocument = global.document;
      global.document = { querySelector: () => table };
      try {
        return callback();
      } finally {
        global.document = originalDocument;
      }
    },
  };

  assert.deepEqual(await extractPreviewManifest(page), [
    {
      rowNumber: 1,
      fileName: "Acme_SAR_2025.pdf",
      fileUrl:
        "https://employer-portal-production.s3.amazonaws.com/fv_documents/acme.pdf",
    },
  ]);
});

test("All-rows predicate rejects a filtered DataTable", () => {
  const originalDocument = global.document;
  const originalWindow = global.window;
  const jquery = () => ({
    DataTable: () => ({
      page: {
        info: () => ({ recordsDisplay: 1, recordsTotal: 2 }),
      },
    }),
  });
  jquery.fn = {
    dataTable: {
      isDataTable: () => true,
    },
  };
  global.document = {
    querySelector(selector) {
      if (selector === 'select[name="data_list_length"]') {
        return { value: "-1" };
      }
      return null;
    },
    querySelectorAll: () => [{}],
  };
  global.window = { jQuery: jquery };

  try {
    assert.equal(previewAllRowsReady(), false);
  } finally {
    global.document = originalDocument;
    global.window = originalWindow;
  }
});

test("All-rows predicate captures the unfiltered total", () => {
  const originalDocument = global.document;
  const originalWindow = global.window;
  const jquery = () => ({
    DataTable: () => ({
      page: {
        info: () => ({ recordsDisplay: 2, recordsTotal: 2 }),
      },
    }),
  });
  jquery.fn = {
    dataTable: {
      isDataTable: () => true,
    },
  };
  global.document = {
    querySelector(selector) {
      if (selector === 'select[name="data_list_length"]') {
        return { value: "-1" };
      }
      return null;
    },
    querySelectorAll: () => [{}, {}],
  };
  global.window = { jQuery: jquery };

  try {
    assert.deepEqual(previewAllRowsReady(), {
      expectedTotal: 2,
      rowCount: 2,
    });
  } finally {
    global.document = originalDocument;
    global.window = originalWindow;
  }
});

const DEFAULT_PREVIEW_URL =
  "https://employer.forusall.com/preview?plan=627&email_type=summary_annual_notice&participant_id=0&user_id=0&conversation_id=&attachments=null&year=2026&quarter=1&divisions=0&plan_snapshot=null&enrolled=true&not_enrolled=false&terminated=false&generic_comm_type=&force_send=false";
const DEFAULT_TRIGGER_URL = DEFAULT_PREVIEW_URL.replace(
  "force_send=false",
  "force_send=true"
);
const TRIGGER_SUCCESS_MESSAGE =
  "Background job has been scheduled. You will receive an email shortly with the logs once the job completes.";
const DEFAULT_MAIN_FRAME = Object.freeze({ name: "main" });
const DEFAULT_TRIGGER_POST_DATA = new URLSearchParams({
  participants_list: "1",
  plan: "627",
  plan_snapshot: "null",
  email_type: "summary_annual_notice",
  conversation_id: "",
  prior_date: "",
  year: "2026",
  quarter: "1",
  attachments: "null",
  enrolled: "true",
  not_enrolled: "false",
  terminated: "false",
  generic_comm_type: "",
}).toString();

function expectedJavascriptTriggerBinding(overrides = {}) {
  return {
    expectedPlanId: 627,
    expectedEmailType: "summary_annual_notice",
    expectedPreviewYear: "2026",
    selectionValues: ["1"],
    expectedPostValues: Object.fromEntries(
      new URLSearchParams(DEFAULT_TRIGGER_POST_DATA)
    ),
    ...overrides,
  };
}

function fakeRequest({
  url,
  method = "GET",
  postData = null,
  redirectedFrom = null,
  resourceType = "xhr",
  isNavigationRequest = false,
  frame = DEFAULT_MAIN_FRAME,
}) {
  return {
    url: () => url,
    method: () => method,
    postData: () => postData,
    redirectedFrom: () => redirectedFrom,
    resourceType: () => resourceType,
    isNavigationRequest: () => isNavigationRequest,
    frame: () => frame,
  };
}

function fakeResponse({
  url,
  status = 200,
  request,
  headers = {},
  body = "",
}) {
  return {
    url: () => url,
    status: () => status,
    request: () => request,
    headers: async () => headers,
    text: async () => body,
  };
}

function successfulJavascriptTriggerResponses({ postData } = {}) {
  const processRequest = fakeRequest({
    url: "https://employer.forusall.com/trigger_email_process",
    method: "POST",
    postData:
      postData ||
      DEFAULT_TRIGGER_POST_DATA,
  });
  const processResponse = fakeResponse({
    url: processRequest.url(),
    status: 302,
    request: processRequest,
    headers: { location: "/trigger_emails?plan=627" },
  });
  const redirectRequest = fakeRequest({
    url: "https://employer.forusall.com/trigger_emails?plan=627",
    redirectedFrom: processRequest,
  });
  const redirectResponse = fakeResponse({
    url: redirectRequest.url(),
    request: redirectRequest,
    body: `<div class="alert alert-success"><div id="flash_notice">${TRIGGER_SUCCESS_MESSAGE}</div></div>`,
  });
  return { processRequest, processResponse, redirectRequest, redirectResponse };
}

function fakePage({
  alertType = "success",
  alertMessage = "Emails queued successfully",
  clickError = null,
  selectError = null,
  waitForAllRowsError = null,
  expectedTotal = null,
  selectionState = null,
  selectionStates = null,
  previewUrl = DEFAULT_PREVIEW_URL,
  triggerHref = DEFAULT_TRIGGER_URL,
  triggerTagName = "A",
  triggerJqueryHandlerMatched = false,
  triggerJqueryHandlerSourceVersion = triggerJqueryHandlerMatched
    ? "jquery_post_source_v1"
    : null,
  triggerDirectClickHandlerCount = 0,
  triggerPlanValue = "627",
  triggerEmailTypeValue = "summary_annual_notice",
  triggerConversationIdValue = "",
  triggerPriorDateValue = "",
  triggerResponses = [],
  triggerHrefAtClick = triggerHref,
  triggerTagNameAtClick = triggerTagName,
  previewUrlAtClick = previewUrl,
  triggerLookupError = null,
  preClickStateChanged = false,
  postRedirectRequest = null,
  postClickUrl = "https://employer.forusall.com/trigger_emails",
} = {}) {
  const clicks = [];
  const dialogAccepts = [];
  const registeredListeners = [];
  const removedListeners = [];
  const triggerContractReads = [];
  const responseHandlers = new Set();
  const requestGuardRoutes = [];
  const removedRequestGuardRoutes = [];
  let processRouteHandler = null;
  let continuedRequestCount = 0;
  let abortedRequestCount = 0;
  let dialogHandler = null;
  let triggerClicked = false;
  let postRedirectRequestInjected = false;

  return {
    clicks,
    dialogAccepts,
    registeredListeners,
    removedListeners,
    triggerContractReads,
    requestGuardRoutes,
    removedRequestGuardRoutes,
    get continuedRequestCount() {
      return continuedRequestCount;
    },
    get abortedRequestCount() {
      return abortedRequestCount;
    },
    expectedTotal,
    selectionState,
    selectionStates,
    waitForAllRowsError,
    mainFrame() {
      return DEFAULT_MAIN_FRAME;
    },
    async selectOption() {
      if (selectError) throw selectError;
    },
    async waitForTimeout() {
      if (
        triggerClicked &&
        postRedirectRequest &&
        processRouteHandler &&
        !postRedirectRequestInjected
      ) {
        postRedirectRequestInjected = true;
        await processRouteHandler({
          request: () => postRedirectRequest,
          continue: async () => {
            continuedRequestCount += 1;
          },
          abort: async () => {
            abortedRequestCount += 1;
          },
        });
      }
    },
    once(event, handler) {
      registeredListeners.push(event);
      if (event === "dialog") dialogHandler = handler;
    },
    on(event, handler) {
      registeredListeners.push(event);
      if (event === "response") responseHandlers.add(handler);
    },
    async route(pattern, handler) {
      requestGuardRoutes.push(pattern);
      processRouteHandler = handler;
    },
    async unroute(pattern, handler) {
      removedRequestGuardRoutes.push(pattern);
      if (processRouteHandler === handler) processRouteHandler = null;
    },
    off(event, handler) {
      removedListeners.push(event);
      if (event === "dialog" && dialogHandler === handler) dialogHandler = null;
      if (event === "response") responseHandlers.delete(handler);
    },
    async click(selector) {
      clicks.push(selector);
      if (selector === "#triggerEmail") triggerClicked = true;
      if (clickError) throw clickError;
      if (dialogHandler) {
        dialogHandler({
          accept: async () => {
            dialogAccepts.push(selector);
          },
        });
      }
    },
    url() {
      return triggerClicked ? postClickUrl : previewUrl;
    },
    async waitForSelector(selector) {
      if (selector.includes(".alert.alert-success")) {
        if (alertType === "none") throw new Error("alert timeout");
        return {};
      }
      return {};
    },
    async evaluate() {
      return {
        errorMessage: alertType === "error" ? alertMessage : null,
        successMessage: alertType === "success" ? alertMessage : null,
      };
    },
    async $eval(selector, _pageFunction, expectedBinding) {
      triggerContractReads.push(selector);
      if (triggerLookupError) throw triggerLookupError;
      if (expectedBinding) {
        if (preClickStateChanged) {
          throw new Error("SAR_PRE_CLICK_STATE_CHANGED");
        }
        if (
          triggerTagNameAtClick !== "A" ||
          triggerHrefAtClick !== expectedBinding.href ||
          previewUrlAtClick !== expectedBinding.previewUrl ||
          !Number.isSafeInteger(expectedBinding.expectedTotal) ||
          !Array.isArray(expectedBinding.manifest) ||
          !Array.isArray(expectedBinding.selectionValues)
        ) {
          throw new Error("SAR_TRIGGER_BINDING_CHANGED");
        }
        clicks.push(selector);
        triggerClicked = true;
        if (clickError) throw clickError;
        if (dialogHandler) {
          dialogHandler({
            accept: async () => {
              dialogAccepts.push(selector);
            },
          });
        }
        for (const response of triggerResponses) {
          let shouldEmit = true;
          if (
            processRouteHandler &&
            response.request().url().includes("/trigger_email_process")
          ) {
            let continued = false;
            await processRouteHandler({
              request: () => response.request(),
              continue: async () => {
                continued = true;
                continuedRequestCount += 1;
              },
              abort: async () => {
                continued = false;
                abortedRequestCount += 1;
              },
            });
            shouldEmit = continued;
          }
          if (!shouldEmit) {
            if (
              response.request().url().includes("/trigger_email_process")
            ) {
              break;
            }
            continue;
          }
          for (const handler of [...responseHandlers]) handler(response);
        }
        return undefined;
      }
      return {
        tagName: triggerTagName,
        href: triggerHref,
        jqueryHandlerMatched: triggerJqueryHandlerMatched,
        jqueryHandlerSourceVersion: triggerJqueryHandlerSourceVersion,
        directClickHandlerCount: triggerDirectClickHandlerCount,
        planValue: triggerPlanValue,
        emailTypeValue: triggerEmailTypeValue,
        conversationIdValue: triggerConversationIdValue,
        priorDateValue: triggerPriorDateValue,
      };
    },
  };
}

function atomicClickFixture({
  currentFileName = "Acme_627_SAR_2025.pdf",
  expectedFileName = "Acme_627_SAR_2025.pdf",
  currentParticipant = "participant-1",
  expectedParticipant = "participant-1",
  checked = true,
  disabled = false,
  duplicateTrigger = false,
  externalParticipantCheck = false,
  triggerContractVersion = "force_send_query_v1",
  jqueryHandlerMatched = true,
  duplicateJqueryHandler = false,
  jqueryHandlerMode = "email",
} = {}) {
  const fileUrl =
    "https://employer-portal-production.s3.amazonaws.com/fv_documents/document-1.pdf";
  let elementClicks = 0;
  let jqueryPosts = 0;
  const element = {
    tagName: "A",
    getAttribute: (name) =>
      name === "href"
        ? triggerContractVersion === "jquery_post_v1"
          ? "/preview"
          : DEFAULT_TRIGGER_URL
        : null,
    addEventListener: () => {},
    click: () => {
      elementClicks += 1;
    },
  };
  const headers = [
    { textContent: "Participant" },
    { textContent: "File Name" },
    { textContent: "File S3 Loc" },
  ];
  const anchor = {
    href: fileUrl,
    getAttribute: () => fileUrl,
  };
  const row = {
    querySelectorAll: (selector) =>
      selector === "td"
        ? [
            { textContent: currentParticipant },
            { textContent: currentFileName },
            { textContent: "", querySelector: () => anchor },
          ]
        : [],
  };
  const checkbox = {
    value: currentParticipant,
    checked,
    disabled,
  };
  const table = {
    querySelectorAll(selector) {
      if (selector === "thead th") return headers;
      if (selector === 'tbody tr[role="row"]') return [row];
      if (
        selector ===
        'tbody input.participant_checks[type="checkbox"]'
      ) {
        return [checkbox];
      }
      return [];
    },
  };
  const document = {
    querySelector(selector) {
      if (selector === "#triggerEmail") return element;
      if (selector === "#data_list") return table;
      if (selector === "#plan") return { value: "627" };
      if (selector === "#email_type") {
        return { value: "summary_annual_notice" };
      }
      if (selector === "#conversation_id") return { value: "" };
      if (selector === "#prior_date") return { value: "" };
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "#triggerEmail") {
        return duplicateTrigger ? [element, {}] : [element];
      }
      if (selector === "#plan") return [{ value: "627" }];
      if (selector === "#email_type") {
        return [{ value: "summary_annual_notice" }];
      }
      if (selector === "#conversation_id") return [{ value: "" }];
      if (selector === "#prior_date") return [{ value: "" }];
      if (selector === ".participant_checks") {
        return externalParticipantCheck ? [checkbox, {}] : [checkbox];
      }
      return [];
    },
  };
  const expected = {
    previewUrl: DEFAULT_PREVIEW_URL,
    href:
      triggerContractVersion === "jquery_post_v1"
        ? "/preview"
        : DEFAULT_TRIGGER_URL,
    triggerContractVersion,
    expectedTotal: 1,
    manifest: [
      {
        rowNumber: 1,
        fileName: expectedFileName,
        fileUrl,
      },
    ],
    selectionValues: [expectedParticipant],
    expectedPlanId: 627,
    expectedEmailType: "summary_annual_notice",
    expectedPreviewYear: "2026",
    expectedPostValues: Object.fromEntries(
      new URLSearchParams(DEFAULT_TRIGGER_POST_DATA)
    ),
    jqueryHandlerSourceVersion:
      triggerContractVersion === "jquery_post_v1"
        ? "jquery_post_source_v1"
        : null,
  };
  let jqueryHandler;
  if (jqueryHandlerMode === "paper") {
    jqueryHandler = function () {
      confirm("Are you sure?");
      const params = commTriggerParams();
      params.comm_method = "paper";
      $.post("/trigger_email_process");
    };
  } else if (jqueryHandlerMode === "alternate") {
    jqueryHandler = function () {
      if (confirm('Are you sure you want to send this email?')) {
        var params = commTriggerParams()
        fetch('/alternate_email_process');
        $.extend(params, );
        $.post('/trigger_email_process',
          params,
          'script'
        );
      } else {
        return false;
      }
    };
  } else if (jqueryHandlerMode === "spaced-path") {
    jqueryHandler = function () {
      if (confirm('Are you sure you want to send this email?')) {
        var params = commTriggerParams()
        $.extend(params, );
        $.post('/trigger_email_ process',
          params,
          'script'
        );
      } else {
        return false;
      }
    };
  } else {
    jqueryHandler = function () {
      if (confirm('Are you sure you want to send this email?')) {
        var params = commTriggerParams()
        $.extend(params, );
        $.post('/trigger_email_process',
          params,
          'script'
        );
      } else {
        return false;
      }
    };
  }
  const jquery = {
    _data: () => ({
      click: jqueryHandlerMatched
        ? Array.from({ length: duplicateJqueryHandler ? 2 : 1 }, () => ({
            selector: null,
            handler: jqueryHandler,
          }))
        : [],
    }),
  };
  return {
    document,
    element,
    expected,
    jquery,
    recordJqueryPost: () => {
      jqueryPosts += 1;
    },
    getClicks: () => elementClicks + jqueryPosts,
    getElementClicks: () => elementClicks,
    getJqueryPosts: () => jqueryPosts,
  };
}

function runAtomicClickFixture(options) {
  const fixture = atomicClickFixture(options);
  const originalDocument = global.document;
  const originalWindow = global.window;
  const originalConfirm = global.confirm;
  const originalCommTriggerParams = global.commTriggerParams;
  const originalJquery = global.$;
  global.document = fixture.document;
  global.window = {
    location: { href: DEFAULT_PREVIEW_URL },
    jQuery: fixture.jquery,
  };
  global.confirm = () => true;
  global.commTriggerParams = () => ({});
  global.$ = { extend: () => {}, post: fixture.recordJqueryPost };
  try {
    clickVerifiedSummaryTrigger(fixture.element, fixture.expected);
    return options?.returnDetails
      ? {
          total: fixture.getClicks(),
          elementClicks: fixture.getElementClicks(),
          jqueryPosts: fixture.getJqueryPosts(),
        }
      : fixture.getClicks();
  } finally {
    global.document = originalDocument;
    global.window = originalWindow;
    global.confirm = originalConfirm;
    global.commTriggerParams = originalCommTriggerParams;
    global.$ = originalJquery;
  }
}

test("atomic trigger click requires the exact verified manifest and selections", async (t) => {
  assert.equal(runAtomicClickFixture(), 1);

  const hostileStates = [
    {
      name: "document changed",
      options: { currentFileName: "Other_627_SAR_2025.pdf" },
    },
    {
      name: "participant changed",
      options: { currentParticipant: "participant-2" },
    },
    {
      name: "participant unchecked",
      options: { checked: false },
    },
    {
      name: "participant disabled",
      options: { disabled: true },
    },
    {
      name: "participant checkbox outside the verified table",
      options: { externalParticipantCheck: true },
    },
  ];
  for (const scenario of hostileStates) {
    await t.test(scenario.name, () => {
      assert.throws(() => runAtomicClickFixture(scenario.options), {
        message: "SAR_PRE_CLICK_STATE_CHANGED",
      });
    });
  }

  await t.test("duplicate trigger selector", () => {
    assert.throws(
      () => runAtomicClickFixture({ duplicateTrigger: true }),
      { message: "SAR_TRIGGER_BINDING_CHANGED" }
    );
  });
});

test("atomic trigger click accepts only the verified portal jQuery POST handler", () => {
  assert.deepEqual(
    runAtomicClickFixture({
      triggerContractVersion: "jquery_post_v1",
      returnDetails: true,
    }),
    { total: 1, elementClicks: 0, jqueryPosts: 1 }
  );
  assert.throws(
    () =>
      runAtomicClickFixture({
        triggerContractVersion: "jquery_post_v1",
        jqueryHandlerMatched: false,
      }),
    { message: "SAR_TRIGGER_BINDING_CHANGED" }
  );
  assert.throws(
    () =>
      runAtomicClickFixture({
        triggerContractVersion: "jquery_post_v1",
        duplicateJqueryHandler: true,
      }),
    { message: "SAR_TRIGGER_BINDING_CHANGED" }
  );
  assert.throws(
    () =>
      runAtomicClickFixture({
        triggerContractVersion: "jquery_post_v1",
        jqueryHandlerMode: "paper",
      }),
    { message: "SAR_TRIGGER_BINDING_CHANGED" }
  );
  assert.throws(
    () =>
      runAtomicClickFixture({
        triggerContractVersion: "jquery_post_v1",
        jqueryHandlerMode: "alternate",
      }),
    { message: "SAR_TRIGGER_BINDING_CHANGED" }
  );
  assert.throws(
    () =>
      runAtomicClickFixture({
        triggerContractVersion: "jquery_post_v1",
        jqueryHandlerMode: "spaced-path",
      }),
    { message: "SAR_TRIGGER_BINDING_CHANGED" }
  );
});

test("trigger control inspection never exposes handler source", () => {
  const fixture = atomicClickFixture({
    triggerContractVersion: "jquery_post_v1",
  });
  const originalDocument = global.document;
  const originalWindow = global.window;
  global.document = fixture.document;
  global.window = { jQuery: fixture.jquery };
  try {
    const inspected = inspectSummaryTriggerControl(fixture.element);
    assert.equal(inspected.jqueryHandlerMatched, true);
    assert.equal(
      inspected.jqueryHandlerSourceVersion,
      "jquery_post_source_v1"
    );
    assert.equal(inspected.directClickHandlerCount, 1);
    assert.equal(inspected.planValue, "627");
    assert.equal(inspected.emailTypeValue, "summary_annual_notice");
    assert.equal(Object.hasOwn(inspected, "handlerSource"), false);
    assert.doesNotMatch(JSON.stringify(inspected), /commTriggerParams|\.post/);

    const paperFixture = atomicClickFixture({
      triggerContractVersion: "jquery_post_v1",
      jqueryHandlerMode: "paper",
    });
    global.document = paperFixture.document;
    global.window = { jQuery: paperFixture.jquery };
    const paperInspected = inspectSummaryTriggerControl(paperFixture.element);
    assert.equal(paperInspected.jqueryHandlerMatched, false);
    assert.equal(paperInspected.jqueryHandlerSourceVersion, null);
    assert.equal(paperInspected.directClickHandlerCount, 1);
  } finally {
    global.document = originalDocument;
    global.window = originalWindow;
  }
});

test("post-click URL trust requires the exact employer origin and path", () => {
  assert.equal(
    isTrustedTriggerEmailsUrl(
      "https://employer.forusall.com/trigger_emails?queued=true"
    ),
    true
  );
  for (const value of [
    "https://evil.example/trigger_emails",
    "https://employer.forusall.com.evil.example/trigger_emails",
    "http://employer.forusall.com/trigger_emails",
    "https://employer.forusall.com/trigger_emails/other",
    "https://employer.forusall.com/preview",
    "not-a-url",
  ]) {
    assert.equal(isTrustedTriggerEmailsUrl(value), false);
  }
});

test("portal JavaScript trigger response is bound to POST identity and exact success", async () => {
  const responses = successfulJavascriptTriggerResponses();
  assert.equal(isTrustedTriggerProcessRequest(responses.processRequest), true);
  assert.equal(
    isTrustedTriggerRedirectRequest(
      responses.redirectRequest,
      responses.processRequest
    ),
    true
  );
  assert.equal(
    isTrustedTriggerRedirectResponse(responses.redirectResponse),
    true
  );
  assert.deepEqual(
    await validatePortalJavascriptTriggerResponse(
      responses.processResponse,
      responses.redirectResponse,
      expectedJavascriptTriggerBinding()
    ),
    { matched: true, failureCode: null }
  );

  const wrongIdentity = successfulJavascriptTriggerResponses({
    postData: DEFAULT_TRIGGER_POST_DATA.replace("plan=627", "plan=628"),
  });
  assert.deepEqual(
    await validatePortalJavascriptTriggerResponse(
      wrongIdentity.processResponse,
      wrongIdentity.redirectResponse,
      expectedJavascriptTriggerBinding()
    ),
    { matched: false, failureCode: "trigger_request_identity_mismatch" }
  );

  const wrongMode = successfulJavascriptTriggerResponses({
    postData: `${DEFAULT_TRIGGER_POST_DATA}&comm_method=paper`,
  });
  assert.deepEqual(
    await validatePortalJavascriptTriggerResponse(
      wrongMode.processResponse,
      wrongMode.redirectResponse,
      expectedJavascriptTriggerBinding()
    ),
    { matched: false, failureCode: "trigger_request_shape_mismatch" }
  );

  const crossedRedirect = successfulJavascriptTriggerResponses();
  const unrelatedProcessRequest = fakeRequest({
    url: "https://employer.forusall.com/trigger_email_process",
    method: "POST",
    postData:
      DEFAULT_TRIGGER_POST_DATA,
  });
  crossedRedirect.redirectRequest = fakeRequest({
    url: "https://employer.forusall.com/trigger_emails?plan=627",
    redirectedFrom: unrelatedProcessRequest,
  });
  crossedRedirect.redirectResponse = fakeResponse({
    url: crossedRedirect.redirectRequest.url(),
    request: crossedRedirect.redirectRequest,
    body: `<div class="alert alert-success"><div id="flash_notice">${TRIGGER_SUCCESS_MESSAGE}</div></div>`,
  });
  assert.deepEqual(
    await validatePortalJavascriptTriggerResponse(
      crossedRedirect.processResponse,
      crossedRedirect.redirectResponse,
      expectedJavascriptTriggerBinding()
    ),
    { matched: false, failureCode: "trigger_response_contract_mismatch" }
  );

  const unboundSuccessText = successfulJavascriptTriggerResponses();
  unboundSuccessText.redirectResponse = fakeResponse({
    url: unboundSuccessText.redirectRequest.url(),
    request: unboundSuccessText.redirectRequest,
    body: `<script>const staleMessage = ${JSON.stringify(
      TRIGGER_SUCCESS_MESSAGE
    )};</script>`,
  });
  assert.deepEqual(
    await validatePortalJavascriptTriggerResponse(
      unboundSuccessText.processResponse,
      unboundSuccessText.redirectResponse,
      expectedJavascriptTriggerBinding()
    ),
    { matched: false, failureCode: "trigger_success_not_confirmed" }
  );

  const conflictingFlash = successfulJavascriptTriggerResponses();
  conflictingFlash.redirectResponse = fakeResponse({
    url: conflictingFlash.redirectRequest.url(),
    request: conflictingFlash.redirectRequest,
    body:
      `<div id="flash_error">Portal warning</div>` +
      `<div id="flash_notice">${TRIGGER_SUCCESS_MESSAGE}</div>`,
  });
  assert.deepEqual(
    await validatePortalJavascriptTriggerResponse(
      conflictingFlash.processResponse,
      conflictingFlash.redirectResponse,
      expectedJavascriptTriggerBinding()
    ),
    { matched: false, failureCode: "trigger_error_flash_present" }
  );
});

test("portal response observer binds one redirect chain and always removes its listener", async () => {
  const handlers = new Set();
  const page = {
    on(event, handler) {
      assert.equal(event, "response");
      handlers.add(handler);
    },
    off(event, handler) {
      assert.equal(event, "response");
      handlers.delete(handler);
    },
  };
  const responses = successfulJavascriptTriggerResponses();
  const observer = observePortalJavascriptTriggerResponses(page, {
    timeout: 1000,
  });
  for (const handler of [...handlers]) handler(responses.processResponse);
  for (const handler of [...handlers]) handler(responses.redirectResponse);
  const captured = await observer.promise;
  assert.equal(captured.processResponse, responses.processResponse);
  assert.equal(captured.redirectResponse, responses.redirectResponse);
  assert.equal(handlers.size, 0);

  const cancelled = observePortalJavascriptTriggerResponses(page, {
    timeout: 1000,
  });
  cancelled.cancel();
  assert.equal(await cancelled.promise, null);
  assert.equal(handlers.size, 0);
});

test("portal request guard permits one exact POST and blocks a duplicate before network", async () => {
  let installed = null;
  let removed = null;
  const page = {
    mainFrame: () => DEFAULT_MAIN_FRAME,
    async route(pattern, handler) {
      installed = { pattern, handler };
    },
    async unroute(pattern, handler) {
      removed = { pattern, handler };
    },
  };
  const expected = expectedJavascriptTriggerBinding();
  const request = fakeRequest({
    url: "https://employer.forusall.com/trigger_email_process",
    method: "POST",
    postData: DEFAULT_TRIGGER_POST_DATA,
  });
  assert.deepEqual(validatePortalJavascriptTriggerRequest(request, expected), {
    matched: true,
    failureCode: null,
  });

  const guard = await installPortalJavascriptTriggerRequestGuard(page, expected);
  let continued = 0;
  let aborted = 0;
  const route = {
    request: () => request,
    continue: async () => {
      continued += 1;
    },
    abort: async () => {
      aborted += 1;
    },
  };
  await installed.handler(route);
  assert.deepEqual(guard.snapshot(), {
    allowedRequestCount: 1,
    redirectObserved: false,
    blockedRequestCount: 0,
    suppressedAfterRedirectCount: 0,
  });

  await installed.handler(route);
  assert.equal(await guard.blocked, "trigger_request_duplicate");
  assert.deepEqual(guard.snapshot(), {
    allowedRequestCount: 1,
    redirectObserved: false,
    blockedRequestCount: 1,
    suppressedAfterRedirectCount: 0,
  });
  assert.equal(continued, 1);
  assert.equal(aborted, 1);

  await guard.remove();
  assert.equal(removed.pattern, installed.pattern);
  assert.equal(removed.handler, installed.handler);
});

test("portal request guard binds the exact POST to XHR in the main frame", async (t) => {
  const cases = [
    { name: "fetch", request: { resourceType: "fetch" } },
    {
      name: "navigation",
      request: { resourceType: "document", isNavigationRequest: true },
    },
    { name: "subframe", request: { frame: { name: "subframe" } } },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      let installed = null;
      const page = {
        mainFrame: () => DEFAULT_MAIN_FRAME,
        async route(pattern, handler) {
          installed = { pattern, handler };
        },
        async unroute() {},
      };
      const guard = await installPortalJavascriptTriggerRequestGuard(
        page,
        expectedJavascriptTriggerBinding()
      );
      const request = fakeRequest({
        url: "https://employer.forusall.com/trigger_email_process",
        method: "POST",
        postData: DEFAULT_TRIGGER_POST_DATA,
        ...scenario.request,
      });
      let continued = 0;
      let aborted = 0;
      await installed.handler({
        request: () => request,
        continue: async () => {
          continued += 1;
        },
        abort: async () => {
          aborted += 1;
        },
      });

      assert.equal(await guard.blocked, "trigger_request_initiator_mismatch");
      assert.equal(continued, 0);
      assert.equal(aborted, 1);
      assert.deepEqual(guard.snapshot(), {
        allowedRequestCount: 0,
        redirectObserved: false,
        blockedRequestCount: 1,
        suppressedAfterRedirectCount: 0,
      });
      await guard.remove();
    });
  }
});

test("portal request guard blocks an alternate route until the exact redirect", async () => {
  let installed = null;
  const page = {
    mainFrame: () => DEFAULT_MAIN_FRAME,
    async route(pattern, handler) {
      installed = { pattern, handler };
    },
    async unroute() {},
  };
  const guard = await installPortalJavascriptTriggerRequestGuard(
    page,
    expectedJavascriptTriggerBinding()
  );
  const processRequest = fakeRequest({
    url: "https://employer.forusall.com/trigger_email_process",
    method: "POST",
    postData: DEFAULT_TRIGGER_POST_DATA,
  });
  const continued = [];
  const aborted = [];
  const routeFor = (request) => ({
    request: () => request,
    continue: async () => continued.push(request.url()),
    abort: async () => aborted.push(request.url()),
  });

  assert.equal(installed.pattern, "**/*");
  await installed.handler(routeFor(processRequest));
  const alternateRequest = fakeRequest({
    url: "https://employer.forusall.com/alternate_email_process",
    method: "POST",
    postData: DEFAULT_TRIGGER_POST_DATA,
  });
  await installed.handler(routeFor(alternateRequest));

  assert.equal(await guard.blocked, "trigger_request_contract_mismatch");
  assert.deepEqual(continued, [processRequest.url()]);
  assert.deepEqual(aborted, [alternateRequest.url()]);
  assert.deepEqual(guard.snapshot(), {
    allowedRequestCount: 1,
    redirectObserved: false,
    blockedRequestCount: 1,
    suppressedAfterRedirectCount: 0,
  });
  await guard.remove();
});

test("portal request guard binds the observed redirect and suppresses safe page assets", async () => {
  let installed = null;
  const page = {
    mainFrame: () => DEFAULT_MAIN_FRAME,
    async route(pattern, handler) {
      installed = { pattern, handler };
    },
    async unroute() {},
  };
  const guard = await installPortalJavascriptTriggerRequestGuard(
    page,
    expectedJavascriptTriggerBinding()
  );
  const processRequest = fakeRequest({
    url: "https://employer.forusall.com/trigger_email_process",
    method: "POST",
    postData: DEFAULT_TRIGGER_POST_DATA,
  });
  const redirectRequest = fakeRequest({
    url: "https://employer.forusall.com/trigger_emails?plan=627",
    redirectedFrom: processRequest,
  });
  const resourceRequest = fakeRequest({
    url: "https://employer.forusall.com/assets/application.js",
    resourceType: "script",
  });
  let continued = 0;
  let aborted = 0;
  const routeFor = (request) => ({
    request: () => request,
    continue: async () => {
      continued += 1;
    },
    abort: async () => {
      aborted += 1;
    },
  });

  await installed.handler(routeFor(processRequest));
  const redirectResponse = fakeResponse({
    url: redirectRequest.url(),
    request: redirectRequest,
  });
  assert.equal(guard.markRedirectObserved(redirectResponse), true);
  await installed.handler(routeFor(resourceRequest));

  assert.deepEqual(guard.snapshot(), {
    allowedRequestCount: 1,
    redirectObserved: true,
    blockedRequestCount: 0,
    suppressedAfterRedirectCount: 1,
  });
  assert.equal(continued, 1);
  assert.equal(aborted, 1);
  await guard.remove();
});

test("portal request guard blocks a side-effect request after the redirect response", async () => {
  let installed = null;
  const page = {
    mainFrame: () => DEFAULT_MAIN_FRAME,
    async route(pattern, handler) {
      installed = { pattern, handler };
    },
    async unroute() {},
  };
  const guard = await installPortalJavascriptTriggerRequestGuard(
    page,
    expectedJavascriptTriggerBinding()
  );
  const processRequest = fakeRequest({
    url: "https://employer.forusall.com/trigger_email_process",
    method: "POST",
    postData: DEFAULT_TRIGGER_POST_DATA,
  });
  const redirectRequest = fakeRequest({
    url: "https://employer.forusall.com/trigger_emails?plan=627",
    redirectedFrom: processRequest,
  });
  const routeFor = (request) => ({
    request: () => request,
    continue: async () => {},
    abort: async () => {},
  });

  await installed.handler(routeFor(processRequest));
  assert.equal(
    guard.markRedirectObserved(
      fakeResponse({ url: redirectRequest.url(), request: redirectRequest })
    ),
    true
  );
  await installed.handler(
    routeFor(
      fakeRequest({
        url: "https://employer.forusall.com/alternate_email_process",
        method: "POST",
        postData: DEFAULT_TRIGGER_POST_DATA,
      })
    )
  );

  assert.equal(await guard.blocked, "trigger_request_contract_mismatch");
  assert.deepEqual(guard.snapshot(), {
    allowedRequestCount: 1,
    redirectObserved: true,
    blockedRequestCount: 1,
    suppressedAfterRedirectCount: 0,
  });
  await guard.remove();
});

test("summary annual validates the configured report year", async () => {
  previewFileNames = ["Acme_627_SAR_2024.pdf"];
  const page = fakePage();
  const result = await runSummaryAnnualNotice({
    page,
    selectors: {},
    meta: { planId: 627, reportYear: 2025 },
    jobCtx: null,
  });

  assert.equal(result.result, "Failed");
  assert.match(result.reason, /expected SAR plan and report year/);
  assert.equal(result.details.invalidFiles[0].hasReportYear, false);
  assert.equal(result.details.invalidFiles[0].hasPlanId, true);
  assert.deepEqual(page.clicks, []);
});

test("summary annual rejects a filename bound to another plan id", async () => {
  previewFileNames = ["Acme_628_SAR_2025.pdf"];
  const page = fakePage();
  const result = await runSummaryAnnualNotice({
    page,
    selectors: {},
    meta: { planId: 627, reportYear: 2025 },
    jobCtx: null,
  });

  assert.equal(result.result, "Failed");
  assert.equal(result.details.invalidFiles[0].hasPlanId, false);
  assert.equal(result.details.invalidFiles[0].hasSar, true);
  assert.equal(result.details.invalidFiles[0].hasReportYear, true);
  assert.doesNotMatch(JSON.stringify(result.details), /Acme_628/);
  assert.deepEqual(page.clicks, []);
});

test("summary annual rejects the batch when a later row is invalid", async () => {
  previewFileNames = ["Acme_627_SAR_2025.pdf", "Unrelated_627_2025.pdf"];
  const page = fakePage();
  const result = await runSummaryAnnualNotice({
    page,
    selectors: {},
    meta: { planId: 627, reportYear: 2025 },
    jobCtx: null,
  });

  assert.equal(result.result, "Failed");
  assert.equal(result.details.fileCount, 2);
  assert.deepEqual(result.details.invalidFiles, [
    {
      rowNumber: 2,
      hasSar: false,
      hasReportYear: true,
      hasPlanId: true,
    },
  ]);
  assert.doesNotMatch(JSON.stringify(result.details), /Unrelated_627_2025\.pdf/);
  assert.deepEqual(page.clicks, []);
});

test("summary annual fails closed when selecting All fails", async () => {
  previewFileNames = ["Acme_627_SAR_2025.pdf"];
  const page = fakePage({ selectError: new Error("All option unavailable") });

  await assert.rejects(
    runSummaryAnnualNotice({
      page,
      selectors: {},
      meta: { planId: 627, reportYear: 2025 },
      jobCtx: null,
    }),
    /All option unavailable/
  );
  assert.deepEqual(page.clicks, []);
});

test("summary annual fails closed when the All redraw does not finish", async () => {
  previewFileNames = ["Acme_627_SAR_2025.pdf"];
  const page = fakePage({
    waitForAllRowsError: new Error("All redraw timed out"),
  });

  await assert.rejects(
    runSummaryAnnualNotice({
      page,
      selectors: {},
      meta: { planId: 627, reportYear: 2025 },
      jobCtx: null,
    }),
    /All redraw timed out/
  );
  assert.deepEqual(page.clicks, []);
});

test("summary annual rejects a row-count race before clicking", async () => {
  previewFileNames = ["Acme_627_SAR_2025.pdf"];
  const page = fakePage({ expectedTotal: 2 });
  const result = await runSummaryAnnualNotice({
    page,
    selectors: {},
    meta: { planId: 627, reportYear: 2025 },
    jobCtx: null,
  });

  assert.equal(result.result, "Failed");
  assert.equal(result.reason, "Preview row count changed after selecting All");
  assert.equal(result.details.expectedTotal, 2);
  assert.equal(result.details.fileCount, 1);
  assert.equal(result.details.countMatches, false);
  assert.deepEqual(page.clicks, []);
});

test("summary annual rejects a row without a filename", async () => {
  previewFileNames = ["Acme_627_SAR_2025.pdf", null];
  const page = fakePage({ expectedTotal: 2 });
  const result = await runSummaryAnnualNotice({
    page,
    selectors: {},
    meta: { planId: 627, reportYear: 2025 },
    jobCtx: null,
  });

  assert.equal(result.result, "Failed");
  assert.equal(result.details.countMatches, true);
  assert.equal(result.details.hasMissingFileName, true);
  assert.deepEqual(page.clicks, []);
});

test("summary annual rejects an unchecked participant before OCR/click", async () => {
  previewFileNames = ["Acme_627_SAR_2025.pdf", "Beta_627_SAR_2025.pdf"];
  const page = fakePage({
    selectionState: {
      count: 2,
      checkedCount: 1,
      enabledCount: 2,
      values: ["participant-1", "participant-2"],
    },
  });
  const result = await runSummaryAnnualNotice({
    page,
    selectors: {},
    meta: { planId: 627, reportYear: 2025 },
    jobCtx: null,
  });

  assert.equal(result.result, "Failed");
  assert.equal(result.details.checkedCount, 1);
  assert.deepEqual(page.clicks, []);
});

test("summary annual rejects a disabled participant before OCR/click", async () => {
  previewFileNames = ["Acme_627_SAR_2025.pdf"];
  const page = fakePage({
    selectionState: {
      count: 1,
      checkedCount: 1,
      enabledCount: 0,
      values: ["participant-1"],
    },
  });
  const result = await runSummaryAnnualNotice({
    page,
    selectors: {},
    meta: { planId: 627, reportYear: 2025 },
    jobCtx: null,
  });

  assert.equal(result.result, "Failed");
  assert.equal(result.details.enabledCount, 0);
  assert.deepEqual(page.clicks, []);
});

test("summary annual rejects participant selection drift before click", async () => {
  previewFileNames = ["Acme_627_SAR_2025.pdf", "Beta_627_SAR_2025.pdf"];
  const page = fakePage({
    selectionStates: [
      {
        count: 2,
        checkedCount: 2,
        enabledCount: 2,
        values: ["participant-1", "participant-2"],
      },
      {
        count: 1,
        checkedCount: 1,
        enabledCount: 1,
        values: ["participant-1"],
      },
    ],
  });

  await assert.rejects(
    runSummaryAnnualNotice({
      page,
      selectors: {},
      meta: { planId: 627, reportYear: 2025 },
      jobCtx: null,
    }),
    { code: "SAR_PREVIEW_SELECTION_CHANGED" }
  );
  assert.deepEqual(page.clicks, []);
});

test("summary annual sends valid rows and accepts the confirmation dialog", async () => {
  previewFileNames = ["Acme_627_SAR_2025.pdf", "Beta-627-SAR-2025.pdf"];
  const page = fakePage();
  const result = await runSummaryAnnualNotice({
    page,
    selectors: {},
    meta: { planId: 627, reportYear: 2025 },
    jobCtx: null,
  });

  assert.equal(result.result, "Succeeded");
  assert.equal(result.details.reportYear, 2025);
  assert.equal(result.details.fileCount, 2);
  assert.equal(result.details.fileNames, undefined);
  assert.equal(result.details.mode, "send");
  assert.equal(result.details.emailTriggered, true);
  assert.equal(result.details.triggerContractMatched, true);
  assert.equal(result.details.documentGate.manifestStable, true);
  assert.equal(result.details.documentGate.objectVersionStable, true);
  assert.deepEqual(page.clicks, ["#triggerEmail"]);
  assert.deepEqual(page.registeredListeners, ["dialog"]);
  assert.deepEqual(page.dialogAccepts, ["#triggerEmail"]);
  assert.deepEqual(page.removedListeners, ["dialog"]);
  assert.deepEqual(page.triggerContractReads, [
    "#triggerEmail",
    "#triggerEmail",
  ]);
});

test("summary annual verify_only validates the trigger contract but never clicks", async () => {
  previewFileNames = ["Acme_627_SAR_2025.pdf"];
  const page = fakePage();
  const result = await runSummaryAnnualNotice({
    page,
    selectors: {},
    meta: { planId: 627, reportYear: 2025, mode: "verify_only" },
    jobCtx: null,
  });

  assert.equal(result.result, "Succeeded");
  assert.equal(result.details.mode, "verify_only");
  assert.equal(result.details.emailTriggered, false);
  assert.equal(result.details.triggerContractMatched, true);
  assert.deepEqual(page.clicks, []);
  assert.deepEqual(page.registeredListeners, []);
  assert.deepEqual(page.triggerContractReads, ["#triggerEmail"]);
});

test("summary annual accepts the source-verified portal jQuery contract", async () => {
  previewFileNames = ["Acme_627_SAR_2025.pdf"];
  const responses = successfulJavascriptTriggerResponses();
  const page = fakePage({
    triggerHref: "/preview",
    triggerJqueryHandlerMatched: true,
    triggerDirectClickHandlerCount: 1,
    triggerResponses: [responses.processResponse, responses.redirectResponse],
  });
  const result = await runSummaryAnnualNotice({
    page,
    selectors: {},
    meta: { planId: 627, reportYear: 2025 },
    jobCtx: null,
  });

  assert.equal(result.result, "Succeeded");
  assert.equal(result.details.emailTriggered, true);
  assert.equal(result.details.triggerContractVersion, "jquery_post_v1");
  assert.deepEqual(page.clicks, ["#triggerEmail"]);
  assert.deepEqual(page.dialogAccepts, ["#triggerEmail"]);
});

test("summary annual rejects duplicate direct jQuery trigger handlers", async () => {
  previewFileNames = ["Acme_627_SAR_2025.pdf"];
  const page = fakePage({
    triggerHref: "/preview",
    triggerJqueryHandlerMatched: true,
    triggerDirectClickHandlerCount: 2,
  });
  const result = await runSummaryAnnualNotice({
    page,
    selectors: {},
    meta: { planId: 627, reportYear: 2025, mode: "verify_only" },
    jobCtx: null,
  });

  assert.equal(result.result, "Failed");
  assert.equal(result.details.triggerContractMatched, false);
  assert.deepEqual(page.clicks, []);
  assert.deepEqual(page.registeredListeners, []);
});

test("summary annual removes the response observer when the atomic recheck fails", async () => {
  previewFileNames = ["Acme_627_SAR_2025.pdf"];
  const page = fakePage({
    triggerHref: "/preview",
    triggerJqueryHandlerMatched: true,
    triggerDirectClickHandlerCount: 1,
    preClickStateChanged: true,
  });
  const result = await runSummaryAnnualNotice({
    page,
    selectors: {},
    meta: { planId: 627, reportYear: 2025 },
    jobCtx: null,
  });

  assert.equal(result.result, "Failed");
  assert.deepEqual(page.registeredListeners, ["dialog", "response"]);
  assert.deepEqual(page.removedListeners, ["response", "dialog"]);
  assert.equal(page.requestGuardRoutes.length, 1);
  assert.equal(page.removedRequestGuardRoutes.length, 1);
});

test("summary annual aborts a mode-changing POST before it reaches the portal", async () => {
  previewFileNames = ["Acme_627_SAR_2025.pdf"];
  const responses = successfulJavascriptTriggerResponses({
    postData: `${DEFAULT_TRIGGER_POST_DATA}&comm_method=paper`,
  });
  const page = fakePage({
    triggerHref: "/preview",
    triggerJqueryHandlerMatched: true,
    triggerDirectClickHandlerCount: 1,
    triggerResponses: [responses.processResponse, responses.redirectResponse],
  });
  const result = await runSummaryAnnualNotice({
    page,
    selectors: {},
    meta: { planId: 627, reportYear: 2025 },
    jobCtx: null,
  });

  assert.equal(result.result, "Unknown Outcome");
  assert.equal(result.details.stage, "pre-network-request-contract");
  assert.equal(result.details.failureCode, "trigger_request_shape_mismatch");
  assert.equal(page.continuedRequestCount, 0);
  assert.equal(page.abortedRequestCount, 1);
  assert.equal(page.requestGuardRoutes.length, 1);
  assert.equal(page.removedRequestGuardRoutes.length, 1);
});

test("summary annual fails closed on a side-effect request after the redirect", async () => {
  previewFileNames = ["Acme_627_SAR_2025.pdf"];
  const responses = successfulJavascriptTriggerResponses();
  const page = fakePage({
    triggerHref: "/preview",
    triggerJqueryHandlerMatched: true,
    triggerDirectClickHandlerCount: 1,
    triggerResponses: [responses.processResponse, responses.redirectResponse],
    postRedirectRequest: fakeRequest({
      url: "https://employer.forusall.com/alternate_email_process",
      method: "POST",
      postData: DEFAULT_TRIGGER_POST_DATA,
    }),
  });
  const result = await runSummaryAnnualNotice({
    page,
    selectors: {},
    meta: { planId: 627, reportYear: 2025 },
    jobCtx: null,
  });

  assert.equal(result.result, "Unknown Outcome");
  assert.equal(result.details.stage, "post-click-request-count");
  assert.equal(result.details.failureCode, "trigger_request_count_mismatch");
  assert.equal(page.continuedRequestCount, 1);
  assert.equal(page.abortedRequestCount, 1);
  assert.equal(page.requestGuardRoutes.length, 1);
  assert.equal(page.removedRequestGuardRoutes.length, 1);
});

test("summary annual rejects hostile trigger URLs before verify_only or send", async (t) => {
  previewFileNames = ["Acme_627_SAR_2025.pdf"];
  const cases = [
    {
      name: "other plan",
      triggerHref: DEFAULT_TRIGGER_URL.replace("plan=627", "plan=628"),
      mode: "verify_only",
    },
    {
      name: "other email type",
      triggerHref: DEFAULT_TRIGGER_URL.replace(
        "email_type=summary_annual_notice",
        "email_type=year_end_notice"
      ),
      mode: "send",
    },
    {
      name: "other participant",
      triggerHref: DEFAULT_TRIGGER_URL.replace(
        "participant_id=0",
        "participant_id=1"
      ),
      mode: "send",
    },
    {
      name: "other user",
      triggerHref: DEFAULT_TRIGGER_URL.replace("user_id=0", "user_id=1"),
      mode: "verify_only",
    },
    {
      name: "duplicate critical parameter",
      triggerHref: `${DEFAULT_TRIGGER_URL}&plan=627`,
      mode: "send",
    },
    {
      name: "duplicate noncritical parameter",
      triggerHref: `${DEFAULT_TRIGGER_URL}&year=2026`,
      mode: "verify_only",
    },
    {
      name: "unexpected parameter",
      triggerHref: `${DEFAULT_TRIGGER_URL}&unexpected=value`,
      mode: "send",
    },
    {
      name: "missing parameter",
      triggerHref: DEFAULT_TRIGGER_URL.replace("&year=2026", ""),
      mode: "verify_only",
    },
    {
      name: "unbound JavaScript anchor",
      triggerHref: "/preview",
      mode: "verify_only",
    },
    {
      name: "non-anchor control",
      pageOptions: { triggerTagName: "BUTTON" },
      mode: "send",
    },
    {
      name: "null href",
      pageOptions: { triggerHref: null },
      mode: "verify_only",
    },
    {
      name: "missing control",
      pageOptions: {
        triggerLookupError: new Error("No element found for selector"),
      },
      mode: "send",
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const page = fakePage({
        ...(scenario.pageOptions || {}),
        ...(scenario.triggerHref === undefined
          ? {}
          : { triggerHref: scenario.triggerHref }),
      });
      const result = await runSummaryAnnualNotice({
        page,
        selectors: {},
        meta: {
          planId: 627,
          reportYear: 2025,
          mode: scenario.mode,
        },
        jobCtx: null,
      });

      assert.equal(result.result, "Failed");
      assert.match(
        result.reason,
        /^Trigger Email control did not match the verified portal contract \([a-z_]+\)$/
      );
      assert.equal(result.details.triggerContractMatched, false);
      assert.equal(result.details.triggerContractDiagnostic.matched, false);
      assert.match(
        result.details.triggerContractDiagnostic.failureCode,
        /^[a-z_]+$/
      );
      assert.doesNotMatch(JSON.stringify(result.details), /evil\.example|unexpected=value/);
      assert.deepEqual(page.clicks, []);
      assert.deepEqual(page.registeredListeners, []);
      assert.deepEqual(page.triggerContractReads, ["#triggerEmail"]);
    });
  }
});

test("summary annual refuses a trigger binding that changes before the atomic click", async (t) => {
  previewFileNames = ["Acme_627_SAR_2025.pdf"];
  const cases = [
    {
      name: "href changed",
      pageOptions: {
        triggerHrefAtClick: DEFAULT_TRIGGER_URL.replace("plan=627", "plan=628"),
      },
    },
    {
      name: "page changed",
      pageOptions: {
        previewUrlAtClick: DEFAULT_PREVIEW_URL.replace("plan=627", "plan=628"),
      },
    },
    {
      name: "element type changed",
      pageOptions: { triggerTagNameAtClick: "BUTTON" },
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const page = fakePage(scenario.pageOptions);
      const result = await runSummaryAnnualNotice({
        page,
        selectors: {},
        meta: { planId: 627, reportYear: 2025, mode: "send" },
        jobCtx: null,
      });

      assert.equal(result.result, "Failed");
      assert.equal(
        result.reason,
        "Trigger Email control changed after portal validation"
      );
      assert.deepEqual(result.details, { triggerContractMatched: false });
      assert.deepEqual(page.clicks, []);
      assert.deepEqual(page.triggerContractReads, [
        "#triggerEmail",
        "#triggerEmail",
      ]);
      assert.deepEqual(page.removedListeners, ["dialog"]);
    });
  }
});

test("summary annual refuses manifest or selection drift at the atomic click", async () => {
  previewFileNames = ["Acme_627_SAR_2025.pdf"];
  const page = fakePage({ preClickStateChanged: true });
  const result = await runSummaryAnnualNotice({
    page,
    selectors: {},
    meta: { planId: 627, reportYear: 2025, mode: "send" },
    jobCtx: null,
  });

  assert.equal(result.result, "Failed");
  assert.equal(
    result.reason,
    "Preview state changed after document verification"
  );
  assert.deepEqual(result.details, {
    manifestStable: false,
    selectionStable: false,
    emailTriggered: false,
  });
  assert.deepEqual(page.clicks, []);
  assert.deepEqual(page.removedListeners, ["dialog"]);
});

test("summary annual never accepts a success alert from another origin", async () => {
  previewFileNames = ["Acme_627_SAR_2025.pdf"];
  const page = fakePage({
    postClickUrl: "https://evil.example/trigger_emails",
    alertType: "success",
  });
  const result = await runSummaryAnnualNotice({
    page,
    selectors: {},
    meta: { planId: 627, reportYear: 2025, mode: "send" },
    jobCtx: null,
  });

  assert.equal(result.result, "Unknown Outcome");
  assert.equal(result.details.stage, "post-click-navigation");
  assert.doesNotMatch(JSON.stringify(result), /Succeeded/);
});

test("summary annual rejects an explicit error alert after redirect", async () => {
  previewFileNames = ["Acme_627_SAR_2025.pdf"];
  const page = fakePage({
    alertType: "error",
    alertMessage: "Email delivery rejected",
  });
  const result = await runSummaryAnnualNotice({
    page,
    selectors: {},
    meta: { planId: 627, reportYear: 2025 },
    jobCtx: null,
  });

  assert.equal(result.result, "Failed");
  assert.equal(result.reason, "Email trigger failed with error alert");
  assert.deepEqual(result.details, { portalErrorDetected: true });
  assert.doesNotMatch(JSON.stringify(result.details), /Email delivery rejected/);
});

test("summary annual rejects a redirect without a success confirmation", async () => {
  previewFileNames = ["Acme_627_SAR_2025.pdf"];
  const page = fakePage({ alertType: "none" });
  const result = await runSummaryAnnualNotice({
    page,
    selectors: {},
    meta: { planId: 627, reportYear: 2025 },
    jobCtx: null,
  });

  assert.equal(result.result, "Unknown Outcome");
  assert.equal(
    result.reason,
    "No success confirmation alert found after redirect"
  );
});

test("summary annual treats a click exception as unknown outcome", async () => {
  previewFileNames = ["Acme_627_SAR_2025.pdf"];
  const page = fakePage({ clickError: new Error("trigger button disabled") });

  const result = await runSummaryAnnualNotice({
    page,
    selectors: {},
    meta: { planId: 627, reportYear: 2025 },
    jobCtx: null,
  });
  assert.equal(result.result, "Unknown Outcome");
  assert.deepEqual(result.details, { stage: "post-click-exception" });
  assert.deepEqual(page.removedListeners, ["dialog"]);
});

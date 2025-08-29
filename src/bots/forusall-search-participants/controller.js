// src/bots/forusall-search-participants/controller.js
const queue = require("../../engine/queue");
const { FIXED } = require("../../providers/forusall/config");

function onlyDigits(s) {
  return String(s || "").replace(/\D+/g, "");
}

/** Normaliza y valida el payload de entrada */
function normalizeInput(body) {
  const raw = body && typeof body === "object" ? body : {};
  const criteriaIn =
    raw.criteria && typeof raw.criteria === "object" ? raw.criteria : {};
  const optionsIn =
    raw.options && typeof raw.options === "object" ? raw.options : {};

  // --- criteria ---
  let companyName = String(criteriaIn.companyName || "").trim();
  let fullName = String(criteriaIn.fullName || "")
    .replace(/\s+/g, " ")
    .trim();
  let email = String(criteriaIn.email || "").trim();
  let ssn = onlyDigits(criteriaIn.ssn);
  let phone = onlyDigits(criteriaIn.phone);
  let participantId =
    criteriaIn.participantId != null
      ? String(criteriaIn.participantId).trim()
      : "";

  const hasAny =
    companyName || fullName || email || ssn || phone || participantId;

  if (!hasAny) {
    const err = new Error('At least one field must be sent in "criteria"');
    err.http = 400;
    throw err;
  }

  if (ssn && !(ssn.length === 4 || ssn.length === 9)) {
    const err = new Error("The SSN must have 4 or 9 digits");
    err.http = 422;
    throw err;
  }

  if (phone && phone.length !== 10) {
    const err = new Error("The phone number must contain exactly 10 digits");
    err.http = 422;
    throw err;
  }

  const criteria = {
    companyName: companyName || null,
    fullName: fullName || null,
    email: email || null,
    ssn: ssn || null,
    phone: phone || null,
    participantId: participantId || null,
  };

  // --- options ---
  const options = {
    fetchAllPages: !!optionsIn.fetchAllPages,
    pageLimit: Math.max(
      1,
      Number.isFinite(+optionsIn.pageLimit) ? +optionsIn.pageLimit : 1
    ),
    maxRows: Math.max(
      1,
      Number.isFinite(+optionsIn.maxRows) ? +optionsIn.maxRows : 25
    ),
    evidenceOnSuccess: !!optionsIn.evidenceOnSuccess,
    timeoutMs: Math.max(
      5000,
      Number.isFinite(+optionsIn.timeoutMs) ? +optionsIn.timeoutMs : 12000
    ),
  };

  return { criteria, options };
}

module.exports = async function controller(req, res) {
  try {
    const { criteria, options } = normalizeInput(req.body);

    const a = req.auth || {};
    const u = a.user || {};
    const createdBy = {
      name: u.name || null,
      email: u.email || null,
      id: u.id || null,
      role: a.role || (a.isAdmin ? "admin" : "user"),
      at: new Date().toISOString(),
    };

    const meta = {
      loginUrl: FIXED.loginUrl,
      selectors: FIXED.selectors, // login + otp
      search: FIXED.participantSearch, // url + selectores de la vista de búsqueda
      criteria,
      options,
      createdBy,
    };

    const accepted = queue.submit({
      botId: "search-participants",
      meta: {
        criteria,
        options,
        createdBy,
      },
      run: async (jobCtx) => {
        const runFlow = require("./runFlow");
        return runFlow({ meta, jobCtx });
      },
    });

    res.set("Location", `/forusbot/jobs/${accepted.jobId}`);
    return res.status(202).json({
      ok: true,
      jobId: accepted.jobId,
      acceptedAt: accepted.acceptedAt,
      queuePosition: accepted.queuePosition,
      estimate: accepted.estimate,
      capacitySnapshot: accepted.capacitySnapshot,
    });
  } catch (e) {
    const code = e && e.http ? e.http : 500;
    return res
      .status(code)
      .json({ ok: false, error: e.message || "Internal error" });
  }
};

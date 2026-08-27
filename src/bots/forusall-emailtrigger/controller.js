// src/bots/forusall-emailtrigger/controller.js
const { FIXED } = require("../../providers/forusall/config");
const runFlow = require("./runFlow");
const logger = require("../../engine/logger");
const {
  submitIdempotently,
  toIdempotencyHttpError,
} = require("../../engine/idempotency");
const {
  buildEmailFingerprintPayload,
  normalizeEmailTriggerMode,
  normalizeExpectedDocument,
  normalizeReportYear,
} = require("./validation");
const { isDocumentGateConfigured } = require("./documentGate");

const ALLOWED_TYPES = new Set([
  "monthly_balance",
  "onboard_communications",
  "new_hire_communications",
  "year_end_notice",
  "notify_auto-escalation",
  "summary_annual_notice",
  "statement_notice",
  "sponsor_quarterly_email",
  "generic_email",
  "force_out",
]);

const GENERIC_KINDS = new Set([
  "onboard_communications",
  "new_hire_communications",
  "year_end_notice",
  "notify_auto-escalation",
  "summary_annual_notice",
  "other",
]);

function bad(msg, res, extra = {}) {
  return res.status(400).json({ ok: false, error: msg, ...extra });
}

function unavailable(msg, res) {
  return res.status(503).json({ ok: false, error: msg });
}

function forbidden(msg, res) {
  return res.status(403).json({ ok: false, error: msg });
}

module.exports = async function controller(req, res) {
  try {
    const body = req.body || {};

    // Requeridos
    const planId = Number(body.planId);
    const emailType = String(body.emailType || "").trim();

    const missing = [];
    if (!Number.isSafeInteger(planId) || planId <= 0)
      missing.push("planId (entero > 0)");
    if (!emailType) missing.push("emailType");
    if (missing.length)
      return bad("Campos faltantes o inválidos", res, { missing });

    if (!ALLOWED_TYPES.has(emailType)) {
      return bad(
        `emailType inválido. Permitidos: ${Array.from(ALLOWED_TYPES).join(
          ", "
        )}`,
        res
      );
    }

    let reportYear = null;
    const mode = normalizeEmailTriggerMode(body.mode);
    if (mode === null) {
      return bad("mode inválido. Permitidos: send, verify_only", res);
    }
    const replayOnlyHeader = req.get("Idempotency-Replay-Only");
    const normalizedReplayOnly = String(replayOnlyHeader || "")
      .trim()
      .toLowerCase();
    if (
      replayOnlyHeader !== undefined &&
      !["true", "false"].includes(normalizedReplayOnly)
    ) {
      return bad("Idempotency-Replay-Only debe ser true o false", res);
    }
    const replayOnly = normalizedReplayOnly === "true";
    if (replayOnly && (emailType !== "summary_annual_notice" || mode !== "send")) {
      return bad(
        "Idempotency-Replay-Only sólo se permite para summary_annual_notice en mode=send",
        res
      );
    }
    const allowedModes = req.auth?.tokenMeta?.allowedEmailTriggerModes;
    if (Array.isArray(allowedModes) && !allowedModes.includes(mode)) {
      return forbidden("email trigger mode is not allowed for this token", res);
    }

    let expectedDocument = null;
    if (emailType === "summary_annual_notice") {
      reportYear = normalizeReportYear(body.reportYear);
      if (reportYear === null) {
        return bad(
          "summary_annual_notice requiere reportYear como año de 4 dígitos",
          res
        );
      }
      if (!isDocumentGateConfigured()) {
        return unavailable(
          "SAR preview document verification is not configured",
          res
        );
      }
      expectedDocument = normalizeExpectedDocument(body.expectedDocument, {
        planId,
        planYear: reportYear,
      });
      if (!expectedDocument) {
        return bad(
          "summary_annual_notice requiere expectedDocument válido",
          res
        );
      }
    } else if (mode !== "send" || body.expectedDocument !== undefined) {
      return bad(
        "mode=verify_only y expectedDocument sólo se permiten para summary_annual_notice",
        res
      );
    }

    // Defaults
    const participants = body.participants === "all" ? "all" : "all"; // siempre all por tu requerimiento

    // Condicionales
    let statement = null;
    let sponsorQuarterly = null;
    let onboardOrNewHire = null;
    let genericEmail = null;

    if (emailType === "statement_notice") {
      const st = body.statement || {};
      if (
        st.year === undefined ||
        st.quarter === undefined ||
        st.season === undefined
      ) {
        return bad(
          "statement_notice requiere {statement:{year,quarter,season}}",
          res
        );
      }
      statement = {
        year: Number(st.year),
        quarter: Number(st.quarter),
        season: String(st.season),
      };
    }

    if (emailType === "sponsor_quarterly_email") {
      const sp = body.sponsorQuarterly || {};
      const reqs = [
        "year",
        "quarter",
        "caNoteSubject",
        "caNoteDetails",
        "caUrl",
        "quarterlyInvestmentReviewUrl",
        "nextReviewDate",
        "nextReviewTime",
      ];
      const miss = reqs.filter(
        (k) =>
          sp[k] === undefined || sp[k] === null || String(sp[k]).trim() === ""
      );
      if (miss.length)
        return bad("sponsor_quarterly_email: faltan campos", res, {
          missing: miss,
        });
      sponsorQuarterly = {
        year: Number(sp.year),
        quarter: Number(sp.quarter),
        caNoteSubject: String(sp.caNoteSubject),
        caNoteDetails: String(sp.caNoteDetails),
        caUrl: String(sp.caUrl),
        quarterlyInvestmentReviewUrl: String(sp.quarterlyInvestmentReviewUrl),
        nextReviewDate: String(sp.nextReviewDate), // YYYY-MM-DD
        nextReviewTime: String(sp.nextReviewTime), // HH:mm
      };
    }

    if (
      emailType === "onboard_communications" ||
      emailType === "new_hire_communications"
    ) {
      const onh = body.onboardOrNewHire || {};
      onboardOrNewHire = {
        rkType: onh.rkType || null, // requerido solo para onboard_communications
        planSnapshot: onh.planSnapshot || null, // requerido para onboard_communications
        emailToSend: onh.emailToSend || "onboard_email",
        conversationId: onh.conversationId ?? null,
        attachments: Array.isArray(onh.attachments) ? onh.attachments : [],
      };
      if (
        emailType === "onboard_communications" &&
        !onboardOrNewHire.planSnapshot
      ) {
        return bad(
          "onboard_communications requiere onboardOrNewHire.planSnapshot",
          res
        );
      }
    }

    if (emailType === "generic_email") {
      const ge = body.genericEmail || {};
      const sub = ge.subType || {};
      if (!GENERIC_KINDS.has(String(sub.kind || ""))) {
        return bad(
          `generic_email: subType.kind inválido. Permitidos: ${Array.from(
            GENERIC_KINDS
          ).join(", ")}`,
          res
        );
      }
      if (sub.kind === "other" && !sub.otherText) {
        return bad(
          "generic_email: subType.kind='other' requiere subType.otherText",
          res
        );
      }
      if (sub.kind === "onboard_communications") {
        if (!sub.emailToSend)
          return bad("generic_email: subType.emailToSend requerido", res);
        // rkType opcional pero recomendable
      }
      if (sub.kind === "new_hire_communications") {
        if (!sub.emailToSend)
          return bad("generic_email: subType.emailToSend requerido", res);
      }

      genericEmail = {
        audience: {
          enrolled: !!(ge.audience && ge.audience.enrolled),
          notEnrolled: !!(ge.audience && ge.audience.notEnrolled),
          terminated: !!(ge.audience && ge.audience.terminated),
          ineligible: !!(ge.audience && ge.audience.ineligible),
          terminatedParticipants:
            ge.audience?.terminatedParticipants || undefined,
        },
        planSnapshot: ge.planSnapshot || null,
        subType: {
          kind: String(sub.kind),
          otherText: sub.otherText || null,
          rkType: sub.rkType || null,
          emailToSend: sub.emailToSend || null,
          conversationId: sub.conversationId ?? null,
          attachments: Array.isArray(sub.attachments) ? sub.attachments : [],
          terminatedParticipants: sub.terminatedParticipants || undefined,
        },
      };
    }

    const createdBy = body.createdBy || null;

    // Meta completa (no se persiste en la cola; se cierra en el closure)
    const meta = {
      loginUrl: FIXED.loginUrl,
      selectors: FIXED.selectors,
      triggerEmails: FIXED.triggerEmails,
      planId,
      emailType,
      reportYear,
      mode,
      expectedDocument,
      participants, // "all"
      statement,
      sponsorQuarterly,
      onboardOrNewHire,
      genericEmail,
      options: FIXED.options || {},
      createdBy,
    };

    // Encola con meta "pública" mínima
    const accepted = await submitIdempotently({
      idempotencyKey: req.get("Idempotency-Key"),
      botId: "forusall-emailtrigger",
      principalId: req.auth?.principalId || null,
      replayOnly,
      fingerprintPayload: buildEmailFingerprintPayload({
        planId,
        emailType,
        reportYear,
        participants,
        mode,
        expectedDocument,
        statement,
        sponsorQuarterly,
        onboardOrNewHire,
        genericEmail,
      }),
      meta: { planId, emailType, reportYear, mode, createdBy }, // lo que se expone
      account: req.auth && req.auth.account,
      run: async (jobCtx) => runFlow({ meta, jobCtx }),
    });

    res.set("Location", `/forusbot/jobs/${accepted.jobId}`);
    res.set("Idempotency-Replayed", String(accepted.replayed));
    return res.status(202).json({
      ok: true,
      jobId: accepted.jobId,
      acceptedAt: accepted.acceptedAt,
      queuePosition: accepted.queuePosition,
      estimate: accepted.estimate,
      capacitySnapshot: accepted.capacitySnapshot,
    });
  } catch (err) {
    const httpError = toIdempotencyHttpError(err);
    if (httpError) return res.status(httpError.status).json(httpError.body);
    logger.error({ type: "bot.emailtrigger.emailtrigger_controller_error", error: err });
    return res
      .status(500)
      .json({ ok: false, error: err.message || String(err) });
  }
};

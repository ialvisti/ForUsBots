// src/bots/forusall-mfa-reset/routes.js
const router = require("express").Router();
const requireUser = require("../../middleware/auth"); // auth por token
const queue = require("../../engine/queue");
const runFlow = require("./runFlow");
const { FIXED } = require("../../providers/forusall/config");

/**
 * POST /forusbot/mfa-reset
 * Body esperado: { participantId: string }
 * - Ignora cualquier otro campo enviado por el cliente.
 * - Construye meta interno (participantUrl, loginUrl, selectors, mfaReset).
 * - Encola el job (202) con queue.submit.
 */
router.post("/", requireUser, (req, res) => {
  try {
    const raw = req.body || {};
    const participantId = String(raw.participantId || "").trim();

    if (!participantId) {
      return res
        .status(400)
        .json({ ok: false, error: "participantId es requerido" });
    }

    const participantUrl = `https://employer.forusall.com/participants/${encodeURIComponent(
      participantId
    )}`;
    const loginUrl = "https://employer.forusall.com/sign_in";

    const meta = {
      participantId,
      participantUrl,
      loginUrl,
      // ⬇️ IMPORTANTE: pasar selectors y mfaReset al runner
      selectors: FIXED.selectors,
      mfaReset: FIXED.mfaReset,

      createdBy: req.auth
        ? {
            name: req.auth.user || null,
            role: req.auth.role || null,
            at: new Date().toISOString(),
          }
        : null,
    };

    const submitResp = queue.submit({
      botId: "forusall-mfa-reset",
      meta,
      run: async (jobCtx) => {
        return runFlow({ meta, jobCtx });
      },
    });

    return res.status(202).json({
      ok: true,
      jobId: submitResp.jobId,
      acceptedAt: submitResp.acceptedAt,
      queuePosition: submitResp.queuePosition,
      estimate: submitResp.estimate,
      capacitySnapshot: submitResp.capacitySnapshot,
      botId: "forusall-mfa-reset",
      meta: { participantId, participantUrl },
    });
  } catch (e) {
    console.error("[mfa-reset routes] submit error:", e);
    return res.status(500).json({ ok: false, error: "submit error" });
  }
});

module.exports = router;

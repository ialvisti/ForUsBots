// src/bots/forusall-mfa-reset/controller.js
const queue = require("../../engine/queue");
const { FIXED } = require("../../providers/forusall/config");
const runFlow = require("./runFlow");

module.exports = async function controller(req, res) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const participantId = body.participantId ?? body.participantID ?? body.id;

    if (!participantId || String(participantId).trim() === "") {
      return res
        .status(400)
        .json({ ok: false, error: "participantId es obligatorio" });
    }
    const normalizedParticipantId = String(participantId).trim();

    const meta = {
      participantId: normalizedParticipantId,
      participantUrl: (
        FIXED.participantUrlTemplate ||
        "https://employer.forusall.com/participants/{participantId}"
      ).replace("{participantId}", normalizedParticipantId),
      selectors: FIXED.selectors,
      mfaReset: FIXED.mfaReset,
      loginUrl: FIXED.loginUrl,
    };

    const job = queue.submit({
      botId: "forusall-mfa-reset",
      meta,
      run: async (jobCtx) => runFlow({ meta, jobCtx }),
    });

    // Respuesta 202 con metadatos mínimos (sin secretos)
    return res.status(202).json({
      ok: true,
      jobId: job.jobId,
      acceptedAt: job.acceptedAt,
      queuePosition: job.queuePosition,
      estimate: job.estimate,
      capacitySnapshot: job.capacitySnapshot,
      meta: {
        participantId: meta.participantId,
        participantUrl: meta.participantUrl,
      },
    });
  } catch (error) {
    console.error("[mfa-reset] Controller error:", error);
    return res
      .status(500)
      .json({ ok: false, error: "Error interno del servidor" });
  }
};

const queue = require("../../engine/queue");
const { FIXED } = require("../../providers/forusall/config");

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanStr(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
}

function clampTimeout(v, def = 30000, min = 5000, max = 120000) {
  const n = parseInt(v, 10);
  if (Number.isFinite(n)) return Math.max(min, Math.min(max, n));
  return def;
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function validateTiers(tiers) {
  if (!Array.isArray(tiers)) return "employer_contribution_formula debe ser un array.";
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    if (!isPlainObject(t)) return `tier[${i}] debe ser objeto.`;
    const m = Number(t.match_value);
    const p = Number(t.percent_pay);
    if (!Number.isFinite(m)) return `tier[${i}].match_value debe ser numérico.`;
    if (!Number.isFinite(p)) return `tier[${i}].percent_pay debe ser numérico.`;
  }
  return null;
}

module.exports = async function controller(req, res) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const planId = body.planId ?? body.planID ?? body.id ?? null;
    const note = cleanStr(
      body.note ?? body.description ?? body.noteDescription
    );

    if (!planId || String(planId).trim() === "") {
      return res
        .status(400)
        .json({ ok: false, error: "planId es obligatorio" });
    }
    if (!note) {
      return res.status(400).json({ ok: false, error: "note es obligatoria" });
    }
    if (!isPlainObject(body.updates)) {
      return res
        .status(400)
        .json({ ok: false, error: "updates es obligatorio (objeto)" });
    }

    const updates = body.updates;
    const errors = [];
    const warnings = [];

    const keys = Object.keys(updates);
    if (!keys.length) {
      return res
        .status(422)
        .json({ ok: false, error: "updates está vacío" });
    }

    for (const k of keys) {
      const v = updates[k];

      if (k === "employer_contribution_formula") {
        const err = validateTiers(v);
        if (err) errors.push(err);
        continue;
      }

      if (k.endsWith("_date") && v != null) {
        const s = cleanStr(v);
        if (s !== null && !ISO_DATE_RE.test(s)) {
          errors.push(`${k} debe ser yyyy-mm-dd.`);
        }
      }
    }

    if (errors.length) {
      return res
        .status(422)
        .json({ ok: false, error: "validation", details: errors, warnings });
    }

    const includeScreens = !!body.includeScreens;
    const timeoutMs = clampTimeout(body.timeoutMs);

    const a = req.auth || {};
    const u = a.user || {};
    const createdBy = {
      name: u.name || u.email || null,
      role: a.role || (a.isAdmin ? "admin" : "user"),
      at: new Date().toISOString(),
    };

    const meta = {
      loginUrl: FIXED.loginUrl,
      selectors: FIXED.selectors,
      planId: String(planId).trim(),
      note,
      updates,
      includeScreens,
      timeoutMs,
      createdBy,
    };

    const accepted = queue.submit({
      botId: "update-plan",
      meta: {
        planId: meta.planId,
        updatesPlanned: keys,
        notePreview: note.slice(0, 80),
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
      warnings,
      executedBy: createdBy,
    });
  } catch (e) {
    console.error("[forusall-update-plan controller]", e);
    return res
      .status(500)
      .json({ ok: false, error: e?.message || "Internal Error" });
  }
};

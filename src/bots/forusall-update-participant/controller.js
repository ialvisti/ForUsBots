const queue = require("../../engine/queue");
const { FIXED } = require("../../providers/forusall/config"); // loginUrl + selectors

// Etiquetas EXACTAS del módulo Census (web) -> clave interna
const LABEL_TO_KEY = new Map([
  ["First Name", "firstName"],
  ["Last Name", "lastName"],
  ["Preferred First Name", "preferredFirstName"],
  ["Preferred Last Name", "preferredLastName"],
  ["Eligibility Status", "eligibilityStatus"],
  ["Birth Date", "birthDate"],
  ["Hire Date", "hireDate"],
  ["Rehire Date", "rehireDate"],
  ["Termination Date", "terminationDate"],
  ["Projected Plan Entry Date", "projectedPlanEntryDate"],
  ["Address 1", "address1"],
  ["Address 2", "address2"],
  ["City", "city"],
  ["State", "state"],
  ["Zip Code", "zipcode"], // etiqueta en UI
  ["Zipcode", "zipcode"], // aceptamos sin espacio por si acaso
  ["Primary Email", "email"],
  ["Home Email", "homeEmail"],
  ["Phone", "phone"],
]);

const ELIGIBILITY_VALUES = new Set(["A", "D", "I", "X", "U"]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATE_RE = /^[A-Z]{2}$/i;

function cleanStr(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
}

function normalizeUpdates(updatesRaw) {
  const out = {};
  const unknown = [];

  for (const [label, value] of Object.entries(updatesRaw || {})) {
    const labelClean = String(label || "").trim();
    const key = LABEL_TO_KEY.get(labelClean);
    if (!key) {
      unknown.push(labelClean);
      continue;
    }
    out[key] = value;
  }

  return { updates: out, unknown };
}

module.exports = async function controller(req, res) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const participantId =
      body.participantId ?? body.participantID ?? body.id ?? null;
    const note = cleanStr(
      body.note ?? body.description ?? body.noteDescription
    );

    if (!participantId || String(participantId).trim() === "") {
      return res
        .status(400)
        .json({ ok: false, error: "participantId es obligatorio" });
    }
    if (!note) {
      return res.status(400).json({ ok: false, error: "note es obligatoria" });
    }
    if (!body.updates || typeof body.updates !== "object") {
      return res
        .status(400)
        .json({ ok: false, error: "updates es obligatorio" });
    }

    const { updates, unknown } = normalizeUpdates(body.updates);
    const errors = [];
    const warnings = [];

    if (unknown.length) {
      warnings.push({ type: "unknown_fields_ignored", fields: unknown });
    }

    const keys = Object.keys(updates);
    if (!keys.length) {
      return res.status(422).json({
        ok: false,
        error: "updates no contiene campos reconocidos del módulo Census",
        warnings,
      });
    }

    // Validaciones de valor
    if (updates.eligibilityStatus != null) {
      const v = cleanStr(updates.eligibilityStatus);
      if (!v || !ELIGIBILITY_VALUES.has(v))
        errors.push("Eligibility Status debe ser uno de A,D,I,X,U.");
      else updates.eligibilityStatus = v;
    }

    for (const k of [
      "birthDate",
      "hireDate",
      "rehireDate",
      "terminationDate",
      "projectedPlanEntryDate",
    ]) {
      if (updates[k] != null) {
        const v = cleanStr(updates[k]);
        if (v && !ISO_DATE_RE.test(v)) errors.push(`${k} debe ser yyyy-mm-dd.`);
        else updates[k] = v || ""; // permitimos limpiar
      }
    }

    if (updates.state != null) {
      const v = cleanStr(updates.state);
      if (v && !STATE_RE.test(v))
        errors.push("State debe ser código de 2 letras.");
      else updates.state = v || "";
    }

    if (errors.length) {
      return res
        .status(422)
        .json({ ok: false, error: "validation", details: errors, warnings });
    }

    // quién ejecuta
    const a = req.auth || {};
    const u = a.user || {};
    const createdBy = {
      name: u.name || u.email || null,
      role: a.role || (a.isAdmin ? "admin" : "user"),
      at: new Date().toISOString(),
    };

    // meta para el flow
    const meta = {
      loginUrl: FIXED.loginUrl,
      selectors: FIXED.selectors, // {user, pass, loginButton, otpInput, otpSubmit}
      participantId: String(participantId).trim(),
      note,
      updates, // ya normalizado a claves internas
      createdBy,
    };

    const accepted = queue.submit({
      botId: "update-participant",
      meta: {
        participantId: meta.participantId,
        updatesPlanned: Object.keys(updates),
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
    console.error("[forusall-update-participant controller]", e);
    return res
      .status(500)
      .json({ ok: false, error: e?.message || "Internal Error" });
  }
};

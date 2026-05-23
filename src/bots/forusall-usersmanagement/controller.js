const queue = require("../../engine/queue");
const { FIXED } = require("../../providers/forusall/config");
const logger = require("../../engine/logger");

const VALID_ROLES = new Set([1, 2, 3, 4, 5, 6]);
const VALID_RESET_MFA = new Set(["employer", "admin", "both", "none"]);

const FIELD_KEYS = new Set([
  "firstName",
  "lastName",
  "email",
  "password",
  "passwordConfirmation",
  "role",
  "sponsorIds",
  "userGroupIds",
  "payrollSetupIds",
  "active",
  "isNewDashboardUser",
  "participantId",
  "notAnEmployee",
  "commSettings",
]);

const COMM_KEYS = new Set([
  "payrollTransaction",
  "monthlyEligibleParticipants",
  "sponsorQuarterlyEmail",
  "simpleUploadReminder",
  "payrollUpdatesEmail",
  "loanUpdatesEmail",
]);

function cleanStr(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
}

function clampTimeout(v, def = 30000, min = 5000, max = 180000) {
  const n = parseInt(v, 10);
  if (Number.isFinite(n)) return Math.max(min, Math.min(max, n));
  return def;
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function toBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(s)) return true;
    if (["false", "0", "no", "n"].includes(s)) return false;
  }
  return null;
}

function validateIdArray(name, v, errors) {
  if (!Array.isArray(v)) {
    errors.push(`${name} debe ser un array de IDs numéricos.`);
    return null;
  }
  const ids = [];
  for (let i = 0; i < v.length; i++) {
    const n = Number(v[i]);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      errors.push(`${name}[${i}] debe ser un entero positivo.`);
      return null;
    }
    ids.push(n);
  }
  return ids;
}

function normalizeUserFields(input, { mode }, errors, warnings) {
  if (!isPlainObject(input)) {
    errors.push(mode === "create" ? "user es obligatorio (objeto)." : "updates es obligatorio (objeto).");
    return null;
  }
  const out = {};

  for (const k of Object.keys(input)) {
    if (!FIELD_KEYS.has(k)) {
      warnings.push(`Campo desconocido ignorado: ${k}`);
      continue;
    }
    const v = input[k];

    switch (k) {
      case "firstName":
      case "lastName":
      case "email":
      case "password":
      case "passwordConfirmation":
      case "participantId": {
        if (v === null) {
          out[k] = "";
        } else if (typeof v === "string") {
          out[k] = v;
        } else {
          errors.push(`${k} debe ser string.`);
        }
        break;
      }
      case "role": {
        const n = Number(v);
        if (!Number.isFinite(n) || !VALID_ROLES.has(n)) {
          errors.push(`role debe ser uno de 1..6 (forus_admin, sponsor_admin, sponsor_rep, super_admin, cs_admin, auditor).`);
        } else {
          out.role = n;
        }
        break;
      }
      case "sponsorIds":
      case "userGroupIds":
      case "payrollSetupIds": {
        const ids = validateIdArray(k, v, errors);
        if (ids !== null) out[k] = ids;
        break;
      }
      case "active":
      case "isNewDashboardUser":
      case "notAnEmployee": {
        const b = toBool(v);
        if (b === null) errors.push(`${k} debe ser booleano (true/false).`);
        else out[k] = b;
        break;
      }
      case "commSettings": {
        if (!isPlainObject(v)) {
          errors.push("commSettings debe ser un objeto.");
          break;
        }
        const comm = {};
        for (const ck of Object.keys(v)) {
          if (!COMM_KEYS.has(ck)) {
            warnings.push(`commSettings.${ck} desconocido — ignorado.`);
            continue;
          }
          const b = toBool(v[ck]);
          if (b === null) {
            errors.push(`commSettings.${ck} debe ser booleano.`);
            continue;
          }
          comm[ck] = b;
        }
        if (Object.keys(comm).length) out.commSettings = comm;
        break;
      }
      default:
        warnings.push(`Campo no manejado: ${k}`);
    }
  }

  if (out.email != null && out.email !== "") {
    const e = out.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      errors.push("email no tiene formato válido.");
    }
  }

  const hasPwd = out.password != null && out.password !== "";
  const hasConf = out.passwordConfirmation != null && out.passwordConfirmation !== "";
  if (hasPwd !== hasConf) {
    errors.push("password y passwordConfirmation deben ir juntos.");
  } else if (hasPwd && hasConf && out.password !== out.passwordConfirmation) {
    errors.push("password y passwordConfirmation no coinciden.");
  }

  return out;
}

async function createController(req, res) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const note = cleanStr(body.note);
    if (!note) {
      return res.status(400).json({ ok: false, error: "note es obligatoria" });
    }
    if (!isPlainObject(body.user)) {
      return res.status(400).json({ ok: false, error: "user es obligatorio (objeto)" });
    }

    const errors = [];
    const warnings = [];
    const user = normalizeUserFields(body.user, { mode: "create" }, errors, warnings);

    if (user) {
      if (!cleanStr(user.email)) errors.push("email es obligatorio.");
      if (!cleanStr(user.password)) errors.push("password es obligatorio.");
      if (!cleanStr(user.passwordConfirmation)) errors.push("passwordConfirmation es obligatorio.");
    }

    if (errors.length) {
      return res.status(422).json({ ok: false, error: "validation", details: errors, warnings });
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
      mode: "create",
      loginUrl: FIXED.loginUrl,
      selectors: FIXED.selectors,
      usersManagement: FIXED.usersManagement,
      user,
      note,
      includeScreens,
      timeoutMs,
      createdBy,
    };

    const accepted = queue.submit({
      botId: "users-management",
      meta: {
        mode: "create",
        emailPreview: user.email || null,
        notePreview: note.slice(0, 80),
        createdBy,
      },
      account: req.auth && req.auth.account,
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
    logger.error({ type: "bot.users_management.create_controller_error", error: e });
    return res.status(500).json({ ok: false, error: e?.message || "Internal Error" });
  }
}

async function editController(req, res) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const userIdRaw = body.userId ?? body.userID ?? body.id ?? null;
    const userIdNum = Number(userIdRaw);
    if (!Number.isFinite(userIdNum) || !Number.isInteger(userIdNum) || userIdNum <= 0) {
      return res.status(400).json({ ok: false, error: "userId es obligatorio y debe ser un entero positivo" });
    }

    const note = cleanStr(body.note);
    if (!note) {
      return res.status(400).json({ ok: false, error: "note es obligatoria" });
    }
    if (!isPlainObject(body.updates)) {
      return res.status(400).json({ ok: false, error: "updates es obligatorio (objeto)" });
    }

    const errors = [];
    const warnings = [];
    const updates = normalizeUserFields(body.updates, { mode: "edit" }, errors, warnings);
    const resetMfa = body.resetMfa == null ? "none" : String(body.resetMfa).trim().toLowerCase();
    if (!VALID_RESET_MFA.has(resetMfa)) {
      errors.push(`resetMfa debe ser uno de: ${[...VALID_RESET_MFA].join(", ")}.`);
    }

    if (updates && Object.keys(updates).length === 0 && resetMfa === "none") {
      errors.push("updates está vacío y resetMfa='none' — nada que hacer.");
    }

    if (errors.length) {
      return res.status(422).json({ ok: false, error: "validation", details: errors, warnings });
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
      mode: "edit",
      loginUrl: FIXED.loginUrl,
      selectors: FIXED.selectors,
      usersManagement: FIXED.usersManagement,
      userId: userIdNum,
      updates,
      resetMfa,
      note,
      includeScreens,
      timeoutMs,
      createdBy,
    };

    const accepted = queue.submit({
      botId: "users-management",
      meta: {
        mode: "edit",
        userId: userIdNum,
        updateKeys: Object.keys(updates || {}),
        resetMfa,
        notePreview: note.slice(0, 80),
        createdBy,
      },
      account: req.auth && req.auth.account,
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
    logger.error({ type: "bot.users_management.edit_controller_error", error: e });
    return res.status(500).json({ ok: false, error: e?.message || "Internal Error" });
  }
}

module.exports = { createController, editController };

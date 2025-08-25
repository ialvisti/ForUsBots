// src/bots/forusall-scrape-participant/controller.js
const queue = require('../../engine/queue');
const { FIXED } = require('../../providers/forusall/config');
const { allowedKeys } = require('../../providers/forusall/participantMap');
const { getSupportedFields, supportsFieldFiltering } = require('../../extractors/forusall-participant/registry');
const runFlow = require('./runFlow');

/** Por defecto devolvemos SOLO DATA */
function normReturnMode(v) {
  const s = String(v || 'data').trim().toLowerCase();
  return ['data', 'html', 'text', 'both'].includes(s) ? s : 'data';
}

/** Normaliza modules: acepta ["census"] o [{key:"census", fields:[...]}] */
function normalizeModules(input) {
  const raw = Array.isArray(input) ? input : (input ? [input] : []);
  const out = [];
  for (const m of raw) {
    if (m == null) continue;
    if (typeof m === 'string') {
      const key = m.trim().toLowerCase();
      if (key) out.push({ key, fields: null });
    } else if (typeof m === 'object') {
      const key = String(m.key || '').trim().toLowerCase();
      let fields = null;
      if (Array.isArray(m.fields)) {
        fields = m.fields.map(f => String(f || '').trim()).filter(Boolean);
        if (!fields.length) fields = null;
      }
      if (key) out.push({ key, fields });
    }
  }
  return out;
}

module.exports = async function controller(req, res) {
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const participantId = body.participantId ?? body.participantID ?? body.id;
    if (participantId === undefined || participantId === null || String(participantId).trim?.() === '') {
      return res.status(400).json({ ok: false, error: 'participantId es obligatorio' });
    }

    // módulos (opcionales): strings u objetos {key, fields}
    let modulesIn = normalizeModules(body.modules ?? body.module);

    // Si no especifican módulos, por defecto census
    if (!modulesIn.length) modulesIn = [{ key: 'census', fields: null }];

    // Validación de claves de módulo
    const validKeys = new Set(allowedKeys());
    const invalidKeys = [];
    let prelimValid = [];
    for (const m of modulesIn) {
      if (validKeys.has(m.key)) prelimValid.push(m); else invalidKeys.push(m.key);
    }

    const strict = !!body.strict;
    if (strict && invalidKeys.length) {
      return res.status(422).json({ ok: false, error: 'modules contiene claves no soportadas', invalid: invalidKeys, allowed: [...validKeys] });
    }

    // PRE-VALIDACIÓN DE CAMPOS (para evitar lanzar Chromium si no tiene sentido)
    const fieldWarnings = [];
    const fieldErrors = [];
    const filteredModules = [];

    for (const m of prelimValid) {
      // Si el cliente pidió fields, verificamos que el módulo soporte filtrado de campos
      if (m.fields && !supportsFieldFiltering(m.key)) {
        fieldErrors.push({
          key: m.key,
          reason: 'fields_not_supported_for_module',
          message: `El módulo "${m.key}" no soporta selección de campos.`
        });
        continue;
      }

      // Si no hay fields, lo dejamos pasar tal cual
      if (!m.fields) {
        filteredModules.push(m);
        continue;
      }

      // Filtra solo campos soportados
      const supported = getSupportedFields(m.key) || [];
      const unknown = m.fields.filter(f => !supported.includes(f));
      const accepted = m.fields.filter(f => supported.includes(f));

      if (unknown.length) {
        if (strict) {
          fieldErrors.push({ key: m.key, reason: 'unknown_fields', unknown });
          continue;
        } else {
          fieldWarnings.push({ key: m.key, type: 'unknown_fields_ignored', unknown });
        }
      }

      if (!accepted.length) {
        // Si todas las fields fueron desconocidas, evita encolar el job de este módulo
        fieldErrors.push({ key: m.key, reason: 'no_valid_fields_after_filter' });
        continue;
      }

      filteredModules.push({ key: m.key, fields: accepted });
    }

    // Si después del filtrado no queda NINGÚN módulo, no encolamos
    if (!filteredModules.length) {
      const out = { ok: false, error: 'no_valid_modules_after_field_validation' };
      if (invalidKeys.length) out.invalidModules = invalidKeys;
      if (fieldErrors.length) out.fieldErrors = fieldErrors;
      if (fieldWarnings.length) out.warnings = fieldWarnings;
      return res.status(422).json(out);
    }

    const includeScreens = !!body.includeScreens;
    const timeoutMs = Number.isFinite(+body.timeoutMs) ? Math.max(5000, +body.timeoutMs) : 30000;
    const returnMode = normReturnMode(body.return);

    // quién ejecuta
    const a = req.auth || {};
    const u = a.user || {};
    const createdBy = {
      name: u.name || null,
      role: a.role || (a.isAdmin ? 'admin' : 'user'),
      at: new Date().toISOString(),
    };

    // meta para el flow
    const meta = {
      loginUrl: FIXED.loginUrl,
      selectors: FIXED.selectors, // user/pass/loginButton/otpInput/otpSubmit
      participantId: String(participantId).trim(),
      modules: filteredModules,       // [{key, fields?}] ya validados/filtrados
      invalidModules: invalidKeys,    // para warnings
      includeScreens,
      timeoutMs,
      returnMode,                     // por defecto "data"
      strict,
      createdBy,
    };

    const accepted = queue.submit({
      botId: 'scrape-participant',
      meta: {
        participantId: meta.participantId,
        modules: meta.modules,
        includeScreens,
        returnMode,
        timeoutMs,
        createdBy,
      },
      run: async (jobCtx) => runFlow({ meta, jobCtx }),
    });

    res.set('Location', `/forusbot/jobs/${accepted.jobId}`);
    return res.status(202).json({
      ok: true,
      jobId: accepted.jobId,
      acceptedAt: accepted.acceptedAt,
      queuePosition: accepted.queuePosition,
      estimate: accepted.estimate,
      capacitySnapshot: accepted.capacitySnapshot,
      warnings: [
        ...(invalidKeys.length ? [{ type: 'invalid_modules_ignored', keys: invalidKeys }] : []),
        ...fieldWarnings
      ],
      executedBy: {
        name: createdBy.name || null,
        role: createdBy.role,
        at: createdBy.at,
      },
    });
  } catch (e) {
    console.error('[scrape-participant controller]', e);
    return res.status(500).json({ ok: false, error: e && e.message ? e.message : 'Internal Error' });
  }
};

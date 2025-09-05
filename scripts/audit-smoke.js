// scripts/audit-smoke.js
const { randomUUID } = require('crypto');
process.env.AUDIT_DB = process.env.AUDIT_DB || '1'; // por si lo llamas sin .env cargado
const logger = require('../src/engine/logger');

const jobId = randomUUID();
const now = Date.now();

const t = (ms) => new Date(now + ms).toISOString();

logger.info({ type: 'job.accepted',  jobId, bot: 'smoke-bot', ts: t(0),  meta: { from: 'smoke' } });
logger.info({ type: 'job.started',   jobId, ts: t(100) });

logger.info({ type: 'stage.start',   jobId, stage: 'login', ts: t(200), meta: { step: 1 } });
logger.info({ type: 'stage.succeed', jobId, stage: 'login', ts: t(800), durationMs: 600 });

logger.info({ type: 'job.summary',   jobId, ts: t(1000), totalMs: 1200, stagesList: ['login'], stages: { login: { ms: 600 } } });
logger.info({ type: 'job.succeeded', jobId, ts: t(1200), result: { ok: true } });

// pequeña espera para que el pool haga los INSERT/UPDATE
setTimeout(() => process.exit(0), 1000);

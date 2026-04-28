// src/index.js
require('dotenv').config();

const { loadSecrets } = require('./secrets');
const logger = require('./engine/logger');

const PORT = Number(process.env.PORT) || 10000;
const HOST = process.env.HOST || '0.0.0.0';

// Instrumentación: detectar quién llama process.exit
const _realExit = process.exit;
process.exit = function (code) {
  const lvl = code && code !== 0 ? 'error' : 'info';
  logger[lvl]({
    type: 'infra.process_exit',
    code,
    stack: new Error('process.exit stack').stack,
  });
  _realExit(code);
};

process.on('exit', (code) => {
  const handles = (process._getActiveHandles && process._getActiveHandles()) || [];
  const requests = (process._getActiveRequests && process._getActiveRequests()) || [];
  let handleTypes = [];
  try {
    handleTypes = handles.map((h) => h && h.constructor && h.constructor.name).filter(Boolean);
  } catch { /* ignore */ }
  logger.info({
    type: 'infra.exit',
    code,
    handles: handles.length,
    requests: requests.length,
    handleTypes,
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error({
    type: 'infra.unhandled_rejection',
    error: reason instanceof Error ? reason : new Error(String(reason)),
  });
});
process.on('uncaughtException', (err) => {
  logger.error({ type: 'infra.uncaught_exception', error: err });
});

(async () => {
  try {
    await loadSecrets();
  } catch (e) {
    logger.error({ type: 'infra.secrets_load_error', error: e });
    _realExit(1);
    return;
  }

  // Cargar el server DESPUÉS de que secretos estén en process.env, para que
  // los módulos que leen SITE_USER/SITE_PASS/TOTP_SECRET/SHARED_TOKEN al
  // require-time vean los valores ya resueltos.
  const app = require('./server');

  const server = app.listen(PORT, HOST, () => {
    const shownHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
    logger.info({ type: 'infra.startup', port: PORT, host: shownHost });
  });

  server.on('error', (err) => {
    logger.error({ type: 'infra.server_error', error: err });
  });

  let shuttingDown = false;
  function shutdown(signal, code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ type: 'infra.shutdown', signal });
    server.close((err) => {
      if (err) {
        logger.error({ type: 'infra.server_close_error', error: err });
        return _realExit(1);
      }
      _realExit(code);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT', 0));
  process.on('SIGTERM', () => shutdown('SIGTERM', 0));
  process.once('SIGUSR2', function () {
    logger.info({ type: 'infra.shutdown', signal: 'SIGUSR2' });
    server.close(() => {
      process.kill(process.pid, 'SIGUSR2');
    });
  });

  // Guardia: timer largo para mantener el loop vivo si alguien cierra el server.
  setInterval(() => {}, 1 << 30);
})();

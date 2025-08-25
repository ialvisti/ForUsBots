// src/index.js (diagnóstico)
require('dotenv').config();
const app = require('./server');

const PORT = Number(process.env.PORT) || 10000;
const HOST = process.env.HOST || '0.0.0.0';

// --- Instrumentación: detectar quién llama process.exit ---
const _realExit = process.exit;
process.exit = function (code) {
  // Imprime stack del lugar que llama a exit
  console.log('⚠️  process.exit llamado con código:', code);
  console.log(new Error('process.exit stack').stack);
  _realExit(code);
};

// También traza cuando el proceso sale “naturalmente” (sin process.exit)
process.on('exit', (code) => {
  const handles = (process._getActiveHandles && process._getActiveHandles()) || [];
  const requests = (process._getActiveRequests && process._getActiveRequests()) || [];
  console.log('👋 Evento exit. code=', code, 'handles=', handles.length, 'requests=', requests.length);
  // Lista tipos de handles para ver si el HTTP server seguía vivo
  try {
    handles.forEach((h, i) => console.log('  handle[' + i + ']:', h && h.constructor && h.constructor.name));
  } catch {}
});

process.on('unhandledRejection', (reason, p) => {
  console.error('[unhandledRejection]', reason && reason.stack ? reason.stack : reason, 'at', p);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});

// --- Levanta el servidor y CONSERVA la referencia ---
const server = app.listen(PORT, HOST, () => {
  const shownHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`Server listening on http://${shownHost}:${PORT}`);
});

server.on('error', (err) => {
  console.error('[server error]', err);
});

// Cierres “graceful”
let shuttingDown = false;
function shutdown(signal, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} recibido → cerrando servidor...`);
  server.close((err) => {
    if (err) {
      console.error('[server.close error]', err);
      return _realExit(1);
    }
    _realExit(code);
  });
}

process.on('SIGINT',  () => shutdown('SIGINT', 0));
process.on('SIGTERM', () => shutdown('SIGTERM', 0));
// Nodemon reinicia con SIGUSR2
process.once('SIGUSR2', function () {
  console.log('SIGUSR2 (nodemon) → reiniciando gracefully...');
  server.close(() => {
    process.kill(process.pid, 'SIGUSR2');
  });
});

// --- Guardia temporal: un timer que mantiene vivo el loop por si alguien cierra el server ---
// (si aun así se sale, es que llamaron process.exit)
setInterval(() => {}, 1 << 30);

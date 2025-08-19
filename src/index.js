// src/index.js
require('dotenv').config();
const app = require('./server');

const PORT = process.env.PORT || 10000;

process.on('unhandledRejection', (reason, p) => {
  console.error('[unhandledRejection]', reason && reason.stack ? reason.stack : reason, 'at', p);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});
process.on('SIGTERM', () => {
  console.log('SIGTERM recibido, cerrando servidor...');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('SIGINT recibido, cerrando servidor...');
  process.exit(0);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

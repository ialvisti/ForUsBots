# Fase 01 — Refactor del sistema de logs

**Duración estimada**: ~4 horas
**Requiere GCP**: No (100% local)
**Reversible**: Sí (`git revert`)

---

## Validación inicial (estado de partida)

Antes de empezar, ejecuta y verifica que TODO esto se cumple:

```bash
cd "/Users/ivanalvis/Desktop/ForUsBots copy"

# 1. Estás en la rama main y working tree limpio
git status
# Esperado: "nothing to commit, working tree clean"

# 2. Node version >= 18
node --version
# Esperado: v18.x o superior (Playwright Docker usa Node 20)

# 3. Dependencias instaladas y la app puede arrancar localmente
npm install
# Esperado: sin errores

# 4. Confirmar que el problema existe — hay ~40 console.* fuera de logger.js
grep -rn "console\." src --include="*.js" | grep -v "src/engine/logger.js" | wc -l
# Esperado: número >= 30 (es la suciedad que vamos a limpiar)

# 5. Ver el estado actual del logger
cat src/engine/logger.js | head -20
# Esperado: archivo existe con LEVELS, LOG_LEVEL, LOG_FORMAT
```

Si algo falla → arreglar antes de empezar.

---

## Contexto

Hoy hay un logger estructurado en `src/engine/logger.js` (bueno) pero conviven con ~40 `console.log/error` crudos en 17 archivos. Los `console.*`:
- No respetan `LOG_LEVEL`
- No tienen `correlationId`
- Vuelcan stack traces multi-línea (rompen line-oriented JSON)
- No incluyen `severity` para Cloud Logging

Después de esta fase: una sola salida (`logger.*`), schema fijo, correlación end-to-end vía AsyncLocalStorage, HTTP access logs, y `severity` Cloud-Logging-native.

---

## Tareas

### 1. Crear `src/engine/log-context.js` (AsyncLocalStorage para correlation)

Nuevo archivo. Usa `AsyncLocalStorage` de Node para propagar `correlationId`/`jobId`/`botId` por toda la cadena async sin pasarlo como argumento.

API esperada:
```js
const { runWith, getContext } = require('./log-context');

// En el middleware de request:
runWith({ correlationId: req.id }, () => next());

// En cualquier lugar profundo del callstack:
const { correlationId, jobId, botId } = getContext() || {};
```

### 2. Crear `src/middleware/request-log.js`

Middleware Express que:
- Asigna `req.id = crypto.randomUUID()`
- Loguea `http.request` al inicio (con `method`, `path`, `correlationId`)
- Loguea `http.response` al final (con `status`, `durMs`, `correlationId`)
- Envuelve `next()` con `runWith({correlationId: req.id})`

### 3. Refactor de `src/engine/logger.js`

Cambios:
- **Agregar campo `severity`**: mapear `level` (debug/info/warn/error) → `DEBUG/INFO/WARNING/ERROR` para Cloud Logging
- **Leer contexto de log-context**: `const ctx = getContext()` y mergear `correlationId`, `jobId`, `botId` automáticamente en cada record
- **`forwardToAudit`**: cambiar destino de Postgres a Firestore. **NOTA**: en esta fase aún no existe Firestore; deja la función con un TODO claro o un stub que loguee `event` igual pero no escriba a DB (la fase 04 lo conecta).
- **Fix `safeTruncateObj`** (líneas 144-152): hoy a veces devuelve string, a veces objeto. Hacer que **siempre devuelva objeto** (truncar valores internos pero mantener estructura).
- **Pretty mode legible**: en vez de `[ts] LEVEL type {todoElJSON}`, usar formato:
  ```
  HH:MM:SS LEVEL type=value k1=v1 k2=v2
  ```
  Ejemplo: `12:34:56 INFO  job.accepted bot=scrape-plan job=abc123 corr=r-9f3a`

### 4. Limpiar `src/index.js`

Borrar/migrar:
- **[Líneas 11-25]**: los `console.log('⚠️ process.exit llamado...')` con stacks y emojis. Mover a `logger.error({type:'infra.process_exit', code, stack})` con level `error` solo si el code != 0.
- **`unhandledRejection` y `uncaughtException`**: hoy usan `console.error`. Migrar a `logger.error({type:'infra.unhandled_rejection', error})` y `logger.error({type:'infra.uncaught_exception', error})`.
- **`Server listening on...`**: cambiar a `logger.info({type:'infra.startup', port: PORT, host: shownHost})`.
- **Handlers de señales (SIGTERM/SIGINT/SIGUSR2)**: cambiar `console.log(\`${signal} recibido...\`)` a `logger.info({type:'infra.shutdown', signal})`.

Y agregar al inicio de `index.js`:
```js
const requestLog = require('./middleware/request-log');
app.use(requestLog);  // ANTES de cualquier ruta
```

### 5. Reemplazar `console.*` en `src/server.js`

7 ocurrencias visibles ([líneas 145, 173, 182, 193, 211, 224, 256]). Patrón:

```js
// Antes:
console.error("[evidence login] error", e);

// Después:
logger.error({ type: 'http.evidence_login.error', error: e });
```

Importar `const logger = require('./engine/logger');` al inicio del archivo si no está.

### 6. Reemplazar `console.*` en routes y bots

Archivos a tocar (verificar con `grep -rn "console\." src --include="*.js" | grep -v logger.js`):

- `src/routes/*.js` (10+ archivos): cada `console.error("[xxx] error", e)` → `logger.error({type:'route.xxx.error', error:e})`
- `src/bots/*/controller.js` (7 bots): además del replace, **envolver el flujo del bot** con `runWith({jobId, botId}, async () => { ...lógica del bot... })` para que TODOS los logs profundos arrastren el correlation.
- `src/engine/queue.js`, `src/engine/audit.js`: revisar si tienen `console.*` y migrar.

### 7. Schema fijo de eventos (documentar)

Crear `src/engine/log-schema.md` (o dejarlo en JSDoc dentro de `logger.js`) listando los `type` permitidos:

```
http.request               http.response
job.accepted               job.started
job.succeeded              job.failed              job.canceled
job.summary
stage.start                stage.succeed           stage.fail
bot.error
infra.startup              infra.shutdown
infra.unhandled_rejection  infra.uncaught_exception
db.error                   route.<name>.error
```

Es una taxonomía cerrada. Cualquier `type` nuevo en el futuro pasa por code review.

### 8. Agregar lint rule `no-console`

Crear `.eslintrc.json` en la raíz:

```json
{
  "env": { "node": true, "es2022": true },
  "extends": ["eslint:recommended"],
  "parserOptions": { "ecmaVersion": 2022 },
  "rules": {
    "no-console": "error",
    "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
  },
  "overrides": [
    {
      "files": ["src/engine/logger.js"],
      "rules": { "no-console": "off" }
    }
  ]
}
```

Agregar a `package.json`:
```json
"scripts": {
  "lint": "eslint src/"
},
"devDependencies": {
  "eslint": "^8.57.0"
}
```

Correr `npm install` y luego `npm run lint`. Debe pasar limpio.

---

## Verificación final (esto valida que la fase quedó bien para la 02)

```bash
# 1. NO hay console.* fuera de logger.js
grep -rn "console\." src --include="*.js" | grep -v "src/engine/logger.js" | grep -v "// eslint-disable"
# Esperado: NADA (output vacío)

# 2. Lint pasa
npm run lint
# Esperado: sin errores

# 3. Archivos nuevos existen
ls -la src/engine/log-context.js src/middleware/request-log.js
# Esperado: ambos existen

# 4. Logger emite severity
node -e "
process.env.LOG_FORMAT='json';
const log = require('./src/engine/logger');
log.info({ type: 'test.hello', message: 'world' });
" 2>&1 | head -1
# Esperado: JSON con campo "severity":"INFO"

# 5. Pretty mode legible
node -e "
process.env.LOG_FORMAT='pretty';
const log = require('./src/engine/logger');
log.info({ type: 'job.accepted', botId: 'scrape-plan', jobId: 'abc123' });
" 2>&1 | head -1
# Esperado: línea legible tipo "12:34:56 INFO  job.accepted bot=scrape-plan job=abc123"

# 6. Boot del servicio NO tiene emojis ni stack traces sueltos
LOG_FORMAT=json npm start 2>&1 | head -10
# Esperado: solo JSON line-oriented. NADA tipo "⚠️" o "process.exit stack"
# Después de verificar, mata el proceso (Ctrl+C)

# 7. Filtro por LOG_LEVEL=warn suprime INFO
LOG_LEVEL=warn LOG_FORMAT=json node -e "
const log = require('./src/engine/logger');
log.info({type:'test'}); log.warn({type:'test2'});
" 2>&1
# Esperado: solo el WARN, no el INFO
```

Si TODOS pasan → fase 01 completa, listo para commit.

```bash
git add -A
git commit -m "Refactor logging: AsyncLocalStorage, severity, schema cerrado, no console.*

- Agrega src/engine/log-context.js con AsyncLocalStorage para correlationId
- Agrega src/middleware/request-log.js con HTTP access logs
- Refactor logger.js: severity Cloud-Logging-native, contexto auto-mergeado, pretty mode legible
- Limpia src/index.js: handlers globales al logger, sin console.log con emojis
- Reemplaza ~40 console.* por logger.* en 17 archivos
- Lint rule no-console con excepción solo en logger.js
"
```

---

## Pitfalls comunes

- **AsyncLocalStorage no propaga si rompes la cadena async** (callbacks viejos, `setTimeout` sin context wrap). Si ves logs sin `correlationId`, busca dónde se rompe la cadena.
- **`forwardToAudit` con TODO**: en esta fase NO conectar a Firestore aún. Si la fase 04 no se ha hecho, dejar la función como no-op. Si la fase 04 ya lo cambia, ignorar.
- **Pretty mode en producción**: asegúrate que `LOG_FORMAT=json` en el `.env.production`. El pretty mode es solo para `npm run dev` local.
- **Stack traces en error**: deben ir como `error.stack` dentro del objeto, no como segundo argumento de console.error. La función `normalizeError` en logger.js ya lo hace bien si la usas.

---

## Salida que debe ver la fase 02

Para que la fase 02 valide su prerequisito, debe poder correr:
- `npm run lint` → exit 0
- `grep -rn "console\." src --include="*.js" | grep -v "src/engine/logger.js"` → vacío
- App arranca con `LOG_FORMAT=json npm start` y emite solo JSON con `severity`

Si todo eso pasa, procede a [02-public-payload-cleanup.md](./02-public-payload-cleanup.md).

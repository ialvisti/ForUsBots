# Fase 06.03 — Credenciales ForUsAll per-token

**Duración estimada**: ~6 horas
**Requiere GCP**: No (desarrollo local). El deploy a la VM viene en la fase 05.
**Reversible**: Sí (git revert; tokens en Secret Manager no se tocan).

---

## Contexto (lee antes de empezar)

Lee primero [00-OVERVIEW.md](./00-OVERVIEW.md). Las fases 01 y 02 dejaron:
- Tokens con `account: { alias, siteUser, sitePass, totpSecret }` en `TOKENS_JSON`.
- `req.auth.scope` y `req.auth.tokenMeta` disponibles en cada request autenticada.
- `requireScope` corta requests no autorizadas.

Esta fase **refactoriza el engine** para que el login al portal ForUsAll use las credenciales del token, no las globales del `.env`. Es la fase más invasiva. Antes de mergear, dejar back-compat para tokens legacy (sin `account` → fallback a globales del `.env`).

Cambios clave:
1. Las credenciales pasan a viajar como datos del job (en `jobCtx.account`), no como singletons de `config`.
2. `loginOtp` recibe las credenciales como parámetro.
3. El mutex de `loginLock` pasa a estar keyado por `account.alias` (o `siteUser`), no por `SITE_USER` global.
4. Cada `runFlow.js` recibe `account` y lo pasa al login.
5. `req.auth.account` ya viaja desde `auth.js` (lo dejó la fase 02 via `tokenMeta`). En esta fase lo extraemos formalmente.

---

## Validación inicial (la fase 02 quedó bien hecha)

```bash
cd "/Users/ivanalvis/Desktop/ForUsBots copy"
source .gcp-config.local

git status   # working tree limpio
git log -1 --oneline | grep -i "Token scopes 02" && echo "Commit fase 02: OK"

# 1. requireScope existe y se mantiene en todos los routers
test -f src/auth/scopes.js && test -f src/middleware/requireScope.js && echo "Middleware: OK"
grep -rln "requireScope" src/bots/*/routes.js | wc -l   # Esperado: 8

# 2. whoami devuelve scope
TOKENS_FILE=/tmp/tokens.json timeout 15 npm start &
sleep 5
ADMIN_TOK=$(jq -r 'to_entries[] | select(.value.role=="admin") | .key' /tmp/tokens.json | head -1)
curl -fsS http://localhost:10000/forusbot/whoami -H "x-auth-token: $ADMIN_TOK" | jq -e '.scope'
kill %1 2>/dev/null
# Esperado: objeto no-null
```

Si algo falla → volver a [02-auth-middleware-and-scopes.md](./02-auth-middleware-and-scopes.md).

---

## Tareas

### 1. Crear helper `src/auth/account.js` para resolución y fallback

```js
// src/auth/account.js
// Resuelve la cuenta ForUsAll que se debe usar para ejecutar un bot a partir del token.
// Durante el grace period, si el token no trae account → fallback a globals del .env.

const config = require("../config");

const FALLBACK = Object.freeze({
  alias: "legacy-shared",
  siteUser:   config.SITE_USER   || null,
  sitePass:   config.SITE_PASS   || null,
  totpSecret: config.TOTP_SECRET || null,
});

function resolveAccount(tokenMeta) {
  const acc = tokenMeta?.account;
  if (acc && acc.siteUser && acc.sitePass && acc.totpSecret) {
    return {
      alias:      String(acc.alias || acc.siteUser),
      siteUser:   acc.siteUser,
      sitePass:   acc.sitePass,
      totpSecret: acc.totpSecret,
    };
  }
  // Fallback. Si globals tampoco existen, devolvemos FALLBACK con nulls — el caller decide.
  return { ...FALLBACK };
}

/** Versión safe para logs / responses HTTP. NO incluye sitePass ni totpSecret. */
function publicView(account) {
  if (!account) return null;
  return {
    alias: account.alias,
    siteUser: account.siteUser ? maskEmail(account.siteUser) : null,
  };
}

function maskEmail(email) {
  const at = email.indexOf("@");
  if (at <= 1) return "***";
  return email.slice(0, 1) + "***" + email.slice(at);
}

module.exports = { resolveAccount, publicView, FALLBACK };
```

### 2. Modificar `src/middleware/auth.js` para adjuntar `req.auth.account`

Edita [src/middleware/auth.js](../../src/middleware/auth.js). Después del bloque donde `req.auth.scope` se setea (de la fase 02), agrega:

```js
const { resolveAccount } = require("../auth/account");
// ...
req.auth.account = resolveAccount(tokenMeta);
```

Garantías:
- `req.auth.account` siempre existe (con nulls en los campos sensibles si fallback).
- NUNCA serializar `req.auth.account` directo en respuestas HTTP — usar `publicView(...)`.

### 3. Refactor `src/engine/queue.js` para propagar `account` en `jobCtx`

Lee [src/engine/queue.js:574-640](../../src/engine/queue.js#L574-L640) (función `submit({botId, meta, run})`). Identifica dónde se construye el `jobCtx` que recibe `run`.

Cambio: agregar `account` a `jobCtx`, leído del caller. El caller (cada controller de bot) le pasa `req.auth.account`:

```js
// queue.submit ahora acepta `account` en su contrato:
function submit({ botId, meta, run, account }) {
  // ... existing logic ...
  const jobCtx = {
    jobId,
    botId,
    meta: sanitizedMeta,
    account,                                   // ← NUEVO
    // ... resto del ctx existente ...
  };
  // persistencia del job en Firestore — guardar SOLO account.alias para auditoría
  await jobsCol().doc(jobId).set({
    /* ... existing fields ... */
    accountAlias: account?.alias || null,      // ← NUEVO; NO guardar siteUser/sitePass/totpSecret
  });
  // pasa jobCtx (incluyendo account completo) al run() del bot
  return run(jobCtx);
}
```

> **CRÍTICO**: NO persistir `siteUser`/`sitePass`/`totpSecret` en Firestore. Sólo `accountAlias`. Si en algún momento se quiere debug, se va al token en Secret Manager — no al log/DB.

### 4. Actualizar cada controller para pasar `account` a `queue.submit`

Ejemplo en [src/bots/forusall-scrape-participant/controller.js](../../src/bots/forusall-scrape-participant/controller.js):

```js
// Antes (línea ~155):
const jobId = await queue.submit({
  botId: "scrape-participant",
  meta: { ..., createdBy: req.auth.user },
  run: (ctx) => runFlow(ctx, params),
});

// Después:
const jobId = await queue.submit({
  botId: "scrape-participant",
  meta: { ..., createdBy: req.auth.user },
  account: req.auth.account,                   // ← NUEVO
  run: (ctx) => runFlow(ctx, params),
});
```

Aplicar el mismo cambio en los 8 controllers de bots:
- `src/bots/forusall-scrape-participant/controller.js`
- `src/bots/forusall-scrape-plan/controller.js`
- `src/bots/forusall-update-participant/controller.js`
- `src/bots/forusall-update-plan/controller.js`
- `src/bots/forusall-search-participants/controller.js`
- `src/bots/forusall-mfa-reset/controller.js`
- `src/bots/forusall-emailtrigger/controller.js`
- `src/bots/forusall-upload/controller.js`

### 5. Refactor `src/engine/auth/loginOtp.js` — recibir creds como parámetro

Edita [src/engine/auth/loginOtp.js:134-135, 206-220](../../src/engine/auth/loginOtp.js#L134-L135). La función exportada (probablemente `login(page, ...)` o similar) hoy lee de `config`. Cambiar la firma a recibir `account` explícito:

```js
// Antes:
const { SITE_USER, SITE_PASS, TOTP_SECRET } = require("../../config");
async function login(page, opts) {
  await page.fill(selectors.user, SITE_USER);
  await page.fill(selectors.pass, SITE_PASS);
  // ... TOTP usa TOTP_SECRET
  const code = speakeasy.totp({ secret: TOTP_SECRET, encoding: "base32", ... });
}

// Después:
async function login(page, account, opts) {
  if (!account || !account.siteUser || !account.sitePass || !account.totpSecret) {
    throw new Error("login: account is required (siteUser, sitePass, totpSecret)");
  }
  await page.fill(selectors.user, account.siteUser);
  await page.fill(selectors.pass, account.sitePass);
  const code = speakeasy.totp({ secret: account.totpSecret, encoding: "base32", ... });
}
module.exports = login;
```

Quitar el `require("../../config")` para SITE_USER/SITE_PASS/TOTP_SECRET de este archivo. Cualquier otro archivo en `src/engine/auth/` que lea esos globals → mismo refactor.

### 6. Refactor `src/engine/loginLock.js` — mutex keyado por alias

Edita [src/engine/loginLock.js:41-75](../../src/engine/loginLock.js#L41-L75). El mutex actual probablemente usa una variable estática o `SITE_USER` como key. Cambiarlo a recibir el alias (o siteUser) como parámetro:

```js
// Antes:
const lock = new Mutex();    // un solo mutex global
async function acquire() { return lock.acquire(); }

// Después:
const locks = new Map();     // key = alias, value = Mutex
function acquire(alias) {
  if (!alias) throw new Error("loginLock.acquire: alias is required");
  if (!locks.has(alias)) locks.set(alias, new Mutex());
  return locks.get(alias).acquire();
}
```

**Consecuencia importante**: dos jobs con cuentas distintas se loguean en paralelo (antes era serializado por el mutex global). Esto puede causar bursts contra el portal. Si esto preocupa, agregar un mutex global ADEMÁS del por-alias, con un `maxConcurrent` configurable (default 2-3) — pero esto es **opt-in** y NO se requiere para cerrar la fase.

> **TOTP window collision**: el TOTP secret es por cuenta. Dos jobs simultáneos del MISMO alias siguen serializados (es el punto del mutex). Dos jobs de aliases distintos no se pisan porque usan secrets distintos. OK.

### 7. Refactor cada `runFlow.js` — recibir y pasar `account`

Los `runFlow.js` reciben el `jobCtx` (de fase 04 GCP, parte de la migración). Ahora `jobCtx.account` existe.

Ejemplo en [src/bots/forusall-scrape-participant/runFlow.js:97-98](../../src/bots/forusall-scrape-participant/runFlow.js#L97-L98):

```js
// Antes (lee globals indirectamente vía loginOtp):
const release = await loginLock.acquire();
try {
  await loginOtp(page, { /* opts */ });
  // ...
} finally { release(); }

// Después:
const account = jobCtx.account;
if (!account?.siteUser) throw new Error("runFlow: jobCtx.account missing");
const release = await loginLock.acquire(account.alias);
try {
  await loginOtp(page, account, { /* opts */ });
  // ...
} finally { release(); }
```

Aplicar a los 8 runFlows. La firma exacta del callsite (cómo `runFlow` recibe `jobCtx`) ya viene de la fase 04 GCP — verificar antes de editar.

### 8. Quitar `SITE_USER`/`SITE_PASS`/`TOTP_SECRET` de `config.js` (con grace period)

Edita [src/config.js:12-34](../../src/config.js#L12-L34). Hay dos enfoques:

**Opción A — quitar duro** (recomendado si el grep no muestra otros consumidores):
```bash
grep -rn "config\.\(SITE_USER\|SITE_PASS\|TOTP_SECRET\)" src/ scripts/ examples/ 2>/dev/null | grep -v node_modules
```
Si el grep está limpio (sólo aparece en el `account.js` como fallback), quitar las constantes del export de `config.js`. `account.js` debería leer directo de `process.env` para el fallback en lugar de `config`:

```js
// src/auth/account.js (ajuste):
const FALLBACK = Object.freeze({
  alias: "legacy-shared",
  siteUser:   process.env.SITE_USER   || null,
  sitePass:   process.env.SITE_PASS   || null,
  totpSecret: process.env.TOTP_SECRET || null,
});
```

**Opción B — deprecated con warning** (si hay consumidores que no quieres tocar ahora):
```js
// src/config.js
Object.defineProperty(module.exports, "SITE_USER", {
  get() { console.warn("[deprecated] config.SITE_USER — use req.auth.account"); return process.env.SITE_USER; }
});
// ...mismo patrón para SITE_PASS, TOTP_SECRET
```

> Recomendación: **Opción A**. Es más limpio y el fallback en `account.js` cubre el grace period sin ensuciar `config`.

### 9. `src/secrets.js` — opcionalmente dejar de exigir `SITE_*` env

`secrets.js` hoy carga `SITE_USER`/`SITE_PASS`/`TOTP_SECRET` como env vars (vienen del Secret Manager). Decisión:
- **Mantener la carga**: durante el grace period, sigue cargando esos secrets de GCP a `process.env`. `account.js` los usa de fallback. Cuando todos los tokens estén migrados, **quitamos los 3 secrets de Secret Manager** y `secrets.js` ya no los pide.
- **Quitar la carga ya**: si todos los tokens tienen `account` correcto en `TOKENS_JSON`, los globals no son necesarios. Pero perdemos el fallback.

Recomendación: **mantener la carga durante esta fase**. Quitarla en el commit final de la fase 05 cuando ya confirmemos 24h sin errores.

### 10. Logging: emitir `accountAlias` en cada login

Edita [src/engine/auth/loginOtp.js](../../src/engine/auth/loginOtp.js) para que el log estructurado incluya `accountAlias`:

```js
logger.info({
  type: "login.attempt",
  accountAlias: account.alias,
  siteUser: maskEmail(account.siteUser),   // enmascarado
  jobId: jobCtx?.jobId,
});
```

Esto permite filtrar en Cloud Logging por cuenta. **NO loguear sitePass ni totpSecret jamás**.

### 11. Tests / Smoke

Agregar tests:
- `tests/engine/loginLock.test.js`: dos `acquire("alias-A")` se serializan; `acquire("alias-A")` y `acquire("alias-B")` corren en paralelo.
- `tests/auth/account.test.js`: `resolveAccount` con token completo, con token legacy (fallback), con globals nulls.

Smoke contra la app local:
```bash
TOKENS_FILE=/tmp/tokens.json timeout 60 npm start &
sleep 5

# Encolar un scrape-participant con un token cuya account.alias = "ops-prod"
TOK_OPS=$(jq -r 'to_entries[] | select(.value.account.alias=="ops-prod") | .key' /tmp/tokens.json | head -1)
curl -sS -X POST http://localhost:10000/forusbot/scrape-participant \
  -H "x-auth-token: $TOK_OPS" -H "Content-Type: application/json" \
  -d '{"participantId":"123","modules":["census"]}' | jq

# En los logs de la app debe aparecer:
#   { type:"login.attempt", accountAlias:"ops-prod", siteUser:"o***@forusall.com", jobId:"..." }

kill %1 2>/dev/null
```

---

## Verificación final

```bash
# 1. Tests pasan
npm test

# 2. Lint pasa
npm run lint

# 3. Ningún archivo lee directamente SITE_USER/SITE_PASS/TOTP_SECRET de config
# (sólo account.js, fallback)
grep -rn "config\.\(SITE_USER\|SITE_PASS\|TOTP_SECRET\)" src/ | grep -v node_modules
# Esperado: vacío (o sólo aparecer en src/auth/account.js si usás `config` en lugar de process.env)

grep -rn "process\.env\.\(SITE_USER\|SITE_PASS\|TOTP_SECRET\)" src/ | grep -v node_modules
# Esperado: sólo src/auth/account.js (fallback) y src/secrets.js (loader)

# 4. Smoke test del engine con tokens distintos
TOKENS_FILE=/tmp/tokens.json timeout 30 npm start &
sleep 5

# Token user con account dev-local
USER_TOK=$(jq -r 'to_entries[] | select(.value.role=="user") | .key' /tmp/tokens.json | head -1)
curl -sS http://localhost:10000/forusbot/whoami -H "x-auth-token: $USER_TOK" | jq '.accountAlias'
# Esperado: el alias del token

# Encolar un job — verifica que el log muestra accountAlias
curl -sS -X POST http://localhost:10000/forusbot/scrape-participant \
  -H "x-auth-token: $USER_TOK" -H "Content-Type: application/json" \
  -d '{"participantId":"INVALID_FOR_SMOKE"}' > /dev/null
sleep 3
# Mirar la stdout de npm start: debe contener 'accountAlias' en algún log de login.attempt

kill %1 2>/dev/null

# 5. Jobs en Firestore SÓLO guardan accountAlias (no las creds)
# (correr solo si tenés Firestore local en emulator o querés contra prod)
# bq query --use_legacy_sql=false "SELECT data.accountAlias, data.account.siteUser FROM \`$PROJECT_ID.forusbots_analytics.jobs_raw_latest\` LIMIT 1"
# Esperado: accountAlias presente, account.siteUser NULL/inexistente
```

Si todo pasa, commit:

```bash
git add src/auth/account.js \
        src/middleware/auth.js \
        src/engine/queue.js \
        src/engine/auth/loginOtp.js \
        src/engine/loginLock.js \
        src/bots/*/controller.js \
        src/bots/*/runFlow.js \
        src/config.js \
        tests/auth/account.test.js tests/engine/loginLock.test.js
git commit -m "Token scopes 03: credenciales ForUsAll per-token

- src/auth/account.js: resolveAccount + publicView (mask de email)
- src/middleware/auth.js: req.auth.account inyectado
- src/engine/queue.js: jobCtx.account propagado; Firestore guarda solo accountAlias
- src/engine/auth/loginOtp.js: login(page, account, opts) — sin globals
- src/engine/loginLock.js: mutex per-alias en lugar de global
- 8 controllers + 8 runFlows: usan account de jobCtx
- src/config.js: quita SITE_USER/SITE_PASS/TOTP_SECRET (fallback en account.js via process.env)
- Logs: login.attempt incluye accountAlias y siteUser enmascarado

Back-compat: tokens sin account caen a process.env (legacy globals) durante grace period.
"
```

---

## Pitfalls comunes

- **Filtrar password en logs**: el riesgo más alto. SIEMPRE usar `publicView` o enmascarar. Si vas a `console.log(account)` en debugging, sustituí por `console.log(publicView(account))` antes de commitear.
- **Persistir creds en Firestore/BQ**: si guardás `meta.account` completo en `jobsCol().doc()`, BigQuery hereda el campo. Sólo persistir `accountAlias`. Si ya hubo jobs con creds persistidas — borrarlos manualmente: `gcloud firestore documents delete ...` o purge admin.
- **Mutex global vs per-alias**: con per-alias se levanta el throttle global. Si el portal ForUsAll rate-limita por IP, dos cuentas en paralelo pueden recibir 429. Si ves esto, agregar un `Semaphore(N)` global encima del per-alias mutex (N configurable, default 3).
- **Tokens legacy sin `account`**: durante el grace period funcionan via fallback. Si el `.env` de la VM no tiene `SITE_USER`/`SITE_PASS`/`TOTP_SECRET` cargados, esos tokens van a fallar el login. El log lo dice (`accountAlias: "legacy-shared"`, `siteUser: null`).
- **TOTP window race**: si dos jobs del mismo alias arrancan a la vez, el mutex serializa el login completo (incluido `totp.totp()`). El `loginLock.js` ya tenía esa lógica — verificar que se preserva.
- **Quitar globals demasiado pronto**: si ANTES de la fase 05 quitás `SITE_USER` del Secret Manager o del `.env`, los tokens legacy fallan. NO tocar el secret manager para esos secrets en esta fase — esperar a fase 05.

---

## Salida que debe ver la fase 04

- 8 runFlows usando `jobCtx.account`; 0 referencias residuales a `SITE_USER`/`SITE_PASS`/`TOTP_SECRET` desde `src/config.js`.
- `loginLock` keyado por alias; smoke test con 2 aliases en paralelo OK.
- Logs estructurados con `accountAlias` en cada login.attempt.
- Firestore persiste sólo `accountAlias` (no las creds).
- Tests passing (unit + smoke).
- Commit en main.

Si todo eso pasa, procede a [04-sandbox-and-docs.md](./04-sandbox-and-docs.md).

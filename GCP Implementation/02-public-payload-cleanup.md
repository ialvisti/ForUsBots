# Fase 02 — Limpieza de payloads públicos de la API

**Duración estimada**: ~6 horas
**Requiere GCP**: No (100% local)
**Reversible**: Sí (`git revert`)

---

## Validación inicial (la fase 01 quedó bien hecha)

```bash
cd "/Users/ivanalvis/Desktop/ForUsBots copy"

# 1. Working tree limpio (commit de fase 01 ya está)
git status
# Esperado: "nothing to commit, working tree clean"
# El último commit debe mencionar logging refactor:
git log -1 --oneline

# 2. Lint pasa (no-console rule activa)
npm run lint
# Esperado: exit code 0, sin errores

# 3. NO hay console.* crudos fuera del logger
grep -rn "console\." src --include="*.js" | grep -v "src/engine/logger.js" | grep -v "// eslint-disable"
# Esperado: vacío

# 4. Archivos de fase 01 existen
test -f src/engine/log-context.js && echo "log-context: OK"
test -f src/middleware/request-log.js && echo "request-log: OK"
# Esperado: ambos OK

# 5. Logger emite severity (smoke test)
node -e "
process.env.LOG_FORMAT='json';
const log = require('./src/engine/logger');
log.info({type:'test'});
" 2>&1 | grep -q '"severity":"INFO"' && echo "severity: OK"
# Esperado: severity: OK
```

Si algo falla → vuelve a [01-logging-refactor.md](./01-logging-refactor.md), arregla y commitea, luego retoma esta fase.

---

## Contexto

El endpoint `GET /forusbot/jobs/:id` devuelve hoy ~274 líneas de JSON con metadata interna que el cliente externo no necesita: `stages`, `meta` (echo del request), `acceptedAt/startedAt/finishedAt`, `createdBy`, `result.code/message/url`, `extractorWarnings`, `evidencePath`, `totalSeconds`, `stagesSummaryMsByName`, etc.

Ejemplo real en [`payload.json`](../payload.json) (raíz del repo).

Después de esta fase: payload público de ~30 líneas. Toda la metadata interna sigue existiendo internamente (en memoria del job, y luego en Firestore en la fase 04) — solo no se expone al cliente externo. El endpoint admin verbose (`GET /forusbot/admin/jobs-db/:id`) se mantiene intacto para forensics.

---

## Tareas

### 1. Crear `src/middleware/public-response.js`

Helper que toma un job record completo y devuelve el shape público:

```js
// src/middleware/public-response.js
const { getFormatter } = require('./public-formatters');

/**
 * Convierte un job record interno (con stages, meta, createdBy, etc.)
 * en el shape público minimalista por bot.
 */
function toPublicJob(record) {
  const { state, botId, result, error, jobId } = record;

  // Estados intermedios — solo state
  if (state === 'queued' || state === 'running') {
    return { state };
  }

  if (state === 'canceled') {
    return { state };
  }

  if (state === 'failed') {
    return {
      state,
      error: normalizePublicError(error || result?.errors?.[0])
    };
  }

  // succeeded — aplica formatter por bot
  const formatter = getFormatter(botId);
  const data = formatter ? formatter(result) : (result?.data || null);

  return {
    state,
    data,
    warnings: result?.warnings || [],
    errors: result?.errors || [],
  };
}

function normalizePublicError(err) {
  if (!err) return { code: 'UNKNOWN', message: 'Job failed' };
  return {
    code: err.code || err.name || 'ERROR',
    message: err.message || String(err),
  };
}

module.exports = { toPublicJob };
```

### 2. Crear `src/middleware/public-formatters.js`

Registro central de los formatters por bot:

```js
const formatters = {
  'scrape-participant': require('../bots/forusall-scrape-participant/formatPublic'),
  'scrape-plan': require('../bots/forusall-scrape-plan/formatPublic'),
  'search-participants': require('../bots/forusall-search-participants/formatPublic'),
  'update-participant': require('../bots/forusall-update-participant/formatPublic'),
  'update-plan': require('../bots/forusall-update-plan/formatPublic'),
  'mfa-reset': require('../bots/forusall-mfa-reset/formatPublic'),
  'email-trigger': require('../bots/forusall-emailtrigger/formatPublic'),
  'vault-file-upload': require('../bots/forusall-upload/formatPublic'),
};

function getFormatter(botId) {
  return formatters[botId] || null;
}

module.exports = { getFormatter };
```

(Verificar antes los nombres exactos de los folders en `src/bots/`.)

### 3. Crear los 8 `formatPublic.js` (uno por bot)

Cada uno toma `result` (el record interno) y devuelve el `data` aplanado. Patrón de `scrape-participant`:

```js
// src/bots/forusall-scrape-participant/formatPublic.js

/**
 * Aplana el shape interno de scrape-participant al público.
 * Interno: result.data.modules[] con envoltura por module.
 * Público: { participantId, census?, savings_rate?, loans?, plan_details?, ... }
 */
module.exports = function formatPublic(result) {
  if (!result || !result.data) return null;

  const out = {
    participantId: result.data.participantId,
  };

  for (const m of result.data.modules || []) {
    if (m.status === 'ok' && m.data) {
      out[m.key] = m.data;  // censusObject directo, sin wrapper
    }
  }

  return out;
};
```

Aplicar el mismo patrón en cada bot — leer el shape interno actual (`src/bots/<bot>/runFlow.js` o `controller.js` para ver qué construyen) y aplanar:

| Bot                     | `data` público                                                      |
|-------------------------|---------------------------------------------------------------------|
| `scrape-participant`    | `{participantId, census?, savings_rate?, loans?, plan_details?, vesting?, accounts?}` |
| `scrape-plan`           | `{planId, basic_info?, plan_design?, ...6 modules}`                 |
| `search-participants`   | `{matches: [...], totalFound, page?}`                               |
| `update-participant`    | `{participantId, applied: {...}, skipped: [...]}`                   |
| `update-plan`           | `{planId, applied: {...}, skipped: [...]}`                          |
| `mfa-reset`             | `{participantId, reset: true}`                                      |
| `email-trigger`         | `{planId, emailType, recipientsTargeted: N}`                        |
| `vault-file-upload`     | `{planId, fileId, fileName, status: "audit_ready"}`                 |

### 4. Aplicar `toPublicJob` en los endpoints públicos

**Archivos a editar**: `src/routes/index.js` (donde están los endpoints `/forusbot/jobs` y `/forusbot/jobs/:id`).

Buscar los handlers de:
- `GET /forusbot/jobs` (listado)
- `GET /forusbot/jobs/:id` (detalle)

Cambiar el `res.json(jobRecord)` por:
```js
const { toPublicJob } = require('../middleware/public-response');
// ...
res.json(toPublicJob(jobRecord));
```

Para el listado, mapear cada item: `jobs.map(toPublicJob)`.

**IMPORTANTE**: el `POST` que encola (devuelve 202) sigue dando `{state:"queued", jobId}` — el `jobId` es necesario porque el cliente lo usa para el polling. Ese caso especial lo manejas en el handler del POST, no en `toPublicJob`.

### 5. NO tocar `/forusbot/admin/jobs-db/*`

Los endpoints admin (`src/routes/admin-jobs-db.js`, `admin-metrics-db.js`) siguen devolviendo el shape verbose con TODA la metadata. Acceso solo con admin token. Esto es para forensics y debug interno.

Verificar que NO se les aplique `toPublicJob`.

### 6. Actualizar `docs/openapi.yaml`

Bump versión a **2.4.0**. Agregar dos schemas:

```yaml
components:
  schemas:
    JobPublicResponse:
      type: object
      required: [state]
      properties:
        state:
          type: string
          enum: [queued, running, succeeded, failed, canceled]
        data:
          type: object
          description: Solo presente cuando state=succeeded. Shape específico por bot.
        error:
          type: object
          description: Solo presente cuando state=failed.
          properties:
            code: { type: string }
            message: { type: string }
        warnings: { type: array, items: { type: object } }
        errors: { type: array, items: { type: object } }

    JobAdminResponse:
      type: object
      description: |
        Shape verbose con toda la metadata interna (stages, meta, createdBy,
        timestamps, métricas). Solo accesible vía endpoints /admin/* con admin token.
      # ... schema actual completo ...
```

Cambiar las respuestas de:
- `GET /forusbot/jobs/:id` → `JobPublicResponse`
- `GET /forusbot/jobs` → array de `JobPublicResponse`
- `GET /forusbot/admin/jobs-db/:id` → `JobAdminResponse`

### 7. Actualizar docs y ejemplos

- `docs/api/*` (EN y ES): cambiar ejemplos de respuesta al nuevo shape público
- `docs/sandbox/*`: idem
- `README.md`: actualizar ejemplos cURL si muestran responses
- Agregar nota: "Para detalle verbose con stages, métricas y metadata interna, ver `/forusbot/admin/jobs-db/:id` (admin only)"

### 8. Test de regresión por bot

Crear (o agregar a) `scripts/test-public-shape.sh` que valide el shape para cada bot:

```bash
#!/usr/bin/env bash
# Smoke test del shape público
set -e
BASE=${BASE:-http://localhost:10000}
TOKEN=${TOKEN:-...}

# 1. Encolar un scrape-participant
JOB=$(curl -sS -X POST "$BASE/forusbot/scrape-participant" \
  -H "x-auth-token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"participantId":"158948","modules":[{"key":"census"}]}' | jq -r .jobId)

# 2. Polling hasta que termine
while true; do
  RESP=$(curl -sS "$BASE/forusbot/jobs/$JOB" -H "x-auth-token: $TOKEN")
  STATE=$(echo "$RESP" | jq -r .state)
  [[ "$STATE" == "succeeded" || "$STATE" == "failed" ]] && break
  sleep 2
done

echo "$RESP" | jq .

# 3. Validar shape
echo "$RESP" | jq -e '
  .state == "succeeded" and
  has("data") and (.data | has("participantId")) and (.data | has("census")) and
  (has("jobId") | not) and
  (has("botId") | not) and
  (has("meta") | not) and
  (has("stages") | not) and
  (has("createdBy") | not) and
  (has("acceptedAt") | not) and
  (has("totalSeconds") | not)
' && echo "✓ Shape público OK" || (echo "✗ Shape FALLÓ"; exit 1)
```

(Ese `echo "✓"` es la única excepción donde puedes usar emoji — está en bash, no en JS.)

---

## Verificación final

```bash
# 1. Lint sigue pasando
npm run lint

# 2. Archivos nuevos existen
ls -la src/middleware/public-response.js src/middleware/public-formatters.js
for bot in forusall-scrape-participant forusall-scrape-plan forusall-search-participants forusall-update-participant forusall-update-plan forusall-mfa-reset forusall-emailtrigger forusall-upload; do
  test -f "src/bots/$bot/formatPublic.js" && echo "$bot: OK" || echo "$bot: MISSING"
done
# Esperado: todos OK

# 3. Smoke test del shape (con app corriendo en otra terminal)
LOG_FORMAT=json npm start &
APP_PID=$!
sleep 3
bash scripts/test-public-shape.sh
kill $APP_PID

# 4. OpenAPI bumpeado
grep "version: 2.4.0" docs/openapi.yaml
# Esperado: encontrado

# 5. Verificar diff de tamaño antes/después con un job real
# (suponiendo que tienes un jobId guardado)
curl -sS http://localhost:10000/forusbot/jobs/$JOBID -H "x-auth-token: $TOKEN" | wc -l
# Esperado: <40 líneas (vs 274 antes)

# Y el admin sigue verbose:
curl -sS http://localhost:10000/forusbot/admin/jobs-db/$JOBID -H "x-auth-token: $ADMIN_TOKEN" | wc -l
# Esperado: ~270+ líneas (verbose, intacto)
```

Si TODO pasa → commit de la fase:

```bash
git add -A
git commit -m "API: limpiar shape público de jobs (274 → ~30 líneas)

- Agrega src/middleware/public-response.js con toPublicJob()
- Agrega 8 formatPublic.js (uno por bot) que aplanan modules a {key: data}
- GET /forusbot/jobs y /jobs/:id ahora devuelven shape público
- /admin/jobs-db/* mantiene shape verbose para forensics
- OpenAPI bump a 2.4.0 con JobPublicResponse y JobAdminResponse
- Actualiza docs y ejemplos
"
```

---

## Pitfalls comunes

- **Bots sin module.key**: si algún bot no usa el patrón `result.data.modules[]`, el formatter debe leer la estructura específica (ej: `mfa-reset` solo devuelve `{reset:true}`).
- **Errores en jobs queued/running**: NO incluyas `data` ni `warnings/errors` cuando state es `queued` o `running`. Solo `state`.
- **`createdByName`**: NO va en el shape público. Es metadata interna.
- **Romper el cliente actual**: si hay clientes en producción que dependen de campos como `jobId` en la respuesta, considera devolverlo solo por compatibilidad. Pero según las decisiones aprobadas, lo borramos.
- **Tests de docs**: si tienes tests en `docs/sandbox` que validan ejemplos, actualizarlos también.

---

## Salida que debe ver la fase 03

Para que la fase 03 valide su prerequisito:
- Working tree limpio post-commit
- `npm run lint` exit 0
- `GET /forusbot/jobs/:id` devuelve <40 líneas para un job succeeded
- Endpoint admin sigue verbose

Si todo eso pasa, procede a [03-gcp-infra-provisioning.md](./03-gcp-infra-provisioning.md).

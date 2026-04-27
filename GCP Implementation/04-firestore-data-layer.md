# Fase 04 — Refactor de la capa de datos a Firestore + BigQuery

**Duración estimada**: ~2 días
**Requiere GCP**: Sí (Firestore Emulator local + cloud para verificación)
**Reversible**: Sí hasta el cutover (rama feature, cherry-pick si quieres rollback)

---

## Validación inicial (la fase 03 quedó bien hecha)

```bash
cd "/Users/ivanalvis/Desktop/ForUsBots copy"

# 1. Working tree limpio (los commits de fase 01 y 02 están)
git status
git log --oneline | head -3

# 2. Config GCP local existe (creado al final de fase 03)
test -f .gcp-config.local && cat .gcp-config.local && echo "---"
# Esperado: PROJECT_ID, REGION, ZONE, SA_EMAIL, STATIC_IP, ARTIFACT_REPO

# 3. Cargar las vars al shell actual
source .gcp-config.local

# 4. gcloud apunta al proyecto correcto
gcloud config get-value project
# Esperado: $PROJECT_ID

# 5. Firestore existe
gcloud firestore databases describe --database='(default)' --format="value(type)"
# Esperado: FIRESTORE_NATIVE

# 6. BQ dataset existe
bq ls $PROJECT_ID:forusbots_analytics
# Esperado: aún sin tablas, o con tablas _raw_* si ya se instaló la extensión

# 7. Los 4 secrets existen
gcloud secrets list --format="value(name)" | sort
# Esperado: SHARED_TOKEN, SITE_PASS, SITE_USER, TOTP_SECRET

# 8. SA puede leer secrets
gcloud secrets get-iam-policy SITE_USER --format=json | grep -q "$SA_EMAIL" && echo "OK"
```

Si algo falla → vuelve a [03-gcp-infra-provisioning.md](./03-gcp-infra-provisioning.md).

---

## Validación de tools locales

```bash
# Firestore Emulator (parte de Firebase CLI)
firebase --version
# Si no: npm install -g firebase-tools

# Java (requerido por el emulator)
java -version
# Si no: brew install --cask temurin
```

---

## Contexto

Esta es la fase más larga. Vamos a:
1. Crear la capa de acceso a Firestore y BigQuery (`src/db/`)
2. Crear el loader de Secret Manager (`src/secrets.js`)
3. Reescribir `src/engine/audit.js` para escribir a Firestore en vez de Postgres
4. Reescribir `src/routes/admin-jobs-db.js` y `admin-metrics-db.js` para leer de Firestore (operacional) o BQ (analítica)
5. Borrar `src/routes/data-jobs-db.js` y `data-metrics-db.js`
6. Crear las 6 vistas BQ que reemplazan las queries Postgres del dashboard
7. Conectar el `forwardToAudit` del logger (que en fase 01 quedó como TODO) a Firestore
8. Quitar la dep de `pg`

Todo se prueba con **Firestore Emulator local** primero. NO tocamos producción todavía.

---

## Tareas

### 1. Agregar dependencias

```bash
npm install --save \
  @google-cloud/firestore \
  @google-cloud/bigquery \
  @google-cloud/secret-manager

npm uninstall pg
```

Verificar `package.json`:
- ✓ Tiene las 3 nuevas deps en `dependencies`
- ✓ NO tiene `pg`

### 2. Crear `src/secrets.js`

```js
// src/secrets.js
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const SECRETS = ['SITE_USER', 'SITE_PASS', 'TOTP_SECRET', 'SHARED_TOKEN'];

async function loadSecrets() {
  // Solo carga si está configurado un proyecto GCP. Si no, asume .env local.
  const project = process.env.GCP_PROJECT;
  if (!project) {
    return; // dev local: lee de .env
  }

  const client = new SecretManagerServiceClient();
  await Promise.all(SECRETS.map(async (name) => {
    if (process.env[name]) return; // override manual
    try {
      const [v] = await client.accessSecretVersion({
        name: `projects/${project}/secrets/${name}/versions/latest`,
      });
      process.env[name] = v.payload.data.toString('utf8');
    } catch (err) {
      throw new Error(`Failed to load secret ${name}: ${err.message}`);
    }
  }));
}

module.exports = { loadSecrets };
```

### 3. Modificar `src/index.js` para cargar secretos antes que cualquier require que los use

Al inicio del archivo, ANTES de cualquier require que toque `process.env.SITE_*` o `TOTP_SECRET`:

```js
require('dotenv').config(); // si ya está, dejarlo

(async () => {
  await require('./secrets').loadSecrets();
  // AHORA sí cargar el resto:
  const server = require('./server');
  // ...
})();
```

(Adaptar al patrón actual de `index.js` — si hoy hace `require('./server')` directo, envolverlo en este IIFE async.)

### 4. Crear `src/db/firestore.js`

```js
// src/db/firestore.js
const { Firestore, FieldValue, Timestamp } = require('@google-cloud/firestore');

let _db = null;
function db() {
  if (_db) return _db;
  _db = new Firestore({
    projectId: process.env.GCP_PROJECT || undefined,
    // Si FIRESTORE_EMULATOR_HOST está en env, el client lo detecta automáticamente
  });
  return _db;
}

const jobsCol = () => db().collection('jobs');
const eventsCol = () => db().collection('events');
const stagesCol = (jobId) => db().collection('jobs').doc(jobId).collection('stages');

module.exports = {
  db,
  jobsCol,
  eventsCol,
  stagesCol,
  FieldValue,
  Timestamp,
};
```

### 5. Crear `src/db/bigquery.js`

```js
// src/db/bigquery.js
const { BigQuery } = require('@google-cloud/bigquery');

const DATASET = 'forusbots_analytics';
let _bq = null;

function bq() {
  if (_bq) return _bq;
  _bq = new BigQuery({ projectId: process.env.GCP_PROJECT });
  return _bq;
}

/**
 * Ejecuta una query parametrizada contra forusbots_analytics.
 * @param {string} query - SQL con @params nombrados (NO uses ? ni $1)
 * @param {object} params - { paramName: value }
 */
async function runQuery(query, params = {}) {
  const [rows] = await bq().query({
    query,
    params,
    location: 'us-central1',
    maximumBytesBilled: '1000000000', // 1GB safety cap
  });
  return rows;
}

module.exports = { bq, runQuery, DATASET };
```

### 6. Reescribir `src/engine/audit.js`

**Estrategia**: mantener la API pública del módulo (`trackEvent`, etc.) idéntica para que el resto del código no se entere. Solo cambia la implementación de `INSERT` por `set/add`.

Ejemplo de patrón:

```js
// src/engine/audit.js
const { jobsCol, eventsCol, stagesCol, FieldValue, Timestamp } = require('../db/firestore');

const ENABLED = String(process.env.AUDIT_DB || '').trim() === '1';

function toTs(date) {
  if (!date) return null;
  if (date instanceof Date) return Timestamp.fromDate(date);
  if (typeof date === 'string') return Timestamp.fromDate(new Date(date));
  return null;
}

async function trackEvent(rec) {
  if (!ENABLED) return;

  const type = rec.type;
  const jobId = rec.jobId;

  try {
    if (type === 'job.accepted' && jobId) {
      await jobsCol().doc(jobId).set({
        bot_id: rec.botId,
        state: 'queued',
        accepted_at: toTs(rec.ts),
        meta: rec.meta || {},
        created_by: rec.createdBy || null,
        created_by_name: rec.createdByName || null,
        estimate: rec.estimate || null,
        capacity_snapshot: rec.capacitySnapshot || null,
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
    } else if (type === 'job.started' && jobId) {
      await jobsCol().doc(jobId).set({
        state: 'running',
        started_at: toTs(rec.ts),
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
    } else if ((type === 'job.succeeded' || type === 'job.failed' || type === 'job.canceled') && jobId) {
      await jobsCol().doc(jobId).set({
        state: type.split('.')[1],
        finished_at: toTs(rec.ts),
        result: rec.result || null,
        error: rec.error || null,
        run_ms: rec.runMs || null,
        queue_ms: rec.queueMs || null,
        total_ms: rec.totalMs || null,
        total_seconds: rec.totalSeconds || null,
        updated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
    } else if (type.startsWith('stage.') && jobId) {
      await stagesCol(jobId).add({
        bot_id: rec.botId,
        stage_name: rec.stage,
        status: type.split('.')[1], // start | succeed | fail
        started_at: toTs(rec.startedAt),
        ended_at: toTs(rec.endedAt),
        duration_ms: rec.durationMs || null,
        meta: rec.meta || null,
        error: rec.error || null,
        sequence: rec.sequence || Date.now(),
        inserted_at: FieldValue.serverTimestamp(),
      });
    }

    // SIEMPRE escribir el evento crudo en events/
    await eventsCol().add({
      ts: toTs(rec.ts),
      level: rec.level || 'info',
      type,
      job_id: jobId || null,
      bot_id: rec.botId || null,
      payload: rec, // shape completo para forensics
      inserted_at: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    // No tirar; solo log local (sin recursividad infinita al logger)
    console.error('[audit] firestore write failed:', err.message); // eslint-disable-line no-console
  }
}

module.exports = { trackEvent };
```

> **Nota**: el `eslint-disable-line no-console` es la única excepción permitida (en audit, para evitar loop si el logger está roto).

### 7. Conectar `forwardToAudit` del logger

En la fase 01 dejaste `forwardToAudit` como stub. Ahora conectarlo:

```js
// src/engine/logger.js (sección forwardToAudit)
const audit = require('./audit'); // existente

function forwardToAudit(rec) {
  if (!AUDIT_ENABLED) return;
  // fire-and-forget; no esperamos
  audit.trackEvent(rec).catch((e) => {
    // Tampoco tiramos al stdout para no spammear; ya falló dentro de audit
  });
}
```

### 8. Reescribir `src/routes/admin-jobs-db.js`

Operaciones LIVE (Firestore):
- `GET /admin/jobs-db?state=running&limit=20` → query con `where('state','==','running').orderBy('accepted_at','desc').limit(N)`
- `GET /admin/jobs-db/:id` → `jobsCol().doc(id).get()` + `stagesCol(id).orderBy('started_at').get()`

```js
// src/routes/admin-jobs-db.js
const express = require('express');
const { jobsCol, stagesCol } = require('../db/firestore');
const { resolveRole } = require('../middleware/auth');
const logger = require('../engine/logger');

const router = express.Router();

function adminGate(req, res, next) {
  const token = req.header('x-auth-token');
  const role = resolveRole(token);
  if (role !== 'admin') return res.status(403).json({ ok: false, error: 'forbidden' });
  next();
}

router.get('/jobs-db', adminGate, async (req, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit ?? '100', 10)));
  const state = (req.query.state || '').trim().toLowerCase();
  const botId = (req.query.botId || '').trim();

  try {
    let q = jobsCol().orderBy('accepted_at', 'desc');
    if (state) q = q.where('state', '==', state);
    if (botId) q = q.where('bot_id', '==', botId);
    q = q.limit(limit);

    const snap = await q.get();
    const jobs = snap.docs.map((d) => ({ jobId: d.id, ...d.data() }));
    res.json({ ok: true, total: jobs.length, jobs });
  } catch (err) {
    logger.error({ type: 'route.admin_jobs_db.list.error', error: err });
    res.status(500).json({ ok: false, error: 'db_error' });
  }
});

router.get('/jobs-db/:id', adminGate, async (req, res) => {
  try {
    const doc = await jobsCol().doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ ok: false, error: 'not_found' });

    const stagesSnap = await stagesCol(req.params.id).orderBy('started_at').get();
    const stages = stagesSnap.docs.map((d) => d.data());

    res.json({ jobId: doc.id, ...doc.data(), stages });
  } catch (err) {
    logger.error({ type: 'route.admin_jobs_db.get.error', error: err });
    res.status(500).json({ ok: false, error: 'db_error' });
  }
});

module.exports = router;
```

> **Filtros que NO existían en Postgres con ILIKE**: si los necesitas, mejor que esa función la cubra BQ (`v_jobs_search` con `LIKE`). Pero según el plan, esos endpoints `/data/*` se borran, así que probablemente ya no los necesitas.

### 9. Crear las vistas BQ

Crear `bq/views/` con 6 archivos `.sql`. Cada uno se aplica con `bq query --use_legacy_sql=false < archivo.sql`.

#### `bq/views/v_jobs_by_bot.sql`

```sql
CREATE OR REPLACE VIEW `forusbots_analytics.v_jobs_by_bot` AS
SELECT
  data.bot_id AS bot_id,
  COUNT(*) AS total,
  COUNTIF(data.state = 'succeeded') AS succeeded,
  COUNTIF(data.state = 'failed') AS failed,
  COUNTIF(data.state = 'queued') AS queued,
  COUNTIF(data.state = 'running') AS running,
  AVG(data.run_ms) AS avg_run_ms
FROM `forusbots_analytics.jobs_raw_latest`
WHERE operation != 'DELETE'
GROUP BY data.bot_id
ORDER BY total DESC;
```

#### `bq/views/v_throughput_hourly.sql`

```sql
CREATE OR REPLACE VIEW `forusbots_analytics.v_throughput_hourly` AS
SELECT
  TIMESTAMP_TRUNC(data.finished_at, HOUR) AS bucket,
  COUNT(*) AS count
FROM `forusbots_analytics.jobs_raw_latest`
WHERE data.finished_at IS NOT NULL
  AND operation != 'DELETE'
GROUP BY bucket
ORDER BY bucket DESC;
```

#### `bq/views/v_throughput_daily.sql`

```sql
CREATE OR REPLACE VIEW `forusbots_analytics.v_throughput_daily` AS
SELECT
  TIMESTAMP_TRUNC(data.finished_at, DAY) AS bucket,
  COUNT(*) AS count
FROM `forusbots_analytics.jobs_raw_latest`
WHERE data.finished_at IS NOT NULL
  AND operation != 'DELETE'
GROUP BY bucket
ORDER BY bucket DESC;
```

#### `bq/views/v_throughput_monthly.sql`

```sql
CREATE OR REPLACE VIEW `forusbots_analytics.v_throughput_monthly` AS
SELECT
  TIMESTAMP_TRUNC(data.finished_at, MONTH) AS bucket,
  COUNT(*) AS count
FROM `forusbots_analytics.jobs_raw_latest`
WHERE data.finished_at IS NOT NULL
  AND operation != 'DELETE'
GROUP BY bucket
ORDER BY bucket DESC;
```

#### `bq/views/v_status_recent.sql`

```sql
CREATE OR REPLACE VIEW `forusbots_analytics.v_status_recent` AS
SELECT
  COUNTIF(data.state = 'succeeded' AND data.finished_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)) AS succeeded_14d,
  COUNTIF(data.state = 'failed' AND data.finished_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)) AS failed_14d,
  COUNTIF(data.state = 'succeeded' AND data.finished_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)) AS succeeded_1d,
  COUNTIF(data.state = 'failed' AND data.finished_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)) AS failed_1d
FROM `forusbots_analytics.jobs_raw_latest`
WHERE operation != 'DELETE';
```

#### `bq/views/v_durations_recent.sql`

```sql
CREATE OR REPLACE VIEW `forusbots_analytics.v_durations_recent` AS
SELECT
  document_id AS job_id,
  data.bot_id AS bot_id,
  data.state AS state,
  data.run_ms AS run_ms,
  data.finished_at AS finished_at
FROM `forusbots_analytics.jobs_raw_latest`
WHERE data.finished_at IS NOT NULL
  AND operation != 'DELETE'
ORDER BY data.finished_at DESC
LIMIT 5000;
```

Aplicar:

```bash
for f in bq/views/*.sql; do
  echo "Aplicando $f..."
  bq query --use_legacy_sql=false --location=us-central1 < "$f"
done

# Verificar
bq ls forusbots_analytics | grep "^v_"
# Esperado: las 6 vistas
```

### 10. Reescribir `src/routes/admin-metrics-db.js`

Todas las agregaciones se hacen en BQ:

```js
// src/routes/admin-metrics-db.js
const express = require('express');
const { runQuery, DATASET } = require('../db/bigquery');
const { resolveRole } = require('../middleware/auth');
const logger = require('../engine/logger');

const router = express.Router();

function adminGate(req, res, next) {
  const token = req.header('x-auth-token');
  if (resolveRole(token) !== 'admin') return res.status(403).json({ ok: false, error: 'forbidden' });
  next();
}

router.get('/metrics-db', adminGate, async (req, res) => {
  try {
    const top = Math.min(200, Math.max(1, parseInt(req.query.top ?? '30', 10)));
    const agg = String(req.query.agg || 'hour').toLowerCase();
    const viewMap = { hour: 'v_throughput_hourly', day: 'v_throughput_daily', month: 'v_throughput_monthly' };
    const tpView = viewMap[agg] || 'v_throughput_hourly';

    const [byBot, throughput, status] = await Promise.all([
      runQuery(`SELECT * FROM \`${DATASET}.v_jobs_by_bot\` LIMIT @top`, { top }),
      runQuery(`SELECT * FROM \`${DATASET}.${tpView}\` LIMIT 200`),
      runQuery(`SELECT * FROM \`${DATASET}.v_status_recent\``),
    ]);

    res.json({
      ok: true,
      source: 'bq',
      generatedAt: new Date().toISOString(),
      byBot,
      throughput,
      status: status[0] || {},
    });
  } catch (err) {
    logger.error({ type: 'route.admin_metrics_db.error', error: err });
    res.status(500).json({ ok: false, error: 'bq_error' });
  }
});

module.exports = router;
```

### 11. Borrar archivos obsoletos

```bash
git rm src/routes/data-jobs-db.js
git rm src/routes/data-metrics-db.js
git rm -r migrations/   # ya no usamos Postgres
```

Y desmontar las rutas en `src/routes/index.js`:

```bash
# Buscar las líneas y borrarlas
grep -n 'require("./data-jobs-db")\|require("./data-metrics-db")\|router.use("/data"' src/routes/index.js
```

Eliminar esas líneas (y las imports correspondientes).

### 12. Test local con Firestore Emulator

Crear `package.json` script:

```json
"scripts": {
  "emulator": "firebase emulators:start --only firestore",
  "dev:emulator": "FIRESTORE_EMULATOR_HOST=localhost:8080 GCP_PROJECT=demo-forusbots AUDIT_DB=1 LOG_FORMAT=pretty npm start"
}
```

En una terminal:
```bash
npm run emulator
```

En otra:
```bash
npm run dev:emulator
```

Hacer un POST de prueba:
```bash
curl -X POST http://localhost:10000/forusbot/scrape-participant \
  -H 'x-auth-token: dev-token' \
  -H 'Content-Type: application/json' \
  -d '{"participantId":"123","modules":[{"key":"census"}]}'
```

Abrir Firebase Emulator UI (http://localhost:4000) y verificar que aparece el doc en `jobs/{uuid}`.

---

## Verificación final

```bash
# 1. Lint pasa
npm run lint

# 2. pg eliminado, deps GCP presentes
node -e "
const pkg = require('./package.json');
if (pkg.dependencies.pg) { console.error('pg AÚN EN deps'); process.exit(1); }
['@google-cloud/firestore','@google-cloud/bigquery','@google-cloud/secret-manager'].forEach(d => {
  if (!pkg.dependencies[d]) { console.error('FALTA:',d); process.exit(1); }
});
console.log('Deps: OK');
"

# 3. Archivos clave existen
test -f src/secrets.js && \
test -f src/db/firestore.js && \
test -f src/db/bigquery.js && \
echo "Módulos DB: OK"

# 4. Routes obsoletos NO existen
test ! -f src/routes/data-jobs-db.js && \
test ! -f src/routes/data-metrics-db.js && \
test ! -d migrations && \
echo "Limpieza: OK"

# 5. Vistas BQ existen en cloud
bq ls $PROJECT_ID:forusbots_analytics --format=json | jq -r '.[].tableReference.tableId' | grep "^v_" | sort
# Esperado: las 6 vistas v_*

# 6. Smoke test contra Firestore Emulator (terminal 1: npm run emulator; terminal 2: lo siguiente)
FIRESTORE_EMULATOR_HOST=localhost:8080 GCP_PROJECT=demo AUDIT_DB=1 node -e "
const { jobsCol } = require('./src/db/firestore');
(async () => {
  await jobsCol().doc('test-001').set({ bot_id: 'test', state: 'queued' });
  const d = await jobsCol().doc('test-001').get();
  console.log('Read back:', d.data());
})();
"
# Esperado: imprime { bot_id: 'test', state: 'queued' }

# 7. App arranca contra Emulator y procesa un job (manual)
# Terminal 1:
npm run emulator
# Terminal 2:
npm run dev:emulator
# Terminal 3:
TOKEN=tu-shared-token-de-dev curl -X POST http://localhost:10000/forusbot/scrape-participant \
  -H "x-auth-token: $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"participantId":"123","modules":[{"key":"census"}]}'
# Verificar en http://localhost:4000 que aparece el doc

# 8. Test contra Firestore en cloud (con la app local apuntando al cloud)
# Reemplaza emulator con real:
GCP_PROJECT=$PROJECT_ID AUDIT_DB=1 LOG_FORMAT=pretty npm start &
APP=$!
sleep 3
# (mismo POST curl)
# Verificar en GCP Console > Firestore que aparece el doc
kill $APP

# 9. Test que la replicación a BQ funciona
# Espera ~1 minuto después del paso 8, luego:
bq query --use_legacy_sql=false "SELECT COUNT(*) FROM \`$PROJECT_ID.forusbots_analytics.jobs_raw_latest\`"
# Esperado: count > 0

# 10. Test de las vistas
bq query --use_legacy_sql=false "SELECT * FROM \`$PROJECT_ID.forusbots_analytics.v_jobs_by_bot\` LIMIT 5"
# Esperado: filas con bot_id, total, succeeded, etc.
```

Si TODO pasa → commit:

```bash
git add -A
git commit -m "Migrar capa de datos de Postgres a Firestore + BigQuery

- Agrega @google-cloud/firestore, @google-cloud/bigquery, @google-cloud/secret-manager
- Quita pg
- Crea src/secrets.js para Secret Manager
- Crea src/db/firestore.js con helpers jobsCol/eventsCol/stagesCol
- Crea src/db/bigquery.js con runQuery
- Reescribe src/engine/audit.js para escribir a Firestore (jobs, events, stages)
- Reescribe src/routes/admin-jobs-db.js para leer de Firestore
- Reescribe src/routes/admin-metrics-db.js para leer de BigQuery
- Borra src/routes/data-{jobs,metrics}-db.js y migrations/
- Crea 6 vistas BQ en bq/views/ que reemplazan queries Postgres
- Conecta logger.forwardToAudit a Firestore vía audit.trackEvent
"
```

---

## Pitfalls comunes

- **Emulator no detectado**: si el código se conecta a Firestore real en vez de al emulator, falta `FIRESTORE_EMULATOR_HOST=localhost:8080`. El SDK lo detecta automáticamente vía esa env var.
- **`AUDIT_DB=1` requerido**: si no lo prendes, `audit.trackEvent` no escribe nada. Setearlo en dev y prod.
- **Latencia BQ replication**: la primera vez que escribes a Firestore, la tabla `_raw_*` aparece en ~1-2 minutos. Paciencia.
- **Schema de BQ**: la extensión genera columnas `data` (JSON) y `document_id`, `operation`, `timestamp`. Las vistas asumen ese shape — si la extensión cambió de versión, ajustar las vistas.
- **Cuotas Firestore**: free tier 50k reads/día. En tests locales con emulator no aplica, pero al apuntar a cloud puedes excederla rápido si haces stress test.
- **`jobId` UUIDs**: los IDs de Firestore no aceptan ciertos caracteres. Si tu UUID tiene `/`, fallará. Verifica que el formato sea limpio.
- **Filtros que no se traducen**: `ILIKE` con `%texto%` no existe en Firestore. Si necesitas búsqueda parcial, mueve esa query a BQ.

---

## Salida que debe ver la fase 05

- `npm run lint` exit 0
- App local apuntando a Firestore real (`GCP_PROJECT=$PROJECT_ID`) procesa jobs end-to-end
- Replicación Firestore→BQ funcionando (jobs aparecen en `jobs_raw_latest` en <2 min)
- 6 vistas BQ devuelven filas
- `pg` ya no está en deps

Si todo eso pasa, procede a [05-deploy-and-cutover.md](./05-deploy-and-cutover.md).

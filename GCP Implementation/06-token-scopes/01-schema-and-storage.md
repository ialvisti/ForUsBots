# Fase 06.01 — Schema de tokens, catálogo de roles, y storage

**Duración estimada**: ~3 horas
**Requiere GCP**: Sólo al final (subir `TOKENS_JSON` v2 a Secret Manager)
**Reversible**: Sí (git revert + restaurar versión anterior del secret)

---

## Contexto (lee antes de empezar)

Lee primero el [00-OVERVIEW.md](./00-OVERVIEW.md). Esta fase NO toca middleware ni `runFlow.js` de bots. Sólo:
1. Define el shape final de `tokens.json` (incluye credenciales ForUsAll inline + scope).
2. Crea el catálogo central de roles en `src/auth/roles.js`.
3. Crea el mapeo de endpoint → feature en `src/auth/featureMap.js`.
4. Migra los 12 tokens existentes al nuevo shape (local + secret en GCP).
5. Valida que el secreto carga sin romper nada.

---

## Validación inicial (la fase 05 de GCP terminó y la VM está sana)

```bash
cd "/Users/ivanalvis/Desktop/ForUsBots copy"
source .gcp-config.local

# 1. Working tree limpio
git status

# 2. VM responde
curl -fsS http://$STATIC_IP:10000/health
# Esperado: {"ok":true}

# 3. TOKENS_JSON secreto existe en GCP
gcloud secrets describe TOKENS_JSON --project=$PROJECT_ID --format="value(name)"
# Esperado: projects/.../secrets/TOKENS_JSON

# 4. Backup local del shape actual ANTES de empezar
gcloud secrets versions access latest --secret=TOKENS_JSON --project=$PROJECT_ID > /tmp/tokens-v1-backup.json
jq '. | length' /tmp/tokens-v1-backup.json
# Esperado: número de tokens actual (probablemente 12)
```

Si algo falla → no avanzar. Revisar la fase 05 de GCP.

---

## Tareas

### 1. Definir el shape final de `tokens.json`

Cada entrada del objeto `tokens.json` (key = token string, value = metadata) tendrá:

```jsonc
{
  "<TOKEN_STRING>": {
    // Identidad (ya existe)
    "role": "user",                    // admin | user | pa_lead | rm_lead | ops_lead | imp_lead
    "name": "Camilo X",
    "email": "camilo@forusall.com",
    "id": "camilo-x",

    // NUEVO — credenciales ForUsAll que el bot usará al login en el portal
    "account": {
      "alias": "ops-prod",             // identificador legible para logs/whoami
      "siteUser": "ops@forusall.com",  // username del portal
      "sitePass": "*********",         // password (secreto)
      "totpSecret": "JBSWY3DPEHPK3PXP" // base32 para speakeasy
    },

    // NUEVO — scope override (opcional, todos default = [])
    "deniedFeatures":   ["update-plan"],                       // suma a role.defaultDeniedFeatures
    "deniedEndpoints":  ["DELETE /forusbot/jobs/:id"],         // exact match (después de normalización)
    "allowedEndpoints": ["POST /forusbot/sandbox/update-plan"] // re-habilita si fue denegado por feature
  }
}
```

Reglas:
- `account` es **requerido** en cada token a partir del cierre de la fase 03. Durante la grace period, si falta → fallback a creds globales del `.env` (fase 03 se encarga). En fase 01 ya migramos todos.
- `deniedFeatures` / `deniedEndpoints` / `allowedEndpoints` son opcionales (default `[]`).
- `role` sigue siendo requerido. Tokens sin role → tratar como `user` con warning de log.

### 2. Crear `src/auth/roles.js`

```bash
mkdir -p src/auth
```

Crear el archivo `src/auth/roles.js`:

```js
// src/auth/roles.js
// Catálogo central de roles. Para cada role: defaultDeniedFeatures = lista de features
// que el role NO puede ejecutar por default. Un token con ese role hereda esta denylist
// y puede agregar deniedFeatures/deniedEndpoints extra, o re-habilitar con allowedEndpoints.

const ROLES = Object.freeze({
  admin: {
    label: "Admin",
    defaultDeniedFeatures: [],
  },
  user: {
    label: "User",
    defaultDeniedFeatures: [
      "update-plan",
      "mfa-reset",
      "admin-jobs-db",
      "admin-metrics-db",
      "admin-settings",
      "admin-locks",
      "admin-metrics",
      "admin-version",
      "admin-openapi",
      "admin-close",
      "articles-write",
    ],
  },
  pa_lead: {
    label: "PA Lead",
    defaultDeniedFeatures: [
      "update-plan",
      "admin-jobs-db",
      "admin-metrics-db",
      "admin-settings",
      "admin-close",
    ],
  },
  rm_lead: {
    label: "RM Lead",
    defaultDeniedFeatures: [
      "update-plan",
      "mfa-reset",
      "admin-jobs-db",
      "admin-metrics-db",
      "admin-settings",
      "admin-close",
    ],
  },
  ops_lead: {
    label: "Ops Lead",
    defaultDeniedFeatures: [
      "admin-settings",
      "admin-close",
    ],
  },
  imp_lead: {
    label: "Implementation Lead",
    defaultDeniedFeatures: [
      "update-plan",
      "mfa-reset",
      "admin-jobs-db",
      "admin-metrics-db",
      "admin-settings",
      "admin-close",
    ],
  },
});

function getRole(roleId) {
  return ROLES[roleId] || ROLES.user; // fallback a user si role desconocido
}

module.exports = { ROLES, getRole };
```

> **Importante**: estos valores son una **propuesta inicial** basada en lo que el usuario describió. Ajustar el denylist por role tras hablar con los equipos. NO inventar features que no existen — el conjunto válido viene de `featureMap.js` (tarea 3).

### 3. Crear `src/auth/featureMap.js`

```js
// src/auth/featureMap.js
// Mapeo canónico de endpoints → features (granularidad de scope).
// Cada endpoint protegido pertenece a UNA feature. Cuando un token tiene
// "deniedFeatures: ['scrape-participant']", se bloquean TODOS los endpoints
// cuya feature == "scrape-participant".
//
// Endpoints NO listados aquí son "open" (health, articles read, admin/login, etc.)
// y nunca pasan por requireScope.

const FEATURE_KEYS = Object.freeze([
  // bots
  "scrape-participant",
  "scrape-plan",
  "update-participant",
  "update-plan",
  "search-participants",
  "mfa-reset",
  "email-trigger",
  "vault-upload",
  // sandbox dry-run
  "sandbox-vault-upload",
  "sandbox-update-plan",
  // jobs / queue
  "jobs-read",
  "jobs-write",
  // admin
  "admin-jobs-db",
  "admin-metrics-db",
  "admin-settings",
  "admin-locks",
  "admin-metrics",
  "admin-version",
  "admin-openapi",
  "admin-close",
  // articles
  "articles-write",
  "articles-draft-read",
  "articles-draft-write",
  "articles-draft-publish",
]);

// Key = "METHOD /path-pattern". Path patterns usan ":id" para params (no regex).
// La normalización de path se hace en src/auth/scopes.js.
const ENDPOINT_TO_FEATURE = Object.freeze({
  // Bots (controllers principales)
  "POST /forusbot/scrape-participant":         "scrape-participant",
  "POST /forusbot/scrape-plan":                "scrape-plan",
  "POST /forusbot/update-participant":         "update-participant",
  "POST /forusbot/update-plan":                "update-plan",
  "POST /forusbot/search-participants":        "search-participants",
  "POST /forusbot/mfa-reset":                  "mfa-reset",
  "POST /forusbot/email-trigger":              "email-trigger",
  "POST /forusbot/vault-file-upload":          "vault-upload",

  // Sandbox dry-run
  "POST /forusbot/sandbox/vault-file-upload":  "sandbox-vault-upload",
  "POST /forusbot/sandbox/update-plan":        "sandbox-update-plan",

  // Jobs / queue
  "GET    /forusbot/jobs":                     "jobs-read",
  "GET    /forusbot/jobs/:id":                 "jobs-read",
  "DELETE /forusbot/jobs/:id":                 "jobs-write",

  // Admin
  "GET    /forusbot/locks":                    "admin-locks",
  "GET    /forusbot/settings":                 "admin-settings",
  "PATCH  /forusbot/settings":                 "admin-settings",
  "GET    /forusbot/metrics":                  "admin-metrics",
  "GET    /forusbot/version":                  "admin-version",
  "GET    /forusbot/openapi":                  "admin-openapi",
  "POST   /forusbot/_close":                   "admin-close",
  "GET    /forusbot/admin/jobs-db":            "admin-jobs-db",
  "GET    /forusbot/admin/jobs-db/:id":        "admin-jobs-db",
  "DELETE /forusbot/admin/jobs-db/_purge":     "admin-jobs-db",
  "GET    /forusbot/admin/metrics-db":         "admin-metrics-db",

  // Articles
  "POST   /forusbot/articles":                 "articles-write",
  "DELETE /forusbot/articles/:id":             "articles-write",
  "GET    /forusbot/articles-draft":           "articles-draft-read",
  "GET    /forusbot/articles-draft/:id":       "articles-draft-read",
  "GET    /forusbot/articles-draft/_published":     "articles-draft-read",
  "GET    /forusbot/articles-draft/_published/:id": "articles-draft-read",
  "POST   /forusbot/articles-draft":           "articles-draft-write",
  "POST   /forusbot/articles-draft/:id/rename":      "articles-draft-write",
  "DELETE /forusbot/articles-draft/:id":       "articles-draft-write",
  "POST   /forusbot/articles-draft/:id/publish":     "articles-draft-publish",
});

// Endpoints completamente abiertos (NO pasan por requireScope, sólo requireUser cuando aplica).
// Estos son: health, auth admin handshake, whoami, articles read público.
const OPEN_ENDPOINTS = new Set([
  "GET  /forusbot/health",
  "GET  /forusbot/status",          // condicional (depende de flags), pero no aplica scope
  "GET  /forusbot/whoami",          // whoami: cualquier token autenticado ve SU info
  "GET  /forusbot/articles",        // KB pública
  "GET  /forusbot/articles/:id",
  "POST /forusbot/admin/login",
  "POST /forusbot/admin/logout",
  "GET  /forusbot/admin/whoami",
]);

function endpointKey(method, pathPattern) {
  // Normaliza a "METHOD /path" sin padding. Usa una sola space entre method y path.
  return `${String(method).toUpperCase()} ${pathPattern}`.replace(/\s+/g, " ").trim();
}

module.exports = { FEATURE_KEYS, ENDPOINT_TO_FEATURE, OPEN_ENDPOINTS, endpointKey };
```

> El padding visual en las keys (`"GET    /..."`) en el objeto fuente es sólo para alineación al leer el archivo. `endpointKey()` normaliza espacios al hacer match. Si te molesta el padding visual, podés escribirlo todo con un solo espacio — pero entonces ajusta los strings literales para que matcheen.

### 4. Migrar los 12 tokens al nuevo shape (LOCAL primero)

```bash
# Trae el JSON actual desde Secret Manager
gcloud secrets versions access latest --secret=TOKENS_JSON --project=$PROJECT_ID > /tmp/tokens-v1.json

# Inspecciona shape actual
jq 'to_entries[0]' /tmp/tokens-v1.json
```

Crear un script de migración una sola vez (NO commitearlo). Algo así como `scripts/migrate-tokens-v2.mjs`:

```js
// scripts/migrate-tokens-v2.mjs  (efímero, BORRAR tras usar)
import fs from "fs";

const SRC = "/tmp/tokens-v1.json";
const DST = "/tmp/tokens-v2.json";

const data = JSON.parse(fs.readFileSync(SRC, "utf8"));

// Credenciales por default que se van a copiar al alias "legacy-shared" para back-compat.
// REEMPLAZAR estos valores con los reales del .env / Secret Manager actual.
const SHARED = {
  alias: "legacy-shared",
  siteUser: process.env.SITE_USER || "REPLACE_ME",
  sitePass: process.env.SITE_PASS || "REPLACE_ME",
  totpSecret: process.env.TOTP_SECRET || "REPLACE_ME",
};

const out = {};
for (const [tok, meta] of Object.entries(data)) {
  out[tok] = {
    role:  meta.role  || "user",
    name:  meta.name  || "",
    email: meta.email || "",
    id:    meta.id    || "",
    account: { ...SHARED },           // todos arrancan con la cuenta compartida; el equipo asigna luego
    deniedFeatures:   [],
    deniedEndpoints:  [],
    allowedEndpoints: [],
  };
}

fs.writeFileSync(DST, JSON.stringify(out, null, 2));
console.log("Wrote", DST, "with", Object.keys(out).length, "tokens");
```

Ejecutar (carga las creds reales del .env primero):

```bash
set -a; source .env; set +a
node scripts/migrate-tokens-v2.mjs
diff <(jq -S 'keys' /tmp/tokens-v1.json) <(jq -S 'keys' /tmp/tokens-v2.json) && echo "Mismas keys: OK"
```

**Importante**: este paso deja TODOS los tokens apuntando a la misma cuenta `legacy-shared`. La asignación de cuentas reales por token (ej. dar a Camilo `ops-prod` y a Ivan `admin-prod`) es un paso de **operación** que se hace después, editando el JSON en Secret Manager. No es parte del código.

### 5. Actualizar `tokens.json` local del repo

El archivo `tokens.json` del repo es **dev-only con dummy creds** (no se commitean passwords reales). Replicar el shape pero con valores placeholder:

```jsonc
{
  "dev-token-admin-DUMMY": {
    "role": "admin",
    "name": "Local Admin",
    "email": "dev@local",
    "id": "dev-admin",
    "account": {
      "alias": "dev-local",
      "siteUser": "DEV_SITE_USER",
      "sitePass": "DEV_SITE_PASS",
      "totpSecret": "JBSWY3DPEHPK3PXP"
    },
    "deniedFeatures": [],
    "deniedEndpoints": [],
    "allowedEndpoints": []
  },
  "dev-token-user-DUMMY": {
    "role": "user",
    "name": "Local User",
    "email": "user@local",
    "id": "dev-user",
    "account": {
      "alias": "dev-local",
      "siteUser": "DEV_SITE_USER",
      "sitePass": "DEV_SITE_PASS",
      "totpSecret": "JBSWY3DPEHPK3PXP"
    },
    "deniedFeatures": [],
    "deniedEndpoints": [],
    "allowedEndpoints": []
  }
}
```

Agregar al inicio del archivo (o como comment de README) un aviso:

> **Este archivo es dev-only**. En producción los tokens vienen del secreto GCP `TOKENS_JSON`. Los `siteUser`/`sitePass`/`totpSecret` aquí son placeholders. NO commitear creds reales.

Asegurar que `.gitignore` cubre cualquier copia local con creds reales (ej. `tokens.local.json`):

```bash
grep -E "^tokens\." .gitignore || echo "tokens.local.json" >> .gitignore
grep "/tmp/tokens" .gitignore || echo "/tmp/tokens*.json" >> .gitignore  # estos /tmp ya no están en repo pero por las dudas
```

### 6. Pequeña validación de carga en `src/secrets.js`

`src/secrets.js` actualmente vuelca el secreto a `/tmp/tokens.json` y settea `TOKENS_FILE`. NO cambia. PERO agregamos una validación de shape al cargar para detectar JSON mal formado:

Edita [src/secrets.js](../../src/secrets.js) y, justo después de escribir `/tmp/tokens.json`, agrega:

```js
// Validación liviana de shape: cada entry debe tener { role, account: { siteUser, sitePass, totpSecret } }
// durante el grace period los campos pueden faltar — sólo warneamos.
try {
  const tokens = JSON.parse(fs.readFileSync("/tmp/tokens.json", "utf8"));
  const total = Object.keys(tokens).length;
  let missingAccount = 0;
  let missingScope = 0;
  for (const [tok, meta] of Object.entries(tokens)) {
    if (!meta?.account?.siteUser || !meta?.account?.sitePass || !meta?.account?.totpSecret) missingAccount++;
    if (!Array.isArray(meta?.deniedFeatures)) missingScope++;
  }
  console.log(`[secrets] TOKENS_JSON loaded: ${total} tokens (legacy account: ${missingAccount}, legacy scope: ${missingScope})`);
} catch (e) {
  console.error("[secrets] TOKENS_JSON parse failed:", e.message);
}
```

Esto no rompe nada — sólo loguea cuántos tokens están en shape legacy. Útil para saber cuándo cerrar el grace period.

### 7. Subir `TOKENS_JSON` v2 a Secret Manager

```bash
gcloud secrets versions add TOKENS_JSON \
  --data-file=/tmp/tokens-v2.json \
  --project=$PROJECT_ID

# Verifica
gcloud secrets versions list TOKENS_JSON --project=$PROJECT_ID --limit=3
gcloud secrets versions access latest --secret=TOKENS_JSON --project=$PROJECT_ID | jq 'to_entries[0]'
# Esperado: la primera entry tiene { role, name, email, id, account, deniedFeatures, deniedEndpoints, allowedEndpoints }
```

> NO recrear la VM aún — el código viejo sigue funcionando porque ignora los campos extra. La VM tomará el nuevo secreto en el próximo restart, pero como no hay middleware nuevo en esta fase, no afecta nada.

### 8. Smoke test: la app local arranca con el shape nuevo

```bash
# Apunta a TOKENS_JSON v2 sin tocar la VM
gcloud secrets versions access latest --secret=TOKENS_JSON --project=$PROJECT_ID > /tmp/tokens.json
TOKENS_FILE=/tmp/tokens.json node -e "
const auth = require('./src/middleware/auth');
console.log('module loaded ok');
"
# Esperado: no errores
```

Probar un curl real contra la app local (`npm start` en otra terminal) usando uno de los tokens migrados:

```bash
TOK=$(jq -r 'to_entries[] | select(.value.role=="admin") | .key' /tmp/tokens.json | head -1)
curl -fsS http://localhost:10000/forusbot/whoami -H "x-auth-token: $TOK" | jq
# Esperado: { ok, role:"admin", name, email, ... } SIN scope todavía (es fase 02)
```

---

## Verificación final

```bash
# 1. Archivos nuevos en su lugar
test -f src/auth/roles.js && \
test -f src/auth/featureMap.js && \
echo "Archivos nuevos: OK"

# 2. tokens.json local migrado
jq '.[] | select(.account == null)' tokens.json | head -1
# Esperado: vacío (todas las entries tienen account)

# 3. roles.js carga sin error e incluye 6 roles
node -e "const { ROLES } = require('./src/auth/roles'); console.log(Object.keys(ROLES))"
# Esperado: [ 'admin', 'user', 'pa_lead', 'rm_lead', 'ops_lead', 'imp_lead' ]

# 4. featureMap.js carga, lista features y endpoints
node -e "
const fm = require('./src/auth/featureMap');
console.log('features:', fm.FEATURE_KEYS.length);
console.log('endpoints:', Object.keys(fm.ENDPOINT_TO_FEATURE).length);
console.log('open:', fm.OPEN_ENDPOINTS.size);
"
# Esperado: features ~24, endpoints ~30, open ~7

# 5. Secret en GCP tiene shape nuevo
gcloud secrets versions access latest --secret=TOKENS_JSON --project=$PROJECT_ID | \
  jq 'to_entries | map(select(.value.account != null and .value.deniedFeatures != null)) | length'
# Esperado: número de tokens (todos migrados)

# 6. Versión anterior queda como rollback
gcloud secrets versions list TOKENS_JSON --project=$PROJECT_ID --format="value(name,state)" | head -3
# Esperado: al menos 2 versiones, la anterior en ENABLED

# 7. App local arranca con TOKENS_FILE apuntando al nuevo shape
TOKENS_FILE=/tmp/tokens.json timeout 10 npm start &
sleep 5
curl -fsS http://localhost:10000/health
kill %1 2>/dev/null
# Esperado: {"ok":true}

# 8. Lint pasa
npm run lint && echo "Lint: OK"
```

Si todo pasa, commit:

```bash
git add src/auth/roles.js src/auth/featureMap.js src/secrets.js tokens.json .gitignore
git commit -m "Token scopes 01: shape de tokens + catálogo de roles + featureMap

- Agrega src/auth/roles.js con 6 roles y defaultDeniedFeatures
- Agrega src/auth/featureMap.js con mapeo endpoint→feature (~30 endpoints, ~24 features)
- Migra tokens.json local al shape nuevo con account + scope (dummy creds)
- TOKENS_JSON v2 subido a Secret Manager (versión anterior queda como rollback)
- src/secrets.js valida shape al cargar y loguea tokens legacy

Sin cambios de comportamiento todavía: middleware nuevo viene en fase 02.
"
```

---

## Pitfalls comunes

- **Subir el secreto sin probar el shape**: si el JSON es inválido, `secrets.js` crashea al cargar y la VM no arranca. SIEMPRE `jq .` el archivo antes de `gcloud secrets versions add`.
- **Commitear creds reales en `tokens.json`**: el repo es público (ialvisti/ForUsBots) — usar SIEMPRE valores dummy en el archivo del repo.
- **Borrar la versión anterior del secret**: NO. Quedan como rollback. `gcloud secrets versions destroy` sólo cuando ya pasaron las 24h de monitoreo de la fase 05 final.
- **Olvidar el script de migración**: `scripts/migrate-tokens-v2.mjs` es efímero. Borrarlo del repo después de usarlo (`git status` no debe mostrarlo después del commit).
- **Roles inventados**: NO agregar roles que no existan en tokens.json actual. Los 6 roles del catálogo vienen de la realidad. Si el equipo quiere un role nuevo, se agrega en una iteración separada.
- **Features inventadas**: el set válido es `FEATURE_KEYS` del `featureMap.js`. Si `roles.js` referencia una feature no listada, lo va a detectar el test de la fase 02.

---

## Salida que debe ver la fase 02

- `src/auth/roles.js` y `src/auth/featureMap.js` existen y cargan sin error.
- `tokens.json` local tiene shape nuevo.
- Secret `TOKENS_JSON` v2 en GCP con todos los tokens migrados.
- Comportamiento del sistema **no cambió** — sólo agregamos data, ningún middleware nuevo todavía.
- Versión anterior del secret queda como rollback.
- Commit del trabajo en main.

Si todo eso pasa, procede a [02-auth-middleware-and-scopes.md](./02-auth-middleware-and-scopes.md).

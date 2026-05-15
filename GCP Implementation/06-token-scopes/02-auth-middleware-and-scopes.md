# Fase 06.02 — Auth middleware con scopes (requireScope)

**Duración estimada**: ~4 horas
**Requiere GCP**: No (desarrollo local). El deploy a la VM viene en la fase 05 de este sub-folder.
**Reversible**: Sí (git revert)

---

## Contexto (lee antes de empezar)

Lee primero [00-OVERVIEW.md](./00-OVERVIEW.md). La fase 01 ya dejó:
- `src/auth/roles.js` con catálogo de roles y `defaultDeniedFeatures`.
- `src/auth/featureMap.js` con mapeo endpoint → feature y `OPEN_ENDPOINTS`.
- `tokens.json` y secret `TOKENS_JSON` v2 con campos `account` y scope (`deniedFeatures`, `deniedEndpoints`, `allowedEndpoints`).

Esta fase agrega la **lógica de autorización**:
1. Resuelve el scope efectivo de cada token (role default + token overrides).
2. Adjunta `req.auth.scope` en el middleware existente.
3. Crea `requireScope(featureKey)` y lo monta en cada router de bot + endpoints de `src/routes/index.js`.
4. Extiende `whoami` para devolver el scope efectivo (sin credenciales).
5. **NO toca runFlows ni credenciales del portal** — eso es fase 03.

---

## Validación inicial (la fase 01 quedó bien hecha)

```bash
cd "/Users/ivanalvis/Desktop/ForUsBots copy"
source .gcp-config.local

git status   # working tree limpio
git log -1 --oneline | grep -i "Token scopes 01" && echo "Commit fase 01: OK"

# 1. roles + featureMap existen y cargan
node -e "
const { ROLES, getRole } = require('./src/auth/roles');
const { FEATURE_KEYS, ENDPOINT_TO_FEATURE, OPEN_ENDPOINTS } = require('./src/auth/featureMap');
console.log('roles:', Object.keys(ROLES).length, '— features:', FEATURE_KEYS.length, '— endpoints:', Object.keys(ENDPOINT_TO_FEATURE).length);
// Sanity: cada feature en defaultDeniedFeatures debe existir en FEATURE_KEYS
const fks = new Set(FEATURE_KEYS);
for (const [r, def] of Object.entries(ROLES)) {
  for (const f of def.defaultDeniedFeatures) {
    if (!fks.has(f) && !f.endsWith('*')) { console.error('Feature inválida en role', r, ':', f); process.exit(1); }
  }
}
console.log('roles ↔ features: OK');
"

# 2. Secret v2 con shape nuevo (al menos 1 token con account.alias)
gcloud secrets versions access latest --secret=TOKENS_JSON --project=$PROJECT_ID | \
  jq 'to_entries[] | select(.value.account.alias) | .value.account.alias' | head -1
# Esperado: al menos un alias
```

Si algo falla → volver a [01-schema-and-storage.md](./01-schema-and-storage.md).

---

## Tareas

### 1. Crear `src/auth/scopes.js`

Núcleo de la lógica de autorización. Es **pure functions** (sin side effects), unit-testeable.

```js
// src/auth/scopes.js
const { ROLES, getRole } = require("./roles");
const { ENDPOINT_TO_FEATURE, OPEN_ENDPOINTS, endpointKey } = require("./featureMap");

/**
 * Convierte un Express path (o req.path con params resueltos) a su forma con `:id`.
 * Ejemplo: "/forusbot/jobs/abc-123" → "/forusbot/jobs/:id" si matchea ENDPOINT_TO_FEATURE.
 *
 * Para que sea barato, primero intentamos match exacto contra los patterns conocidos
 * (recorremos las keys de ENDPOINT_TO_FEATURE y reemplazamos `:id` por un regex `[^/]+`).
 */
function _patternCache() {
  if (_patternCache._cached) return _patternCache._cached;
  const out = [];
  for (const key of Object.keys(ENDPOINT_TO_FEATURE)) {
    const [method, pattern] = key.trim().split(/\s+/);
    const regex = new RegExp("^" + pattern.replace(/:[a-zA-Z_]+/g, "[^/]+") + "$");
    out.push({ method: method.toUpperCase(), pattern, regex });
  }
  for (const key of OPEN_ENDPOINTS) {
    const [method, pattern] = key.trim().split(/\s+/);
    const regex = new RegExp("^" + pattern.replace(/:[a-zA-Z_]+/g, "[^/]+") + "$");
    out.push({ method: method.toUpperCase(), pattern, regex, open: true });
  }
  _patternCache._cached = out;
  return out;
}

/**
 * Dado method + raw path, devuelve { feature, isOpen, key } o null si no está registrado.
 * Si feature == null y isOpen == false, el endpoint no está bajo control de scopes
 * (caso típico: rutas raras o no listadas). En ese caso, requireScope debe DEJAR PASAR
 * con un warning de log — no inventamos política.
 */
function resolveEndpoint(method, rawPath) {
  const upMethod = String(method || "").toUpperCase();
  for (const p of _patternCache()) {
    if (p.method !== upMethod) continue;
    if (p.regex.test(rawPath)) {
      const key = endpointKey(upMethod, p.pattern);
      if (p.open) return { feature: null, isOpen: true, key };
      return { feature: ENDPOINT_TO_FEATURE[key], isOpen: false, key };
    }
  }
  return null;
}

/**
 * Resuelve el scope efectivo de un token. Idempotente, sin side effects.
 *
 * Entrada: tokenMeta = la value de tokens.json para el token (puede ser legacy/incompleto).
 * Salida: { deniedFeatures: Set, deniedEndpoints: Set, allowedEndpoints: Set, role }
 */
function resolveScope(tokenMeta) {
  const roleId = tokenMeta?.role || "user";
  const role = getRole(roleId);

  const deniedFeatures  = new Set(role.defaultDeniedFeatures || []);
  for (const f of (tokenMeta?.deniedFeatures || [])) deniedFeatures.add(f);

  const deniedEndpoints  = new Set(tokenMeta?.deniedEndpoints  || []);
  const allowedEndpoints = new Set(tokenMeta?.allowedEndpoints || []);

  return { deniedFeatures, deniedEndpoints, allowedEndpoints, role: roleId };
}

/**
 * Decide si una request específica es permitida bajo un scope dado.
 * Devuelve { allowed: bool, reason?: string }.
 *
 * Orden de evaluación:
 *  1. allowedEndpoints (override) — si la request matchea, ALLOW siempre.
 *  2. deniedEndpoints (exact) — si matchea, DENY.
 *  3. deniedFeatures (general) — si feature ∈ denied, DENY.
 *  4. default: ALLOW.
 *
 * Endpoints OPEN siempre allow.
 * Endpoints desconocidos (no en map): allow + warn (lo loguea requireScope).
 */
function isAllowed(scope, method, pathPattern) {
  const key = endpointKey(method, pathPattern);

  if (scope.allowedEndpoints.has(key)) return { allowed: true,  reason: "explicit-allow" };
  if (scope.deniedEndpoints.has(key))  return { allowed: false, reason: "denied-endpoint" };

  // feature lookup
  const feature = ENDPOINT_TO_FEATURE[key];
  if (feature && scope.deniedFeatures.has(feature)) {
    return { allowed: false, reason: `denied-feature:${feature}` };
  }
  return { allowed: true, reason: "default-allow" };
}

/**
 * Versión "amigable" para mostrar en whoami — sin sets, sin lógica interna.
 */
function scopeToJSON(scope) {
  return {
    role: scope.role,
    deniedFeatures:   [...scope.deniedFeatures].sort(),
    deniedEndpoints:  [...scope.deniedEndpoints].sort(),
    allowedEndpoints: [...scope.allowedEndpoints].sort(),
  };
}

module.exports = { resolveScope, isAllowed, resolveEndpoint, scopeToJSON };
```

### 2. Crear `src/middleware/requireScope.js`

```js
// src/middleware/requireScope.js
const { isAllowed } = require("../auth/scopes");

/**
 * Middleware factory. Se monta DESPUÉS de requireUser.
 * Llamarlo con la feature canónica del endpoint, p.ej. requireScope("scrape-participant").
 *
 * El factory acepta opcionalmente el pathPattern explícito (para casos donde req.route.path
 * no es el final, ej. routers montados con prefijo). Default: usa req.method + req.baseUrl+req.route.path.
 */
function requireScope(featureKey, { pathPattern } = {}) {
  return function requireScopeMiddleware(req, res, next) {
    // Sin auth previo → ya falló más arriba, pero por defensa:
    if (!req.auth || !req.auth.scope) {
      return res.status(401).json({ ok: false, error: "unauthenticated" });
    }
    // Resolver pathPattern. Preferir el explícito (parámetro); si no, reconstruir desde el router.
    const method = req.method;
    const pattern = pathPattern || (req.baseUrl || "") + (req.route?.path || req.path);

    const verdict = isAllowed(req.auth.scope, method, pattern);
    if (verdict.allowed) return next();

    return res.status(403).json({
      ok: false,
      error: "forbidden",
      feature: featureKey,
      endpoint: `${method} ${pattern}`,
      reason: verdict.reason,
    });
  };
}

module.exports = requireScope;
```

### 3. Modificar `src/middleware/auth.js` para adjuntar `req.auth.scope`

Lee primero el archivo completo. Encuentra el bloque donde se construye `req.auth` (alrededor de la línea 117-121 según la exploración). Inmediatamente después de construir `req.auth`, agrega:

```js
const { resolveScope } = require("../auth/scopes");
// ... dentro del flow que construye req.auth ...
req.auth.scope = resolveScope(tokenMeta);  // tokenMeta = lo que ya estás leyendo de tokens.json
```

**Back-compat (grace period)**: si `tokenMeta` no tiene los campos nuevos, `resolveScope` ya hace fallback (default = role.user). No hace falta lógica extra acá.

> **Importante**: si el repo ya tiene tests que validan el shape de `req.auth`, actualizarlos para tolerar el nuevo campo `scope`. Buscar con `grep -rn "req.auth" src/ tests/ scripts/ | grep -v node_modules`.

### 4. Montar `requireScope` en cada router de bot

Editar cada router. Ejemplo en [src/bots/forusall-scrape-participant/routes.js:6](../../src/bots/forusall-scrape-participant/routes.js#L6):

```js
// Antes:
router.post("/", requireUser, controller);

// Después:
const requireScope = require("../../middleware/requireScope");
router.post("/", requireUser, requireScope("scrape-participant"), controller);
```

Lista de routers a editar (con la feature key correspondiente — copiada de `featureMap.js`):

| Router | featureKey |
|---|---|
| `src/bots/forusall-scrape-participant/routes.js` | `scrape-participant` |
| `src/bots/forusall-scrape-plan/routes.js` | `scrape-plan` |
| `src/bots/forusall-update-participant/routes.js` | `update-participant` |
| `src/bots/forusall-update-plan/routes.js` (después de `restrictToEmails`) | `update-plan` |
| `src/bots/forusall-search-participants/routes.js` | `search-participants` |
| `src/bots/forusall-mfa-reset/routes.js` | `mfa-reset` |
| `src/bots/forusall-emailtrigger/routes.js` | `email-trigger` |
| `src/bots/forusall-upload/routes.js` | `vault-upload` |

> `update-plan` mantiene el `restrictToEmails` LEGACY por ahora (no quitarlo en esta fase). Se decide en una iteración futura si lo reemplazamos con un `allowedEmails` en el scope.

### 5. Montar `requireScope` en endpoints de `src/routes/index.js`

Para cada endpoint listado en `featureMap.js`, agregar `requireScope(...)` después del `requireUser`/`requireAdmin` correspondiente. Lista crítica:

```js
// jobs
router.get("/jobs",             requireUser,  requireScope("jobs-read"),  jobsListHandler);
router.get("/jobs/:id",         requireUser,  requireScope("jobs-read"),  jobDetailHandler);
router.delete("/jobs/:id",      requireUser,  requireScope("jobs-write"), jobCancelHandler);

// admin
router.get("/locks",            requireAdmin, requireScope("admin-locks"),   locksHandler);
router.get("/settings",         requireAdmin, requireScope("admin-settings"), getSettings);
router.patch("/settings",       requireAdmin, requireScope("admin-settings"), patchSettings);
router.get("/metrics",          requireAdmin, requireScope("admin-metrics"),  metricsHandler);
router.get("/version",          requireAdmin, requireScope("admin-version"),  versionHandler);
router.get("/openapi",          requireAdmin, requireScope("admin-openapi"),  openapiHandler);
router.post("/_close",          requireAdmin, requireScope("admin-close"),    closeHandler);

// admin-jobs-db / admin-metrics-db / articles ... mismo patrón
```

**Diseño**: `requireAdmin` + `requireScope("admin-*")` parece redundante pero no lo es. `requireAdmin` enforce el role, `requireScope` permite que un admin específico se pueda restringir vía `deniedEndpoints` si hace falta (overrides finos sin cambiar el role).

> **Justificación de defensa en profundidad**: si por bug eliminamos `requireAdmin` de un endpoint admin-only, `requireScope` lo sigue protegiendo (a menos que el role del token lo permita). Y vice versa. No remover ninguno.

### 6. Extender `/forusbot/auth/whoami` con scope

Editar [src/server.js](../../src/server.js) — el handler de `/forusbot/auth/whoami` (o el equivalente que devuelve `{ ok, role }`). Modificar para incluir el scope efectivo y el alias de cuenta:

```js
const { scopeToJSON } = require("./auth/scopes");

// Handler:
function whoamiHandler(req, res) {
  const a = req.auth || {};
  const scope = a.scope ? scopeToJSON(a.scope) : null;
  res.json({
    ok: true,
    role: a.role || null,
    isAdmin: !!a.isAdmin,
    user: a.user || null,                                  // { name, email, id }
    accountAlias: a.tokenMeta?.account?.alias || null,     // alias para sandbox UI
    scope,                                                 // null en grace period si no resolvió
  });
}
```

**NO devolver nunca `siteUser`/`sitePass`/`totpSecret`** en `whoami`. Sólo el alias. El alias es OK porque ya es legible y se usa para auditoría.

### 7. Actualizar el `tokenMeta` que viaja en `req.auth`

En el middleware `auth.js`, asegurar que el objeto raw del token (tokenMeta) se adjunta a `req.auth.tokenMeta` para que `whoami` y futuros consumidores (fase 03) accedan al `account`. **Pero NO devolverlo nunca completo al cliente.**

```js
// Dentro del middleware después de validar el token:
req.auth = {
  role: tokenMeta.role,
  isAdmin: tokenMeta.role === "admin",
  user: { name: tokenMeta.name, email: tokenMeta.email, id: tokenMeta.id },
  scope: resolveScope(tokenMeta),
  tokenMeta,  // raw — uso interno; NO serializar al cliente directamente
};
```

### 8. Tests unitarios de `scopes.js`

Crear `tests/auth/scopes.test.js` (o el path que use el repo si ya hay tests; si no, crear el folder):

```js
const { resolveScope, isAllowed, resolveEndpoint } = require("../../src/auth/scopes");

describe("scopes", () => {
  test("admin sin overrides: all allowed", () => {
    const scope = resolveScope({ role: "admin" });
    expect(isAllowed(scope, "POST", "/forusbot/update-plan").allowed).toBe(true);
  });

  test("user default: update-plan denied", () => {
    const scope = resolveScope({ role: "user" });
    expect(isAllowed(scope, "POST", "/forusbot/update-plan").allowed).toBe(false);
  });

  test("user con allowedEndpoints override: re-habilita endpoint", () => {
    const scope = resolveScope({
      role: "user",
      allowedEndpoints: ["POST /forusbot/update-plan"],
    });
    expect(isAllowed(scope, "POST", "/forusbot/update-plan").allowed).toBe(true);
  });

  test("admin con deniedEndpoints: bloquea endpoint específico", () => {
    const scope = resolveScope({
      role: "admin",
      deniedEndpoints: ["DELETE /forusbot/jobs/:id"],
    });
    expect(isAllowed(scope, "DELETE", "/forusbot/jobs/:id").allowed).toBe(false);
    expect(isAllowed(scope, "GET",    "/forusbot/jobs/:id").allowed).toBe(true);
  });

  test("token legacy (sin role): treated as user", () => {
    const scope = resolveScope({});
    expect(scope.role).toBe("user");
  });

  test("resolveEndpoint normaliza path con :id", () => {
    const r = resolveEndpoint("DELETE", "/forusbot/jobs/abc-123");
    expect(r.feature).toBe("jobs-write");
  });
});
```

Si el repo no tiene jest configurado, lo común en este proyecto son scripts en `scripts/`. Alternativa: `scripts/test-scopes.mjs` con asserts manuales. Verificar lo que se usa con `cat package.json | jq .scripts` y seguir la convención existente.

---

## Verificación final

```bash
# 1. Tests pasan
npm test     # o el equivalente que use el repo (ver package.json)

# 2. Lint pasa
npm run lint

# 3. Smoke test contra app local con tokens de fase 01
TOKENS_FILE=/tmp/tokens.json timeout 30 npm start &
sleep 5

# 3a. admin: whoami devuelve scope con deniedFeatures vacío
ADMIN_TOK=$(jq -r 'to_entries[] | select(.value.role=="admin") | .key' /tmp/tokens.json | head -1)
curl -fsS http://localhost:10000/forusbot/whoami -H "x-auth-token: $ADMIN_TOK" | jq '.scope'
# Esperado: { role:"admin", deniedFeatures:[], deniedEndpoints:[], allowedEndpoints:[] }

# 3b. user: update-plan debe dar 403
USER_TOK=$(jq -r 'to_entries[] | select(.value.role=="user") | .key' /tmp/tokens.json | head -1)
curl -sS -o /dev/null -w "%{http_code}\n" -X POST http://localhost:10000/forusbot/update-plan \
  -H "x-auth-token: $USER_TOK" -H "Content-Type: application/json" -d '{}'
# Esperado: 403

# 3c. user: scrape-participant debe pasar (al menos hasta el controller, devolverá 4xx por payload pero no 403)
curl -sS -o /dev/null -w "%{http_code}\n" -X POST http://localhost:10000/forusbot/scrape-participant \
  -H "x-auth-token: $USER_TOK" -H "Content-Type: application/json" -d '{}'
# Esperado: 400 (participantId requerido) — NO 403

# 3d. user con override allowedEndpoints
# (editar /tmp/tokens.json en una entry user, agregar "allowedEndpoints":["POST /forusbot/update-plan"])
# Reiniciar app, repetir 3b → ahora 4xx/5xx por payload pero no 403

kill %1 2>/dev/null

# 4. Endpoints abiertos siguen sin auth
curl -fsS http://localhost:10000/forusbot/health
# Esperado: {"ok":true}

# 5. Inventario sano: ningún endpoint en featureMap.js sin handler real
node -e "
const fm = require('./src/auth/featureMap');
console.log('Endpoints registrados:', Object.keys(fm.ENDPOINT_TO_FEATURE).length);
console.log('Open endpoints:',         fm.OPEN_ENDPOINTS.size);
console.log('Total features únicas:',  new Set(Object.values(fm.ENDPOINT_TO_FEATURE)).size);
"
```

Si todo pasa, commit:

```bash
git add src/auth/scopes.js src/middleware/requireScope.js src/middleware/auth.js src/server.js \
        src/bots/*/routes.js src/routes/index.js tests/auth/scopes.test.js
git commit -m "Token scopes 02: middleware requireScope y resolución de scope

- src/auth/scopes.js: resolveScope, isAllowed, scopeToJSON
- src/middleware/requireScope.js: factory 403 si bloqueado por feature/endpoint
- src/middleware/auth.js: adjunta req.auth.scope y req.auth.tokenMeta
- src/server.js: /forusbot/auth/whoami devuelve scope + accountAlias (sin creds)
- Monta requireScope en 8 bots + endpoints en src/routes/index.js
- Tests unitarios de scopes (admin/user/override/legacy)

Sin cambios en credenciales del portal (eso es fase 03).
"
```

---

## Pitfalls comunes

- **Olvidar back-compat de tokens legacy**: si `req.auth.tokenMeta` viene sin `scope`, `resolveScope` ya fallback. Pero `whoami` muestra `scope: null` durante el grace period — está OK, el sandbox UI debe tolerar `null`.
- **Confundir `req.path` con `req.route.path`**: en Express, `req.path` puede traer el path resuelto con params (ej. `/jobs/abc-123`), pero `req.route.path` trae el pattern (`/jobs/:id`). Para `requireScope` usar el pattern del router (con `req.baseUrl + req.route.path`).
- **Doble protección admin/scope**: NO simplificar quitando `requireAdmin` "porque ya está el scope". Defensa en profundidad. Si un admin se restringe vía `deniedEndpoints`, el scope corta; si el role baja, `requireAdmin` corta.
- **`update-plan` y restrictToEmails**: NO quitar `restrictToEmails` en esta fase aunque ahora hay scope. Es legacy explícito hasta migración manual.
- **Tests rotos**: cualquier test que monkey-patchee `req.auth` debe agregar `scope`. Ejecutar la suite ANTES de commitear.
- **Endpoints abiertos no listados**: si hay un endpoint sin auth que tampoco está en `OPEN_ENDPOINTS`, `requireScope` no se ejecuta (porque no se monta sin `requireUser`). Está bien — `OPEN_ENDPOINTS` es para documentación y para `resolveEndpoint`, no para gatekeeping.

---

## Salida que debe ver la fase 03

- `requireScope` funcionando en todos los routers de bots y en `src/routes/index.js`.
- Tests unitarios pasan.
- `whoami` devuelve scope efectivo (con `accountAlias` ya disponible pero no usado todavía).
- Los bots siguen ejecutándose con credenciales globales (`SITE_USER`/`SITE_PASS`/`TOTP_SECRET` del `.env`) — sin cambios en runFlows.
- Commit del trabajo en main.

Si todo eso pasa, procede a [03-per-token-credentials.md](./03-per-token-credentials.md).

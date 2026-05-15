# Fase 06.04 — Sandbox UI dinámico + docs + rename de Looker

**Duración estimada**: ~3 horas
**Requiere GCP**: No (desarrollo local)
**Reversible**: Sí (git revert)

---

## Contexto (lee antes de empezar)

Lee primero [00-OVERVIEW.md](./00-OVERVIEW.md). Fase 02 ya extendió `/forusbot/auth/whoami` con `scope` y `accountAlias`. Fase 03 ya inyecta credenciales per-token en runtime.

Esta fase es de **superficie y documentación**:
1. La sandbox HTML (`docs/sandbox/index.html`) refleja dinámicamente las features permitidas/denegadas del token actual.
2. OpenAPI YAML se actualiza para documentar el shape nuevo de `whoami`.
3. Docs del repo (`README.md`, `FOLDER_CONTEXT.md`) ganan una sección "Tokens & Scopes".
4. Se renombra `GCP Implementation/06-looker-studio-dashboards.md` → `07-looker-studio-dashboards.md` y se actualiza el enlace en el overview del folder padre.

---

## Validación inicial (la fase 03 quedó bien hecha)

```bash
cd "/Users/ivanalvis/Desktop/ForUsBots copy"
source .gcp-config.local

git status   # working tree limpio
git log -1 --oneline | grep -i "Token scopes 03" && echo "Commit fase 03: OK"

# 1. whoami devuelve scope + accountAlias
TOKENS_FILE=/tmp/tokens.json timeout 15 npm start &
sleep 5
TOK=$(jq -r 'to_entries[0].key' /tmp/tokens.json)
curl -fsS http://localhost:10000/forusbot/whoami -H "x-auth-token: $TOK" | jq -e '.scope and .accountAlias'
kill %1 2>/dev/null
# Esperado: la expresión jq devuelve true
```

Si algo falla → volver a [03-per-token-credentials.md](./03-per-token-credentials.md).

---

## Hallazgo de fase 03 — gap de logging en bots Patrón B

Durante el smoke de cierre de fase 03 se detectó una inconsistencia en el log `login.attempt` entre los dos patrones de login:

- **Patrón A** (delegan a `ensureAuthForTarget` → `doLoginAndMaybeOtp`): scrape-plan, update-plan, search-participants, mfa-reset, emailtrigger, upload.
  Emiten `log.info({type:"login.attempt", accountAlias, siteUser:masked, jobId})` en [src/engine/auth/loginOtp.js:193-198](../../src/engine/auth/loginOtp.js#L193) tras adquirir el `acquireLogin(account.siteUser)`. ✓

- **Patrón B** (login local con `doLoginWithOtp` propio): scrape-participant, update-participant.
  Usan `acquireLogin(account.siteUser)` correctamente (mutex per-alias funciona), pero **NO** emiten el log `login.attempt`. La trazabilidad por job sigue intacta vía `accountAlias` en el evento `job.accepted`, pero falta el log específico del momento del login. Esto rompe la simetría en Cloud Logging — los dashboards de "logins por cuenta" no contarán los logins de los 2 bots de participant.

**Fix sugerido** (incluir en fase 04, o diferir a fase 05 si se prefiere):

En [src/bots/forusall-scrape-participant/runFlow.js:99](../../src/bots/forusall-scrape-participant/runFlow.js#L99) y [src/bots/forusall-update-participant/runFlow.js](../../src/bots/forusall-update-participant/runFlow.js) (post-`acquireLogin`, pre-OTP), agregar:

```js
const log = require("../../engine/logger");
const { maskEmail } = require("../../auth/account");
// ...
const release = await acquireLogin(account.siteUser);
try {
  jobCtx?.setStage?.("otp", { otpLock: "holder" });
  await waitNewTotpWindowIfNeeded(account.siteUser);

  log.info({
    type: "login.attempt",
    accountAlias: account.alias,
    siteUser: maskEmail(account.siteUser),
    jobId: jobCtx?.jobId || null,
  });

  // ... resto igual
```

Costo: ~5 líneas por bot × 2 bots = 10 líneas + 2 imports nuevos. Sin tests adicionales (el log es side-effect y ya está cubierto por inspección manual; los unit tests existentes de `account.js` y `loginLock.js` cubren el comportamiento subyacente).

Si se difiere a fase 05, anotar en la verificación del rollout que los logins por participant-bot no aparecerán en `login.attempt` hasta el fix.

---

## Tareas

### 1. Auditar la sandbox actual

```bash
ls docs/sandbox/
cat docs/sandbox/index.html | head -50
ls docs/sandbox/js/
```

Identifica:
- Dónde se hace el fetch a `/forusbot/whoami` (probable: `docs/sandbox/js/main.js`).
- Cómo se enumeran las "cards" o secciones de cada feature (cada bot tiene su tarjeta con botón "Send").
- Si hay i18n a `docs/sandbox/es/`.

### 2. Modificar el bootstrap de la sandbox para leer scope

En `docs/sandbox/js/main.js` (o el archivo que arranca la UI), buscar la llamada existente a `/whoami` y extenderla. Si no existe, agregar:

```js
// Pseudo — ajustar al estilo real del archivo
async function bootstrap() {
  const token = readTokenFromHeader();   // ya existe en la sandbox
  const r = await fetch("/forusbot/whoami", { headers: { "x-auth-token": token } });
  if (!r.ok) {
    renderAuthError();
    return;
  }
  const me = await r.json();
  // me = { ok, role, isAdmin, user, accountAlias, scope: { deniedFeatures, deniedEndpoints, allowedEndpoints, role } }

  renderHeader(me);                       // muestra name + role + accountAlias
  applyScopeToUI(me.scope);               // deshabilita features denegadas
}
```

### 3. Implementar `applyScopeToUI(scope)`

Lógica:

```js
// Cada "card" de feature en el HTML tiene `data-feature="scrape-participant"` (o similar).
// Si no tiene, agregarlo en la fase 1 de esta sección.
function applyScopeToUI(scope) {
  if (!scope) return;  // grace period — token legacy sin scope
  const denied = new Set(scope.deniedFeatures || []);
  const deniedEp = new Set(scope.deniedEndpoints || []);
  const allowedEp = new Set(scope.allowedEndpoints || []);

  document.querySelectorAll("[data-feature]").forEach(card => {
    const feature = card.dataset.feature;
    if (!denied.has(feature)) return;

    // Si el card tiene también data-endpoint y está en allowedEp, NO deshabilitar.
    const ep = card.dataset.endpoint;     // p.ej. "POST /forusbot/update-plan"
    if (ep && allowedEp.has(ep)) {
      // Override visible:
      card.classList.add("scope-override");
      return;
    }

    card.classList.add("scope-disabled");
    card.querySelectorAll("button, input, select, textarea").forEach(el => { el.disabled = true; });
    appendBadge(card, "🚫 forbidden by scope (feature)");
  });

  // Endpoints individuales fuera de cards (botones sueltos):
  document.querySelectorAll("[data-endpoint]").forEach(btn => {
    const ep = btn.dataset.endpoint;
    if (!deniedEp.has(ep)) return;
    if (allowedEp.has(ep)) return;
    btn.classList.add("scope-disabled");
    btn.disabled = true;
    setTooltip(btn, "forbidden by scope (endpoint)");
  });
}
```

Agregar al CSS de la sandbox (`docs/sandbox/sandbox.css` o el que use):

```css
.scope-disabled { opacity: .45; pointer-events: none; position: relative; }
.scope-disabled::after {
  content: "🚫"; position: absolute; top: 8px; right: 8px;
  font-size: 16px; opacity: .9;
}
.scope-override { outline: 2px dashed #f5a623; }
```

### 4. Marcar las cards/buttons con `data-feature` y `data-endpoint`

Para cada tarjeta de bot en `docs/sandbox/index.html`, agregar el atributo correspondiente. Ejemplo:

```html
<!-- Antes: -->
<section class="card" id="scrape-participant">
  ...
</section>

<!-- Después: -->
<section class="card" id="scrape-participant"
         data-feature="scrape-participant"
         data-endpoint="POST /forusbot/scrape-participant">
  ...
</section>
```

Lista completa de cards a marcar (un par por bot — el real y el sandbox dry-run cuando aplica):
- `scrape-participant`, `scrape-plan`, `update-participant`, `update-plan`, `search-participants`, `mfa-reset`, `email-trigger`, `vault-upload`
- Cards sandbox: `sandbox-vault-upload`, `sandbox-update-plan`
- Cards jobs/admin: `jobs-read`, `jobs-write`, `admin-*` si la sandbox los muestra

### 5. Header dinámico con info del token

Encima del listado de cards, agregar (o reusar) un header que muestre:

```html
<header id="me-banner">
  <span id="me-name">—</span>
  <span class="role-badge" id="me-role">—</span>
  <span class="account-badge" id="me-account">—</span>
</header>
```

JS:
```js
function renderHeader(me) {
  document.getElementById("me-name").textContent     = me.user?.name || "unknown";
  document.getElementById("me-role").textContent     = me.role || "—";
  document.getElementById("me-account").textContent  = me.accountAlias ? `cuenta: ${me.accountAlias}` : "(sin cuenta)";
}
```

> **No mostrar** `siteUser` (email) aunque venga enmascarado — el alias es suficiente y evita confusiones.

### 6. i18n: replicar cambios en `docs/sandbox/es/` si existe

```bash
ls docs/sandbox/es/ 2>/dev/null && echo "Existe i18n — replicar cambios"
```

Si existe, traducir mensajes nuevos:
- "forbidden by scope (feature)" → "bloqueado por scope (feature)"
- "(sin cuenta)" ya está en español

### 7. Actualizar OpenAPI YAML

El endpoint `/forusbot/openapi` sirve un YAML estático (revisar [src/routes/index.js:213](../../src/routes/index.js#L213) para localizar el archivo). En el schema de la response de `/whoami`, agregar:

```yaml
WhoAmI:
  type: object
  required: [ok]
  properties:
    ok: { type: boolean }
    role:
      type: string
      enum: [admin, user, pa_lead, rm_lead, ops_lead, imp_lead]
    isAdmin: { type: boolean }
    user:
      type: object
      properties:
        name:  { type: string }
        email: { type: string }
        id:    { type: string }
    accountAlias:
      type: string
      nullable: true
      description: "Alias de la cuenta ForUsAll que el token usa al ejecutar bots. NO incluye credenciales."
    scope:
      type: object
      nullable: true
      description: "Scope efectivo del token (role default ∪ overrides). Null sólo en grace period legacy."
      properties:
        role: { type: string }
        deniedFeatures:
          type: array
          items: { type: string }
        deniedEndpoints:
          type: array
          items: { type: string, description: 'e.g. "POST /forusbot/update-plan"' }
        allowedEndpoints:
          type: array
          items: { type: string }
```

Agregar la respuesta `403 forbidden` al schema de cada endpoint protegido por scope:

```yaml
responses:
  '403':
    description: Forbidden by token scope (feature or endpoint)
    content:
      application/json:
        schema:
          type: object
          properties:
            ok:       { const: false }
            error:    { const: "forbidden" }
            feature:  { type: string }
            endpoint: { type: string }
            reason:   { type: string }
```

### 8. Docs del repo

#### `FOLDER_CONTEXT.md`

Agregar una sección al final:

```markdown
## Tokens & Scopes

Cada token en `TOKENS_JSON` (Secret Manager) lleva:
- `role` — uno de: admin, user, pa_lead, rm_lead, ops_lead, imp_lead
- `account: { alias, siteUser, sitePass, totpSecret }` — credenciales del portal ForUsAll que el bot usará al ejecutar la request
- `deniedFeatures`, `deniedEndpoints`, `allowedEndpoints` — overrides finos (suma al role default)

Lógica de autorización: `src/auth/scopes.js`. Catálogo de roles: `src/auth/roles.js`. Mapeo endpoint→feature: `src/auth/featureMap.js`.

Para editar tokens en producción:
\`\`\`
gcloud secrets versions access latest --secret=TOKENS_JSON --project=forusbots > /tmp/tokens.json
# editar /tmp/tokens.json
gcloud secrets versions add TOKENS_JSON --data-file=/tmp/tokens.json --project=forusbots
\`\`\`
La VM toma la nueva versión en el próximo restart del MIG (o forzar: `gcloud compute instance-groups managed rolling-action restart forusbots-mig --zone=us-central1-a`).
```

#### `README.md`

Sección breve "Tokens" en la parte de autenticación, con un ejemplo:

```markdown
### Tokens

Authentication via `x-auth-token` header. Each token is mapped to:
- a **role** (admin / user / *_lead)
- a **ForUsAll portal account** (so multiple tokens can use different accounts)
- optional **scope** (denied features and per-endpoint overrides)

See `src/auth/roles.js` for the role catalog and `src/auth/featureMap.js` for the endpoint→feature mapping.
```

### 9. Rename `06-looker-studio-dashboards.md` → `07-`

```bash
cd "/Users/ivanalvis/Desktop/ForUsBots copy"
git mv "GCP Implementation/06-looker-studio-dashboards.md" "GCP Implementation/07-looker-studio-dashboards.md"
```

Actualizar `GCP Implementation/00-OVERVIEW.md` para reflejar la nueva numeración:

```diff
- | 6 | [06-looker-studio-dashboards.md](./06-looker-studio-dashboards.md) | ~1 día | Sí           | Sí (los dashboards son separables) |
+ | 6 | [06-token-scopes/00-OVERVIEW.md](./06-token-scopes/00-OVERVIEW.md) | ~19h | Sí (Secret Manager) | Sí (rollback de TOKENS_JSON) |
+ | 7 | [07-looker-studio-dashboards.md](./07-looker-studio-dashboards.md) | ~1 día | Sí           | Sí (los dashboards son separables) |
```

Ajustar el total estimado (~3-4 días → ~4-5 días).

### 10. Smoke visual de la sandbox

```bash
TOKENS_FILE=/tmp/tokens.json timeout 60 npm start &
sleep 5

# Abrir en browser:
open "http://localhost:10000/docs/sandbox/" 2>/dev/null || echo "abrir manual: http://localhost:10000/docs/sandbox/"

# En la UI, autenticarse con un token user y verificar:
# - header muestra name + role + accountAlias
# - card "update-plan" está deshabilitada con badge
# - card "scrape-participant" está habilitada
# - si el token tiene allowedEndpoints override, la card aparece con outline punteado

kill %1 2>/dev/null
```

---

## Verificación final

```bash
# 1. Lint pasa
npm run lint

# 2. La sandbox carga whoami y aplica el scope
# (verificación manual en browser, como en tarea 10)

# 3. OpenAPI tiene el shape nuevo
TOKENS_FILE=/tmp/tokens.json timeout 15 npm start &
sleep 5
ADMIN_TOK=$(jq -r 'to_entries[] | select(.value.role=="admin") | .key' /tmp/tokens.json | head -1)
curl -fsS http://localhost:10000/forusbot/openapi -H "x-auth-token: $ADMIN_TOK" | grep -E "accountAlias|deniedFeatures" | head -5
kill %1 2>/dev/null
# Esperado: matches de los nuevos campos

# 4. Rename de Looker aplicado
test -f "GCP Implementation/07-looker-studio-dashboards.md" && \
test ! -f "GCP Implementation/06-looker-studio-dashboards.md" && \
test -d "GCP Implementation/06-token-scopes" && \
echo "Estructura del folder: OK"

grep -q "06-token-scopes" "GCP Implementation/00-OVERVIEW.md" && echo "Overview actualizado: OK"

# 5. Docs del repo mencionan tokens & scopes
grep -q "Tokens & Scopes\|TOKENS_JSON" FOLDER_CONTEXT.md && echo "FOLDER_CONTEXT.md: OK"
grep -q "x-auth-token\|role catalog\|featureMap" README.md   && echo "README.md: OK"
```

Si todo pasa, commit:

```bash
git add docs/sandbox/index.html docs/sandbox/js/main.js docs/sandbox/sandbox.css docs/sandbox/es/ \
        src/routes/index.js \
        FOLDER_CONTEXT.md README.md \
        "GCP Implementation/00-OVERVIEW.md" "GCP Implementation/07-looker-studio-dashboards.md"

git commit -m "Token scopes 04: sandbox UI dinámica + docs + rename Looker

- docs/sandbox: header muestra name/role/accountAlias; cards deshabilitadas por scope.deniedFeatures; overrides marcados con outline punteado
- OpenAPI: schema WhoAmI extendido (accountAlias, scope), respuestas 403 documentadas en endpoints protegidos
- README + FOLDER_CONTEXT: sección Tokens & Scopes con instrucciones de edición en Secret Manager
- Rename GCP Implementation/06-looker-studio-dashboards.md → 07-...; subfolder 06-token-scopes/ ocupa la fase 06
- Overview del folder GCP Implementation actualizado con la nueva tabla
"
```

---

## Pitfalls comunes

- **Olvidar `data-feature` en alguna card**: si un card no lo tiene, `applyScopeToUI` no lo deshabilita. Auditar visualmente con un token user y comprobar que `update-plan`/`mfa-reset` (y demás defaults denied) están bloqueadas.
- **El JS rompe en navegadores viejos**: la sandbox suele correr en Chrome reciente, pero si usás `??` o `optional chaining` y la sandbox tiene un build target diferente, fallará silente. `console.log` adentro para confirmar el bootstrap corre.
- **OpenAPI estático en disco**: revisar si el archivo se sirve desde `docs/openapi.yaml` o se construye dinámicamente. Si es estático, editar el archivo. Si es dinámico, ajustar el generator.
- **Rename de Looker sin actualizar enlaces internos**: el archivo `07-looker-studio-dashboards.md` puede tener links relativos a los archivos previos. Verificar con `grep -rn "06-looker\|05-deploy" "GCP Implementation/07-looker-studio-dashboards.md"`.
- **Sandbox cacheada**: si el navegador trae el JS viejo en cache, las cards no se deshabilitan. Hard-refresh (Cmd+Shift+R).

---

## Salida que debe ver la fase 05

- Sandbox HTML pinta scope dinámicamente.
- OpenAPI YAML documenta scope + accountAlias + 403.
- Docs actualizadas.
- Looker renombrado a `07-` y overview del folder padre apunta a la nueva estructura.
- Commit en main.

Si todo eso pasa, procede a [05-verification-and-rollout.md](./05-verification-and-rollout.md).

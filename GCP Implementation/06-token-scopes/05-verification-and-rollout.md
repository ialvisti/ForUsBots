# Fase 06.05 — Verificación end-to-end, deploy y rollout

**Duración estimada**: ~3 horas + 24h de monitoreo
**Requiere GCP**: Sí (deploy a la VM productiva)
**Reversible**: Sí (rollback de `TOKENS_JSON` + posible revert del MIG template anterior)

---

## Contexto (lee antes de empezar)

Lee primero [00-OVERVIEW.md](./00-OVERVIEW.md). Las fases 01-04 dejaron:
- `TOKENS_JSON` v2 en Secret Manager con shape nuevo.
- Código local con `requireScope`, `account` per-token, sandbox UI dinámica, docs actualizadas, Looker renombrado a `07-`.
- Tests locales pasando.
- Todo en commits separados en `main` (4 commits: fases 01, 02, 03, 04).

Esta fase **mueve el cambio a producción**:
1. Pre-deploy: lint + tests + smoke local con tokens reales.
2. Deploy automático via Cloud Build trigger (push a main ya pusheó si seguiste el flujo; si no, hacelo ahora).
3. Smoke E2E contra la VM productiva.
4. Monitoreo de 24h en Cloud Logging.
5. Cierre del grace period: quitar fallback de `process.env`, quitar SITE_USER/SITE_PASS/TOTP_SECRET del Secret Manager y `secrets.js`.
6. Commit final.

---

## Validación inicial (las fases 01-04 quedaron bien hechas)

```bash
cd "/Users/ivanalvis/Desktop/ForUsBots copy"
source .gcp-config.local

git status   # working tree limpio
git log --oneline -5 | grep -c "Token scopes 0[1-4]"
# Esperado: 4

# 1. Estructura del folder
test -d "GCP Implementation/06-token-scopes" && \
test -f "GCP Implementation/07-looker-studio-dashboards.md" && \
test ! -f "GCP Implementation/06-looker-studio-dashboards.md" && \
echo "Folder: OK"

# 2. Archivos críticos del repo
for f in src/auth/roles.js src/auth/featureMap.js src/auth/scopes.js src/auth/account.js \
         src/middleware/requireScope.js; do
  test -f "$f" || { echo "FALTA $f"; exit 1; }
done
echo "Código nuevo: OK"

# 3. Sin referencias residuales a SITE_USER/SITE_PASS/TOTP_SECRET fuera de account.js + secrets.js
LEAKS=$(grep -rn "SITE_USER\|SITE_PASS\|TOTP_SECRET" src/ | grep -v "src/auth/account.js" | grep -v "src/secrets.js" | grep -v "/\*\|//")
test -z "$LEAKS" && echo "No leaks: OK" || { echo "Hay referencias residuales:"; echo "$LEAKS"; exit 1; }

# 4. tokens.json local con shape nuevo
jq 'to_entries[] | select(.value.account == null)' tokens.json | head -1
# Esperado: vacío

# 5. Secret v2 en GCP
gcloud secrets versions access latest --secret=TOKENS_JSON --project=$PROJECT_ID | \
  jq 'to_entries | map(select(.value.account != null)) | length'
# Esperado: número total de tokens
```

Si algo falla → volver a la fase que corresponde antes de seguir.

---

## Tareas

### 1. Pre-deploy: lint + tests + smoke local

```bash
npm run lint && echo "Lint: OK"
npm test     && echo "Tests: OK"

# Smoke matrix (local) — para cada role esperamos un comportamiento específico:
TOKENS_FILE=/tmp/tokens.json timeout 120 npm start &
sleep 5

ADMIN_TOK=$(jq -r 'to_entries[] | select(.value.role=="admin") | .key' /tmp/tokens.json | head -1)
USER_TOK=$(jq -r  'to_entries[] | select(.value.role=="user")  | .key' /tmp/tokens.json | head -1)

# admin: pasa todo
curl -sS -o /dev/null -w "admin scrape-participant=%{http_code}\n" -X POST \
  http://localhost:10000/forusbot/scrape-participant \
  -H "x-auth-token: $ADMIN_TOK" -H "Content-Type: application/json" -d '{}'
# Esperado: 400 (payload inválido) — NO 403

# user: bloqueado en update-plan
curl -sS -o /dev/null -w "user update-plan=%{http_code}\n" -X POST \
  http://localhost:10000/forusbot/update-plan \
  -H "x-auth-token: $USER_TOK" -H "Content-Type: application/json" -d '{}'
# Esperado: 403

# whoami responses
curl -fsS http://localhost:10000/forusbot/whoami -H "x-auth-token: $ADMIN_TOK" | \
  jq '{ role, accountAlias, scope: .scope.deniedFeatures }'

kill %1 2>/dev/null
```

Si algo falla → fixear local antes de pushear.

### 2. Deploy via Cloud Build (commits ya en main → trigger automático)

Los 4 commits de fases 01-04 ya están en `main` si seguiste el flujo. El trigger `FUB-GitHub-Trigger` ([cloudbuild.yaml](../../cloudbuild.yaml)) auto-construye y hace rolling update del MIG.

Verificá:

```bash
# Ver builds recientes
gcloud builds list --project=$PROJECT_ID --limit=3 --format="value(id,status,createTime,substitutions.SHORT_SHA)"
# Esperado: el build correspondiente al último commit en SUCCESS

# Esperar rolling-update
gcloud compute instance-groups managed describe forusbots-mig --zone=$ZONE --project=$PROJECT_ID \
  --format="value(status.versionTarget.isReached)"
# Esperado: True (puede tardar 5-10 min)

# Confirmar el template apunta al SHA correcto
gcloud compute instance-groups managed describe forusbots-mig --zone=$ZONE --project=$PROJECT_ID \
  --format="value(versions[0].instanceTemplate)"
```

Si el trigger no disparó solo (a veces hay que aceptar permisos GitHub manualmente), forzar:

```bash
gcloud builds submit --config=cloudbuild.yaml --project=$PROJECT_ID
```

### 3. Smoke E2E contra la VM productiva

```bash
IP=$(gcloud compute addresses describe forusbots-ip --region=$REGION --project=$PROJECT_ID --format="value(address)")
# Tokens reales: leer de tokens-v1-backup local NO sirve (ya están en v2). Usar gcloud:
gcloud secrets versions access latest --secret=TOKENS_JSON --project=$PROJECT_ID > /tmp/prod-tokens.json

ADMIN_TOK=$(jq -r 'to_entries[] | select(.value.role=="admin") | .key' /tmp/prod-tokens.json | head -1)
USER_TOK=$(jq  -r 'to_entries[] | select(.value.role=="user")  | .key' /tmp/prod-tokens.json | head -1)

# 3a. health
curl -fsS http://$IP:10000/health
# Esperado: {"ok":true}

# 3b. whoami con admin
curl -fsS http://$IP:10000/forusbot/whoami -H "x-auth-token: $ADMIN_TOK" | jq
# Esperado: { ok, role:"admin", accountAlias:"...", scope:{ role:"admin", deniedFeatures:[], ... } }

# 3c. user en update-plan → 403
curl -sS -o /dev/null -w "%{http_code}\n" -X POST http://$IP:10000/forusbot/update-plan \
  -H "x-auth-token: $USER_TOK" -H "Content-Type: application/json" -d '{"plan":{}}'
# Esperado: 403

# 3d. admin encola scrape-participant exitoso
JOB=$(curl -sS -X POST http://$IP:10000/forusbot/scrape-participant \
  -H "x-auth-token: $ADMIN_TOK" -H "Content-Type: application/json" \
  -d '{"participantId":"158948","modules":[{"key":"census"}]}' | jq -r .jobId)
echo "JobID: $JOB"

# 3e. Polling
while :; do
  R=$(curl -sS http://$IP:10000/forusbot/jobs/$JOB -H "x-auth-token: $ADMIN_TOK")
  S=$(echo "$R" | jq -r .state)
  echo "State: $S"
  [[ "$S" == "succeeded" || "$S" == "failed" ]] && echo "$R" | jq && break
  sleep 3
done

# 3f. Verificar el accountAlias en Firestore (BigQuery view)
bq query --use_legacy_sql=false \
  "SELECT document_id, data.state, data.accountAlias FROM \`$PROJECT_ID.forusbots_analytics.jobs_raw_latest\` WHERE document_id='$JOB'"
# Esperado: 1 fila con accountAlias != NULL y SIN columna data.account.siteUser

# 3g. Cloud Logging muestra accountAlias en login.attempt
gcloud logging read \
  'resource.type="gce_instance" jsonPayload.type="login.attempt"' \
  --freshness=5m --limit=3 --format=json --project=$PROJECT_ID | \
  jq '.[] | {accountAlias: .jsonPayload.accountAlias, siteUser: .jsonPayload.siteUser, jobId: .jsonPayload.jobId}'
# Esperado: entries con accountAlias y siteUser enmascarado
```

### 4. Smoke: dos cuentas distintas en paralelo

Pre-requisito: al menos 2 tokens con `account.alias` distinto en `TOKENS_JSON`. Si todos tienen el mismo alias (porque la migración inicial los puso a todos en `legacy-shared`), antes de este smoke editar el secret para diferenciar al menos uno.

```bash
# Editar TOKENS_JSON: dar a 2 tokens diferentes account.alias
gcloud secrets versions access latest --secret=TOKENS_JSON --project=$PROJECT_ID > /tmp/prod-tokens.json
# Editar /tmp/prod-tokens.json: poner account.alias distintos a dos tokens
# Subir nueva versión
gcloud secrets versions add TOKENS_JSON --data-file=/tmp/prod-tokens.json --project=$PROJECT_ID
# Forzar restart para que la VM tome el nuevo secret
gcloud compute instance-groups managed rolling-action restart forusbots-mig \
  --zone=$ZONE --project=$PROJECT_ID
sleep 90

# Lanzar 2 jobs en paralelo con tokens distintos
TOK_A=$(jq -r 'to_entries[] | select(.value.account.alias=="alias-A") | .key' /tmp/prod-tokens.json | head -1)
TOK_B=$(jq -r 'to_entries[] | select(.value.account.alias=="alias-B") | .key' /tmp/prod-tokens.json | head -1)

curl -sS -X POST http://$IP:10000/forusbot/scrape-participant \
  -H "x-auth-token: $TOK_A" -H "Content-Type: application/json" \
  -d '{"participantId":"158948","modules":[{"key":"census"}]}' &
curl -sS -X POST http://$IP:10000/forusbot/scrape-participant \
  -H "x-auth-token: $TOK_B" -H "Content-Type: application/json" \
  -d '{"participantId":"158949","modules":[{"key":"census"}]}' &
wait

# En Cloud Logging deben aparecer 2 login.attempt con accountAlias distintos
# en una ventana de segundos (NO serializados)
gcloud logging read \
  'resource.type="gce_instance" jsonPayload.type="login.attempt"' \
  --freshness=2m --limit=10 --format=json --project=$PROJECT_ID | \
  jq '[.[] | { ts: .timestamp, alias: .jsonPayload.accountAlias }]'
# Esperado: 2 entries con aliases distintos, timestamps muy cercanos
```

### 5. Sandbox HTML productiva

```bash
# Abrir desde la VM (o local si tienes port-forward / reverse proxy)
open "http://$IP:10000/docs/sandbox/" 2>/dev/null || echo "abrir manual: http://$IP:10000/docs/sandbox/"
```

Validación visual:
- Token admin → todas las cards habilitadas; header muestra alias correcto.
- Token user → cards `update-plan` y `mfa-reset` deshabilitadas con badge; header muestra alias.

### 6. Monitoreo 24h

Durante 24h, mantener Cloud Logging filtrado. Métricas a observar:

```bash
# Errores en general
gcloud logging read 'severity>=ERROR resource.type="gce_instance"' \
  --freshness=24h --limit=50 --project=$PROJECT_ID --format="value(timestamp,jsonPayload.type,jsonPayload.error)"
# Esperado: 0 errores nuevos relacionados a "scope" o "account"

# 403 — esperables (los tokens user lo activarán); inesperados = bug
gcloud logging read \
  'resource.type="gce_instance" jsonPayload.status=403' \
  --freshness=24h --limit=20 --project=$PROJECT_ID --format=json | \
  jq '.[] | { ts: .timestamp, feature: .jsonPayload.feature, endpoint: .jsonPayload.endpoint, token_email: .jsonPayload.user.email }'
# Revisar manualmente: cada 403 debe corresponder a un token que efectivamente no debía acceder a ese endpoint.

# Tokens legacy en uso (siguen cargando account null)
gcloud logging read \
  'resource.type="gce_instance" jsonPayload.accountAlias="legacy-shared"' \
  --freshness=24h --limit=20 --project=$PROJECT_ID --format="value(timestamp,jsonPayload.jobId)"
# Esperado: 0 o muy pocos. Si hay muchos, hay tokens en producción todavía sin migrar.
```

### 7. Cierre del grace period (sólo si 24h sin issues)

Si después de 24h:
- 0 errores nuevos
- 0 jobs corriendo con `accountAlias: "legacy-shared"`
- Todos los 403 son legítimos (verificados manualmente)

→ Cerrar el grace period:

1. **Quitar fallback de `src/auth/account.js`**:
```js
// Antes:
function resolveAccount(tokenMeta) {
  const acc = tokenMeta?.account;
  if (acc && acc.siteUser && acc.sitePass && acc.totpSecret) { ... }
  return { ...FALLBACK };          // ← fallback
}
// Después:
function resolveAccount(tokenMeta) {
  const acc = tokenMeta?.account;
  if (!acc || !acc.siteUser || !acc.sitePass || !acc.totpSecret) {
    throw new Error("token has no valid account — migration incomplete");
  }
  return { alias: String(acc.alias || acc.siteUser), siteUser: acc.siteUser, sitePass: acc.sitePass, totpSecret: acc.totpSecret };
}
```
> Esto va a hacer fallar HARD cualquier request con un token legacy — por eso primero hay que confirmar 24h limpias.

2. **Quitar SITE_USER/SITE_PASS/TOTP_SECRET de `src/secrets.js`** (ya no se cargan a `process.env`).

3. **(Opcional, recomendado) Borrar los secretos en GCP**:
```bash
gcloud secrets versions list SITE_USER  --project=$PROJECT_ID
gcloud secrets versions list SITE_PASS  --project=$PROJECT_ID
gcloud secrets versions list TOTP_SECRET --project=$PROJECT_ID
# Para cada uno, destruir todas las versiones:
gcloud secrets delete SITE_USER  --project=$PROJECT_ID --quiet
gcloud secrets delete SITE_PASS  --project=$PROJECT_ID --quiet
gcloud secrets delete TOTP_SECRET --project=$PROJECT_ID --quiet
```
> Hacé esto ÚLTIMO. Una vez borrado, no hay vuelta atrás vía fallback — sólo via rollback del MIG template anterior.

4. **Commit final del grace period**:
```bash
git add src/auth/account.js src/secrets.js
git commit -m "Token scopes 05: cierre del grace period

- src/auth/account.js: quita fallback a process.env — exige account válido en el token
- src/secrets.js: ya no carga SITE_USER/SITE_PASS/TOTP_SECRET (no existen en Secret Manager)
- 24h en producción sin errores ni jobs con legacy-shared
- Secretos SITE_USER, SITE_PASS, TOTP_SECRET borrados de Secret Manager (gcloud secrets delete)
"
git push origin main
```

> El push dispara un nuevo build → MIG rolling update con el shape duro. Si por error algún token sigue sin `account`, el job va a fallar con `token has no valid account`. Plan B: rollback de TOKENS_JSON (versión anterior tiene los campos completos) o rollback del MIG (template del commit anterior, que aún tiene fallback).

### 8. Rollback path (referencia, sólo si algo se rompe)

Rollback rápido:
```bash
# Listar versiones de TOKENS_JSON
gcloud secrets versions list TOKENS_JSON --project=$PROJECT_ID --limit=5

# Restaurar versión anterior (ej. la 1)
gcloud secrets versions access 1 --secret=TOKENS_JSON --project=$PROJECT_ID > /tmp/rollback.json
gcloud secrets versions add TOKENS_JSON --data-file=/tmp/rollback.json --project=$PROJECT_ID

# Restart MIG para tomar la nueva versión del secret
gcloud compute instance-groups managed rolling-action restart forusbots-mig \
  --zone=$ZONE --project=$PROJECT_ID
```

Rollback de código (si el grace period ya cerró y hay que volver al fallback):
```bash
# Identificar el commit anterior al cierre
git log --oneline -10

# Crear un revert commit (no force-push)
git revert <SHA del commit "cierre del grace period">
git push origin main
# El trigger hace rolling update con el código previo
```

---

## Verificación final (criterios de cierre de la fase 06 completa)

```bash
# 1. VM corre código con scopes
curl -fsS http://$IP:10000/forusbot/whoami -H "x-auth-token: $ADMIN_TOK" | jq -e '.scope and .accountAlias' && echo "VM con scopes: OK"

# 2. 4 commits + commit del grace period en main
git log --oneline | grep -c "Token scopes 0"   # Esperado: 5

# 3. Sandbox prod refleja scope
# (verificación visual; documentar screenshot en el commit final si quieres)

# 4. BigQuery jobs traen accountAlias
bq query --use_legacy_sql=false \
  "SELECT data.accountAlias, COUNT(*) FROM \`$PROJECT_ID.forusbots_analytics.jobs_raw_latest\` \
   WHERE event_timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR) \
   GROUP BY data.accountAlias"
# Esperado: tabla con varios alias (no sólo "legacy-shared")

# 5. Secretos SITE_USER/SITE_PASS/TOTP_SECRET ya no existen en GCP
gcloud secrets list --project=$PROJECT_ID --format="value(name)" | grep -E "^(SITE_USER|SITE_PASS|TOTP_SECRET)$"
# Esperado: vacío (post grace period)

# 6. Looker (fase 07) tiene su archivo listo para arrancar
test -f "GCP Implementation/07-looker-studio-dashboards.md" && echo "Fase 07: lista para comenzar"
```

Si todo eso pasa, la fase 06 está cerrada. Procede a [07-looker-studio-dashboards.md](../07-looker-studio-dashboards.md).

---

## Pitfalls comunes

- **Push sin verificar lint local**: el trigger construye, pero si lint falla puede caer durante el build. Siempre `npm run lint` antes de push.
- **Cerrar el grace period sin esperar 24h**: si un token productivo todavía está en shape legacy, va a fallar con error duro. SIEMPRE confirmar el log filter `accountAlias="legacy-shared"` está en 0 durante las 24h.
- **Borrar SITE_USER/SITE_PASS/TOTP_SECRET secrets antes de cerrar el grace period en código**: si el código todavía cae al fallback de `process.env` y los secretos no existen, todos los jobs van a fallar el login. Orden: primero código (commit del grace period), luego deploy, luego confirmar OK, luego borrar secretos.
- **Cache de TOKENS_JSON en la VM**: el código lee `/tmp/tokens.json` una vez al boot (vía `secrets.js`). Cambios en TOKENS_JSON requieren restart del MIG (`gcloud compute instance-groups managed rolling-action restart`). Si quieres hot-reload, eso es una mejora futura.
- **403 vs 401**: `401 unauthenticated` = no hay token o token inválido. `403 forbidden` = token válido pero scope no permite. Si ves 401 inesperado, el token no está cargando — revisar el secreto. Si ves 403 inesperado, el scope está mal calculado — revisar `roles.js`/`featureMap.js`.
- **Costos de logging**: el filtro de `accountAlias` puede generar muchas líneas. Si se vuelve caro, agregar `severity>=INFO` y subir el level del log `login.attempt` a INFO (no DEBUG).

---

## Salida (cierre de la fase 06)

- Sistema de token scopes en producción, estable 24h+.
- Cada token usa su propia cuenta ForUsAll.
- Sandbox refleja scope dinámicamente.
- Docs y OpenAPI actualizados.
- Grace period cerrado (sin fallback).
- Looker (`07-`) ya puede arrancar.

Procede a [GCP Implementation/07-looker-studio-dashboards.md](../07-looker-studio-dashboards.md).

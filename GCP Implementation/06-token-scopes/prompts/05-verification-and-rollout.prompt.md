# Prompt — Fase 06.05 (Verificación E2E + deploy + rollout + cierre del grace period)

> **Cómo usar**: copiá TODO lo que está debajo de la línea horizontal (incluida) y pegalo como primer mensaje en un **chat nuevo** de Claude Code dentro de `/Users/ivanalvis/Desktop/ForUsBots copy`.
>
> ⚠️ Esta fase **modifica producción** y tiene un paso (cierre del grace period) que sólo se ejecuta **después de 24h de monitoreo**. Es esperable que el chat se divida en 2 sesiones: una hoy (deploy + smoke) y otra al día siguiente (monitoreo + cierre).

---

Estás dentro del repositorio ForUsBots en `/Users/ivanalvis/Desktop/ForUsBots copy`. Ya estoy autenticado en `gcloud` CLI (proyecto `forusbots`). El proyecto productivo es:

- VM productiva: `forusbots-qg7j` en `us-central1-a`, IP estática `35.224.156.104`, puerto `10000`.
- Cloud Build trigger: `FUB-GitHub-Trigger` (auto-deploy en push a `main` via `cloudbuild.yaml`).
- Secreto de tokens: `TOKENS_JSON` en Secret Manager.

Tu misión es ejecutar **únicamente la Fase 06.05 — Verificación E2E, deploy y rollout** del plan de Token Scopes. El plan vive en este sub-folder:

- `GCP Implementation/06-token-scopes/00-OVERVIEW.md` (contexto general)
- `GCP Implementation/06-token-scopes/05-verification-and-rollout.md` ← **este es el playbook que vas a ejecutar paso a paso**

## Antes de empezar

1. Si no lo hiciste, leé `GCP Implementation/06-token-scopes/00-OVERVIEW.md`.
2. Leé completo `GCP Implementation/06-token-scopes/05-verification-and-rollout.md`. Ese archivo es tu fuente de verdad.
3. Corré la "Validación inicial" del `.md`. Debe verificar que **las 4 fases anteriores (01-04) están commiteadas en main**, que `06-token-scopes/` existe y que `07-looker-studio-dashboards.md` está renombrado. Si algo falla, **NO sigas**.

## Plan de ejecución sugerido (2 sesiones)

### Sesión 1 — hoy (tareas 1-5 del `.md`)

1. **Pre-deploy local**: `npm run lint`, `npm test`, smoke local con tokens admin/user.
2. **Push a main** si todavía no se hizo (los 4 commits de fases 01-04 deben estar en `origin/main`). El trigger `FUB-GitHub-Trigger` corre solo. Si no, ejecutá `gcloud builds submit --config=cloudbuild.yaml --project=forusbots` manual.
3. **Esperar rolling update** del MIG (`gcloud compute instance-groups managed describe forusbots-mig --zone=us-central1-a --format="value(status.versionTarget.isReached)"` → True).
4. **Smoke E2E contra la VM productiva** con tokens reales (extraídos del secreto). Tabla completa en el `.md`. Verificá: health, whoami con admin, user 403 en update-plan, admin encola y termina un scrape-participant exitoso, accountAlias en BigQuery, login.attempt en Cloud Logging.
5. **Smoke con 2 cuentas en paralelo**: editar el secreto `TOKENS_JSON` para tener 2 tokens con aliases distintos (ej. `alias-A` y `alias-B`), restart del MIG, lanzar 2 jobs concurrentes, confirmar en Cloud Logging que los 2 logins corrieron en paralelo con aliases distintos.
6. Sandbox HTML productiva: validar visualmente que el scope se refleja para token admin vs user.

Al terminar la Sesión 1 reportame:
- Status del rolling update.
- Tabla de status codes de los smokes E2E.
- Confirmación de paralelismo de aliases.
- Cualquier 403 inesperado.

### Sesión 2 — al día siguiente (tareas 6-7 del `.md`)

7. **Monitoreo 24h**: filtros de Cloud Logging del `.md` (errores severos, 403, jobs con `legacy-shared`). Si alguno tiene picos, **NO cerrar el grace period** — reportame y diagnosticamos.
8. **Si 24h limpias** → cierre del grace period:
   - quitar fallback de `src/auth/account.js` (tirar excepción si no hay account),
   - quitar carga de `SITE_USER`/`SITE_PASS`/`TOTP_SECRET` en `src/secrets.js`,
   - **commit y push** (dispara deploy automático),
   - confirmar VM corriendo el nuevo código,
   - **borrar los secretos** `SITE_USER`, `SITE_PASS`, `TOTP_SECRET` de Secret Manager (último paso, irreversible).

## Reglas duras

- **NO cerrar el grace period sin 24h de monitoreo limpio**. Si todavía aparecen jobs con `accountAlias="legacy-shared"`, hay un token productivo sin migrar — frená, identificá el token y migralo antes de cerrar el grace period.
- **NO borrar los secretos `SITE_USER`/`SITE_PASS`/`TOTP_SECRET` antes de pushear el código del grace period y confirmar que la VM lo está corriendo**. Orden estricto: código → deploy → confirmación → borrado de secretos.
- **NO `force push` jamás**. Si necesitás revertir, usá `git revert` (commit nuevo). Si necesitás rollback del secret, `gcloud secrets versions add` con la versión anterior — NO `destroy` de versiones.
- **NO toques el código que no es de esta fase**. Esta fase sólo modifica `src/auth/account.js` y `src/secrets.js` al final, y crea un commit. No es momento de refactor opportunístico.
- **Tokens reales en stdout**: el `.md` extrae tokens del secreto para hacer smoke. NO pegues esos tokens en ningún chat ni log persistente — son creds vivas.
- **Smoke E2E contra prod usa la cuenta ForUsAll real**. Cada job que encolás se loguea de verdad al portal. Encolá lo mínimo necesario (1 scrape-participant exitoso es suficiente para validar el happy path). Evitá encolar `update-*` salvo que sea estrictamente necesario.
- **Si una verificación falla**: parar, diagnosticar, reportar. Plan B documentado en el `.md`: rollback de TOKENS_JSON (`gcloud secrets versions add` con la versión anterior) + restart del MIG, o `git revert` del último commit.

## Qué reportarme al final

### Después de la Sesión 1
1. Output completo de los smokes 3a-3g del `.md`.
2. Resultado del paralelismo (timestamps de los 2 `login.attempt`).
3. Status final del MIG (`isReached: True`).
4. Cualquier desviación del esperado, con diagnóstico.

### Después de la Sesión 2
5. Conteo de errores y 403s inesperados durante las 24h.
6. Conteo de jobs con `legacy-shared` durante las 24h (esperado: 0 al final).
7. Confirmación de cada paso del cierre del grace period (commit hash, deploy OK, secretos borrados).
8. Verificación final completa (sección "Verificación final (criterios de cierre de la fase 06 completa)" del `.md`).
9. URL del PR o referencia al commit final.

## Plan B (si algo se rompe en producción)

El `.md` documenta el rollback. Resumen rápido:

```bash
# Rollback del secret (versión anterior queda como rollback)
gcloud secrets versions list TOKENS_JSON --project=forusbots
gcloud secrets versions access <N-1> --secret=TOKENS_JSON --project=forusbots > /tmp/rollback.json
gcloud secrets versions add TOKENS_JSON --data-file=/tmp/rollback.json --project=forusbots
gcloud compute instance-groups managed rolling-action restart forusbots-mig --zone=us-central1-a --project=forusbots

# Rollback del código (si el cierre del grace period rompió la prod)
git log --oneline -10
git revert <SHA del commit "cierre del grace period">
git push origin main   # el trigger redepliega automáticamente
```

NUNCA force push a main. Siempre `revert` (commit nuevo).

Arrancá leyendo los `.md` y la "Validación inicial". Esperá mi visto bueno antes de cerrar el grace period (paso 8 de la Sesión 2).

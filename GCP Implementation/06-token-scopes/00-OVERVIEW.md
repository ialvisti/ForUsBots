# Fase 06 — Token Scopes & per-token ForUsAll accounts — Overview

Sub-folder de `GCP Implementation/`. Esta fase se ejecuta **después** de la fase 05 (deploy a GCP) y **antes** de `07-looker-studio-dashboards.md` (renombrado desde el antiguo `06-looker-studio-dashboards.md` por la sub-fase 04).

## Problema

Hoy todo ForUsBots se autentica al portal ForUsAll con una **única** cuenta:
- `SITE_USER`, `SITE_PASS`, `TOTP_SECRET` son singletons globales cargados una vez por [src/secrets.js:6-42](../../src/secrets.js#L6-L42) y re-exportados como constantes en [src/config.js:12-34](../../src/config.js#L12-L34).
- Todos los `runFlow.js` consumen esas constantes directamente.
- El login al portal se hace en [src/engine/auth/loginOtp.js:134-135](../../src/engine/auth/loginOtp.js#L134-L135) con TOTP via `speakeasy`.
- El mutex de login concurrente está en [src/engine/loginLock.js:41-75](../../src/engine/loginLock.js#L41-L75), keyado por `SITE_USER` global.

Consecuencias:
1. **Cuenta única**: si se bloquea la cuenta o cambian la password, se cae todo. No hay forma de atribuir actividad en el portal a un equipo específico.
2. **Sin autorización fina por endpoint**: los 12 tokens en `tokens.json` traen `role` (`admin`, `user`, `pa_lead`, `rm_lead`, `ops_lead`, `imp_lead`) pero el role **no** se usa para autorizar. Sólo existe `requireAdmin` ([src/middleware/auth.js:125](../../src/middleware/auth.js#L125)) y un `restrictToEmails` ad-hoc en update-plan ([src/middleware/restrictToEmails.js](../../src/middleware/restrictToEmails.js)).

## Objetivo

Cada token va a llevar:
1. **Credenciales ForUsAll inline**: `siteUser`, `sitePass`, `totpSecret` — el bot las usa al hacer login en lugar de los globals.
2. **Scope híbrido**:
   - `roles.js` define `defaultDeniedFeatures` por role (catálogo central).
   - Cada token puede agregar `deniedFeatures` extra.
   - Cada token puede agregar `deniedEndpoints` / `allowedEndpoints` para overrides por endpoint exacto.
   - El middleware `requireScope(featureKey)` corta requests no autorizadas con `403`.

Todo viaja dentro del secreto GCP `TOKENS_JSON` (no se introducen secretos separados ni Firestore).

## Decisiones tomadas (no replantear)

1. **Modelo authz**: híbrido (role → default denied; token → override).
2. **Storage credenciales**: inline dentro de `TOKENS_JSON` (un solo lugar, fácil de editar).
3. **Granularidad**: `deniedFeatures` (general) + `deniedEndpoints` / `allowedEndpoints` (excepciones).
4. **Estructura**: este sub-folder. Looker pasa a `07-` (lo renombra la fase 04).

## Arquitectura final

```
┌─────────────────────────────┐
│   POST /forusbot/<...>      │
│   x-auth-token: <TOKEN>     │
└──────────────┬──────────────┘
               │
               ▼
   ┌───────────────────────┐
   │   requireUser         │  ← src/middleware/auth.js
   │   - busca token       │
   │   - resuelve scope    │  ← src/auth/scopes.js (nuevo)
   │   - resuelve account  │
   │   - adjunta req.auth  │
   └──────────┬────────────┘
              │
              ▼
   ┌───────────────────────┐
   │  requireScope(feat)   │  ← src/middleware/requireScope.js (nuevo)
   │  - 403 si bloqueado   │
   └──────────┬────────────┘
              │
              ▼
   ┌───────────────────────┐
   │  controller → queue   │  ← src/engine/queue.js
   │  jobCtx incluye:      │
   │    account: {...}     │
   └──────────┬────────────┘
              │
              ▼
   ┌───────────────────────┐
   │  runFlow              │  ← src/bots/*/runFlow.js
   │  loginOtp(account)    │  ← src/engine/auth/loginOtp.js
   │  loginLock keyed by   │  ← src/engine/loginLock.js
   │     account.alias     │
   └───────────────────────┘
```

## Orden de fases (cada archivo = 1 chat independiente)

| # | Archivo | Duración | Reversible | Requiere GCP |
|---|---------|----------|------------|--------------|
| 1 | [01-schema-and-storage.md](./01-schema-and-storage.md) | ~3h | Sí (git revert) | Para subir TOKENS_JSON v2 |
| 2 | [02-auth-middleware-and-scopes.md](./02-auth-middleware-and-scopes.md) | ~4h | Sí (git revert) | No (local) |
| 3 | [03-per-token-credentials.md](./03-per-token-credentials.md) | ~6h | Sí (git revert) | No (local) |
| 4 | [04-sandbox-and-docs.md](./04-sandbox-and-docs.md) | ~3h | Sí (git revert) | No (local) |
| 5 | [05-verification-and-rollout.md](./05-verification-and-rollout.md) | ~3h + 24h monitoreo | Sí (rollback de TOKENS_JSON) | Sí |

**Total**: ~19h de trabajo focused + 24h de monitoreo en paralelo.

## Reglas de oro

1. **Cada `.md` empieza con un bloque de "Validación inicial"** que verifica que la fase anterior cerró bien. Si falla, parar y arreglar la fase previa antes de continuar.
2. **Cada fase = 1 commit** (o un PR). No commitear hasta que la verificación final pase.
3. **Back-compat durante grace period**: las fases 02 y 03 deben tolerar tokens "legacy" sin `account` o sin `scope`. Fallback explícito: `scope = all-allowed`, `account = creds de .env` (si existen). Se elimina el fallback en un commit posterior cuando todos los tokens estén migrados (verificable con un grep).
4. **Las credenciales NUNCA en logs ni en respuestas HTTP**. `whoami` devuelve `accountAlias` (o `siteUser` enmascarado) pero NUNCA `sitePass` ni `totpSecret`. Mismo en `jobs` persistidos en Firestore.
5. **`tokens.json` local del repo es dev-only con creds dummy**. En producción sólo vive en el secreto GCP `TOKENS_JSON`. Verificar `.gitignore` y agregar comentario en el archivo.
6. **Si algo rompe en producción**, restaurar la versión anterior de `TOKENS_JSON` con `gcloud secrets versions list/access`. El código nuevo debe tolerar el shape viejo durante el grace period.

## Salida que debe ver la fase 07 (Looker Studio)

- MIG corriendo con la imagen que incluye el sistema de scopes.
- `TOKENS_JSON` en Secret Manager con los 12 tokens migrados al shape nuevo.
- 0 errores 403 inesperados en Cloud Logging durante las últimas 24h.
- Sandbox HTML reflejando scope dinámicamente.
- Test E2E pasando para al menos 3 roles distintos (admin, user, custom-deny).

Si todo eso pasa, procede a `07-looker-studio-dashboards.md`.

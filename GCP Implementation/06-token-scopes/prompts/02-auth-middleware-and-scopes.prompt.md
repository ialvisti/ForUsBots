# Prompt — Fase 06.02 (Auth middleware con scopes)

> **Cómo usar**: copiá TODO lo que está debajo de la línea horizontal (incluida) y pegalo como primer mensaje en un **chat nuevo** de Claude Code dentro de `/Users/ivanalvis/Desktop/ForUsBots copy`.

---

Estás dentro del repositorio ForUsBots en `/Users/ivanalvis/Desktop/ForUsBots copy`. Ya estoy autenticado en `gcloud` CLI (proyecto `forusbots`).

Tu misión es ejecutar **únicamente la Fase 06.02 — Auth middleware con scopes (`requireScope`)** del plan de Token Scopes. El plan vive en este sub-folder:

- `GCP Implementation/06-token-scopes/00-OVERVIEW.md` (contexto general)
- `GCP Implementation/06-token-scopes/02-auth-middleware-and-scopes.md` ← **este es el playbook que vas a ejecutar paso a paso**

## Antes de empezar

1. Si todavía no leíste el overview, leé `GCP Implementation/06-token-scopes/00-OVERVIEW.md` para entender el feature completo.
2. Leé completo `GCP Implementation/06-token-scopes/02-auth-middleware-and-scopes.md`. Ese archivo es tu fuente de verdad.
3. Corré la "Validación inicial" del `.md`. Verifica que la **Fase 01 está commiteada** (commit con mensaje "Token scopes 01: ...") y que `src/auth/roles.js` y `src/auth/featureMap.js` existen y cargan. Si algo falla, **NO sigas**: reportame qué falló.

## Qué tenés que hacer (resumen — el detalle real está en el .md)

1. Crear `src/auth/scopes.js` (pure functions: `resolveScope`, `isAllowed`, `resolveEndpoint`, `scopeToJSON`).
2. Crear `src/middleware/requireScope.js` (factory que corta 403 con `{ ok, error, feature, endpoint, reason }`).
3. Modificar `src/middleware/auth.js` para adjuntar `req.auth.scope` y `req.auth.tokenMeta` (el tokenMeta raw es uso interno; NO serializarlo entero al cliente).
4. Montar `requireScope(featureKey)` en los 8 routers de bots (`src/bots/*/routes.js`) — la tabla exacta de featureKeys está en el `.md`.
5. Montar `requireScope(...)` en cada endpoint protegido de `src/routes/index.js` (jobs, admin-*, articles-*, settings, etc.). Mantener `requireAdmin` y `requireUser` **además** del `requireScope` (defensa en profundidad).
6. Extender `/forusbot/auth/whoami` en `src/server.js` para devolver `scope` (via `scopeToJSON`) y `accountAlias`. **NO devolver nunca** `siteUser`/`sitePass`/`totpSecret`.
7. Agregar tests unitarios para `src/auth/scopes.js` (admin pasa todo, user bloqueado en `update-plan`, override con `allowedEndpoints`, deniedEndpoints, token legacy = user). Si el repo no tiene jest, seguí la convención de `scripts/` para validación.
8. Correr la verificación final completa del `.md` (lint + tests + smoke local con tokens admin/user).
9. Si todo pasa, commit con el mensaje indicado.

## Reglas duras

- **Una fase = un commit**. No hagas commit hasta que la verificación final pase entera.
- **NO toques runFlows ni credenciales del portal**. Esa es la Fase 03. Si tu cambio toca `src/engine/auth/loginOtp.js`, `src/engine/loginLock.js`, `src/engine/queue.js` (más allá de leer el contrato actual), o el carga de `SITE_USER`/`SITE_PASS`/`TOTP_SECRET`, estás fuera de scope.
- **Back-compat (grace period)**: `resolveScope({})` debe devolver fallback a `user` sin romper. Tokens legacy sin `scope` no deben tirar 500.
- **NO quitar `requireAdmin` ni `restrictToEmails` existentes**. Sumar `requireScope` al lado. `restrictToEmails` en `update-plan` se queda donde está, NO lo migres en esta fase.
- **OPEN_ENDPOINTS no se montan con `requireScope`**. Son endpoints sin auth (health, articles read, admin/login...) y no tienen feature. Sólo `requireScope` se monta DESPUÉS de `requireUser` o `requireAdmin`.
- **`req.route.path` vs `req.path`**: para hacer matching del pattern (`/jobs/:id` vs `/jobs/abc-123`), usá `req.baseUrl + req.route.path`. NO uses `req.path` directamente.
- **El secreto `TOKENS_JSON` no se toca en esta fase**. Si necesitás un token de un role específico para smoke test, leelo del archivo local `/tmp/tokens.json` (que ya está poblado por la Fase 01).

## Qué reportarme al final

1. Lista de archivos creados/modificados (esperado: ~12-15 archivos entre nuevos y editados).
2. Output del smoke test del `.md` (admin pasa, user 403 en update-plan, override allowedEndpoints re-habilita).
3. Output de `npm test` y `npm run lint`.
4. Hash del commit creado y su mensaje.
5. Si encontraste que algún endpoint del repo no está en `featureMap.js` (Fase 01) y debería estar, listalo — lo decidimos en la próxima iteración.

Si en el smoke test ves errores 401 cuando esperabas 200 o 403, **frená y diagnosticá** antes de seguir. Lo más probable: `req.auth.scope` no se está adjuntando porque `auth.js` está cargando un shape de `tokenMeta` distinto del esperado.

Arrancá leyendo los `.md` mencionados y la "Validación inicial".

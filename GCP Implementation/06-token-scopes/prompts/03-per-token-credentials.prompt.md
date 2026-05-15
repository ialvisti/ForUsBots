# Prompt — Fase 06.03 (Credenciales ForUsAll per-token)

> **Cómo usar**: copiá TODO lo que está debajo de la línea horizontal (incluida) y pegalo como primer mensaje en un **chat nuevo** de Claude Code dentro de `/Users/ivanalvis/Desktop/ForUsBots copy`.

---

Estás dentro del repositorio ForUsBots en `/Users/ivanalvis/Desktop/ForUsBots copy`. Ya estoy autenticado en `gcloud` CLI (proyecto `forusbots`).

Tu misión es ejecutar **únicamente la Fase 06.03 — Credenciales ForUsAll per-token** del plan de Token Scopes. **Esta es la fase más invasiva del plan**: toca el engine, los 8 controllers, los 8 runFlows y la carga de credenciales global. Tomá tu tiempo y respetá el back-compat.

El plan vive en este sub-folder:

- `GCP Implementation/06-token-scopes/00-OVERVIEW.md` (contexto general)
- `GCP Implementation/06-token-scopes/03-per-token-credentials.md` ← **este es el playbook que vas a ejecutar paso a paso**

## Antes de empezar

1. Si no lo hiciste, leé `GCP Implementation/06-token-scopes/00-OVERVIEW.md`.
2. Leé completo `GCP Implementation/06-token-scopes/03-per-token-credentials.md`. Ese archivo es tu fuente de verdad.
3. Corré la "Validación inicial" del `.md`. Verifica que **Fases 01 y 02 estén commiteadas** y que el smoke local de Fase 02 todavía funciona. Si algo falla, **NO sigas**.
4. Antes de tocar código, hacé un grep de control: `grep -rn "SITE_USER\|SITE_PASS\|TOTP_SECRET" src/ | grep -v node_modules`. Anotá los hits — al final de la fase ese grep debe devolver únicamente `src/auth/account.js` (fallback) y `src/secrets.js` (loader env).

## Qué tenés que hacer (resumen — el detalle real está en el .md)

1. Crear `src/auth/account.js` con `resolveAccount(tokenMeta)` y `publicView(account)` + helper `maskEmail`. Fallback a `process.env.SITE_USER`/`SITE_PASS`/`TOTP_SECRET` (no a `config.SITE_*`).
2. Modificar `src/middleware/auth.js` para adjuntar `req.auth.account = resolveAccount(tokenMeta)`.
3. Refactor `src/engine/queue.js` (`submit(...)`):
   - aceptar parámetro `account`,
   - propagarlo a `jobCtx`,
   - persistir SOLO `accountAlias` en Firestore (NUNCA siteUser/sitePass/totpSecret).
4. Refactor `src/engine/auth/loginOtp.js`:
   - cambiar firma a `login(page, account, opts)`,
   - validar que `account` tenga los 3 campos (siteUser/sitePass/totpSecret),
   - `speakeasy.totp({ secret: account.totpSecret, ... })`,
   - quitar el `require("../../config")` de SITE_USER/SITE_PASS/TOTP_SECRET de este archivo.
5. Refactor `src/engine/loginLock.js`:
   - mutex per-alias (Map) en lugar de mutex global,
   - `acquire(alias)` valida que alias venga.
6. Actualizar los **8 controllers** para pasar `account: req.auth.account` a `queue.submit({...})`. Lista en el `.md`.
7. Actualizar los **8 runFlows** para leer `account` de `jobCtx` y pasárselo a `loginOtp` y `loginLock.acquire`. Lista en el `.md`.
8. Editar `src/config.js`: quitar `SITE_USER`, `SITE_PASS`, `TOTP_SECRET` del export (opción A del `.md`). Verificar con grep que no quedan consumidores.
9. Logging: en `src/engine/auth/loginOtp.js`, el log estructurado de `login.attempt` debe incluir `accountAlias` y `siteUser` enmascarado, NUNCA password/totpSecret.
10. Agregar tests `tests/auth/account.test.js` y `tests/engine/loginLock.test.js` siguiendo la convención del repo.
11. Correr la verificación final del `.md` (lint, tests, grep de no leaks, smoke local con 2 aliases).
12. Si todo pasa, commit con el mensaje indicado.

## Reglas duras

- **Una fase = un commit**.
- **No filtres credenciales en ningún log ni response HTTP**. Si vas a hacer `console.log(account)` para debug, usá `publicView(account)` y borrá el log antes de commitear.
- **No persistir creds en Firestore/BQ**. Solo `accountAlias`. Si el `jobCtx.meta` incluye `account` completo, sanitizar antes de guardar.
- **Mantener back-compat**: `resolveAccount(tokenMeta)` con token legacy debe caer a `process.env.*`. NO tirar excepción todavía — eso lo hace la Fase 05 (cierre del grace period).
- **NO borres los secretos `SITE_USER`/`SITE_PASS`/`TOTP_SECRET` de Secret Manager en GCP**. Sigue siendo el fallback del `.env` de la VM hasta Fase 05.
- **Mutex per-alias**: dos jobs del mismo `account.alias` se serializan (eso protege el TOTP window). Dos jobs de aliases distintos corren en paralelo. Si querés un tope global (semaphore N=3 sobre el portal), agregalo SÓLO si el `.md` lo pide o ya hay un comportamiento previo a preservar.
- **El smoke local de "2 aliases en paralelo"**: por defecto los 12 tokens tienen el mismo alias `legacy-shared`. Para verlo, editá `/tmp/tokens.json` localmente con 2 aliases distintos antes del smoke (no toques el secret en GCP en esta fase).
- **Si la firma de `runFlow` ya viene de fase 04 GCP** (la migración a Firestore), verificá el contrato real antes de editar — no asumas.

## Qué reportarme al final

1. Lista de archivos modificados (esperado: ~20 archivos entre engine, controllers, runFlows, config, auth).
2. Output del grep `grep -rn "SITE_USER\|SITE_PASS\|TOTP_SECRET" src/` — debe quedar SÓLO `src/auth/account.js` y `src/secrets.js`.
3. Output del smoke test con 2 aliases en paralelo (mostrá las 2 entradas de `login.attempt` con `accountAlias` distintos).
4. Output de `npm test` y `npm run lint`.
5. Confirmación de que ningún `jobsCol().doc()` persiste credenciales (verificalo leyendo el código de `queue.js`, o haciendo un job de prueba y mirando el doc en Firestore).
6. Hash del commit y mensaje.

Si encontrás algo raro en el flow de `queue.js` o `loginLock.js` que no matchea con el `.md` (porque el código real evolucionó), **frená y reportame** antes de improvisar. Es la fase más sensible.

Arrancá leyendo los `.md` y la "Validación inicial".

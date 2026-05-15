# Prompt — Fase 06.01 (Schema de tokens + roles + storage)

> **Cómo usar**: copiá TODO lo que está debajo de la línea horizontal (incluida) y pegalo como primer mensaje en un **chat nuevo** de Claude Code dentro de `/Users/ivanalvis/Desktop/ForUsBots copy`.

---

Estás dentro del repositorio ForUsBots en `/Users/ivanalvis/Desktop/ForUsBots copy`. Ya estoy autenticado en `gcloud` CLI (proyecto `forusbots`). El working tree debe estar limpio antes de empezar.

Tu misión es ejecutar **únicamente la Fase 06.01 — Schema de tokens + catálogo de roles + storage** del plan de Token Scopes. El plan vive en este sub-folder:

- `GCP Implementation/06-token-scopes/00-OVERVIEW.md` (contexto general)
- `GCP Implementation/06-token-scopes/01-schema-and-storage.md` ← **este es el playbook que vas a ejecutar paso a paso**

## Antes de empezar

1. Leé completo `GCP Implementation/06-token-scopes/00-OVERVIEW.md` para entender el feature.
2. Leé completo `GCP Implementation/06-token-scopes/01-schema-and-storage.md`. Ese archivo es tu fuente de verdad: tareas, comandos, archivos a crear/modificar y verificación final.
3. Corré la "Validación inicial" del `.md`. Si algo falla, **NO sigas**: reportame qué falló y esperá indicaciones.

## Qué tenés que hacer (resumen — el detalle real está en el .md)

1. Crear `src/auth/roles.js` con el catálogo de 6 roles y sus `defaultDeniedFeatures`.
2. Crear `src/auth/featureMap.js` con `FEATURE_KEYS`, `ENDPOINT_TO_FEATURE` y `OPEN_ENDPOINTS`.
3. Migrar `tokens.json` local del repo al shape nuevo (con `account: { alias, siteUser, sitePass, totpSecret }` dummy + arrays de scope vacíos). Es dev-only, usar valores placeholder.
4. Hacer la migración del secreto `TOKENS_JSON` en Secret Manager — tomar la versión actual, agregar los campos nuevos a cada entrada (todos arrancan con un alias compartido `legacy-shared` que apunta a las creds del `.env` actual), subir como nueva versión.
5. Agregar la validación de shape liviana en `src/secrets.js` (loguea cuántos tokens están en shape legacy, sin romper).
6. Correr la verificación final completa del `.md`.
7. Si todo pasa, hacé el commit indicado al final del `.md`.

## Reglas duras

- **Una fase = un commit**. No hagas commit hasta que la verificación final pase entera. No mezcles cambios fuera de scope.
- **NO toques middleware, controllers ni runFlows**. Esta fase sólo agrega data + catálogos. Si tocás `src/middleware/auth.js`, `src/middleware/requireScope.js`, `src/engine/**` o `src/bots/*/runFlow.js`, estás fuera de scope.
- **NO commitees credenciales reales** en `tokens.json` del repo (es público en GitHub). Usar siempre dummies (`DEV_SITE_USER`, etc.). Las creds reales sólo van al secreto `TOKENS_JSON` en GCP.
- **Antes de subir el secreto a GCP, validá el JSON** con `jq .` para asegurar que parsea.
- **Guardá un backup local de la versión actual del secreto** antes de subir la nueva (la "Validación inicial" del `.md` ya lo pide).
- **NO borres versiones viejas del secreto**. Quedan como rollback.
- **El script `scripts/migrate-tokens-v2.mjs` es efímero**. Borralo del repo después de usarlo (no entra al commit).
- **No inventes features ni roles** que no estén en el `.md`. Si dudás, preguntame.

## Qué reportarme al final

1. Lista de archivos creados/modificados.
2. Output de la verificación final del `.md` (cada uno de los checks 1-8).
3. Hash del commit creado y su mensaje.
4. Versión del secreto `TOKENS_JSON` recién subida (`gcloud secrets versions list TOKENS_JSON --project=forusbots`).
5. Si tuviste que desviarte del `.md` por algo, contámelo explícitamente con el motivo.

Si llegás a un punto donde no estás seguro de cómo proceder (ej. el shape actual de `tokens.json` en GCP tiene campos extra no listados en el `.md`), **frená y preguntame** en lugar de improvisar.

Arrancá leyendo los dos `.md` mencionados y la "Validación inicial".

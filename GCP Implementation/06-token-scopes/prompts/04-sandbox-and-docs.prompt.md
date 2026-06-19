# Prompt — Fase 06.04 (Sandbox UI dinámica + docs + rename Looker)

> **Cómo usar**: copiá TODO lo que está debajo de la línea horizontal (incluida) y pegalo como primer mensaje en un **chat nuevo** de Claude Code dentro de `/Users/ivanalvis/Desktop/ForUsBots copy`.

---

Estás dentro del repositorio ForUsBots en `/Users/ivanalvis/Desktop/ForUsBots copy`. Ya estoy autenticado en `gcloud` CLI (proyecto `forusbots`).

Tu misión es ejecutar **únicamente la Fase 06.04 — Sandbox UI dinámica + docs + rename de Looker** del plan de Token Scopes. Es una fase de superficie: HTML/CSS/JS de la sandbox + OpenAPI + docs del repo + un rename de archivo.

El plan vive en este sub-folder:

- `GCP Implementation/06-token-scopes/00-OVERVIEW.md` (contexto general)
- `GCP Implementation/06-token-scopes/04-sandbox-and-docs.md` ← **este es el playbook que vas a ejecutar paso a paso**

## Antes de empezar

1. Si no lo hiciste, leé `GCP Implementation/06-token-scopes/00-OVERVIEW.md`.
2. Leé completo `GCP Implementation/06-token-scopes/04-sandbox-and-docs.md`. Ese archivo es tu fuente de verdad.
3. Corré la "Validación inicial" del `.md`. Verifica que **Fases 01, 02 y 03 estén commiteadas** y que `/forusbot/whoami` devuelve `scope` + `accountAlias`. Si algo falla, **NO sigas**.
4. Auditá la sandbox actual antes de modificar: leé `docs/sandbox/index.html` (al menos los primeros 100 lines) y `docs/sandbox/js/main.js` (o el archivo bootstrap real). El `.md` da pseudo-código; tu trabajo es **adaptarlo al estilo real del archivo**.

## Qué tenés que hacer (resumen — el detalle real está en el .md)

1. Extender el bootstrap de la sandbox (probable: `docs/sandbox/js/main.js`) para leer `scope` + `accountAlias` desde `/forusbot/whoami`.
2. Agregar `applyScopeToUI(scope)`:
   - cards con `data-feature` en `deniedFeatures` → `.scope-disabled` + badge.
   - botones con `data-endpoint` en `deniedEndpoints` (y no en `allowedEndpoints`) → disabled + tooltip.
   - cards/botones en `allowedEndpoints` aunque la feature esté denegada → `.scope-override` (outline punteado).
3. Marcar cada tarjeta de bot en `docs/sandbox/index.html` con `data-feature="..."` y `data-endpoint="..."`. Lista completa en el `.md`. **No te saltees ninguna** — auditalas visualmente.
4. Header dinámico mostrando `name`, `role`, `accountAlias` (NO `siteUser` aunque venga enmascarado).
5. Replicar cambios en `docs/sandbox/es/` si existe (i18n).
6. Actualizar el OpenAPI YAML (path en `src/routes/index.js:213` o donde se sirva `/forusbot/openapi`):
   - schema `WhoAmI` con `accountAlias` y `scope`,
   - respuestas `403 forbidden` documentadas en endpoints protegidos.
7. Actualizar `PROJECT_STRUCTURE.md` y `README.md` con la sección "Tokens & Scopes" (instrucciones de edición vía Secret Manager).
8. **Rename** `GCP Implementation/06-looker-studio-dashboards.md` → `GCP Implementation/07-looker-studio-dashboards.md` con `git mv`.
9. Actualizar `GCP Implementation/00-OVERVIEW.md` (overview del folder padre) para reflejar la nueva tabla de fases (06 = token scopes, 07 = looker).
10. Smoke visual de la sandbox local con 1 token admin y 1 token user (cards correctas habilitadas/deshabilitadas).
11. Verificación final del `.md`.
12. Commit con el mensaje indicado.

## Reglas duras

- **Una fase = un commit**.
- **NO inventes nombres de features**. Si una card no matchea ninguna feature de `src/auth/featureMap.js` (Fase 01), preguntame qué hacer en lugar de inventar.
- **NO mostrar `siteUser` en la UI** aunque venga enmascarado desde `whoami`. Sólo `accountAlias`. Menos confusión y menos PII en la pantalla.
- **NO mover el `restrictToEmails` legacy al scope**. Eso es trabajo de una iteración futura. La sandbox de `update-plan` se sigue ofreciendo con su comportamiento actual.
- **El rename de Looker usa `git mv`** (preserva history). No `mv` plano.
- **Hard refresh para validar**: si después de cambiar JS no ves los cambios en la UI, es cache del browser, no del código.
- **Verificá tanto admin como user en el smoke visual**. Sólo admin no alcanza para confirmar que `applyScopeToUI` funciona.
- **OpenAPI puede ser estático en disco o construido dinámicamente**. Buscá el archivo real (`docs/openapi.yaml` o similar) antes de editar; si es construido, modificá el generador.

## Qué reportarme al final

1. Lista de archivos modificados (esperado: `docs/sandbox/*`, OpenAPI yaml, `PROJECT_STRUCTURE.md`, `README.md`, `GCP Implementation/00-OVERVIEW.md`).
2. Lista de cards marcadas con `data-feature` / `data-endpoint` (esperado: 8 bots + 2 sandbox + jobs/admin si la sandbox los muestra).
3. Screenshot/descripción del header de la sandbox con un token admin y un token user (texto exacto que mostraría cada uno).
4. Resultado del rename: `ls "GCP Implementation/"` debe mostrar `07-looker-studio-dashboards.md` y `06-token-scopes/`, NO `06-looker-studio-dashboards.md`.
5. Diff del `00-OVERVIEW.md` del folder padre (las 2 filas de la tabla de fases que se ajustaron).
6. Output de `npm run lint` y el smoke local.
7. Hash del commit y mensaje.

Si el OpenAPI YAML no tenía un schema `WhoAmI` formal (puede que devuelva un objeto inline en cada operación), reportámelo y decidimos si vale la pena formalizarlo en esta fase o lo dejamos como sugerencia.

Arrancá leyendo los `.md` y la "Validación inicial".

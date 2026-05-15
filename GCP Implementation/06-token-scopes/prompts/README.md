# Prompts ejecutables — Token Scopes (fase 06)

Esta carpeta contiene **un prompt por fase** listo para copiar/pegar en un **chat fresco** de Claude Code. Cada prompt es auto-contenido: el Claude que lo reciba no tiene memoria de conversaciones previas, así que el prompt incluye toda la información mínima necesaria.

## Cómo se usan

1. Abrí un chat nuevo de Claude Code **en este repositorio**:
   ```bash
   cd "/Users/ivanalvis/Desktop/ForUsBots copy"
   claude
   ```
2. Abrí el archivo de prompt de la fase que vas a ejecutar (ej. `01-schema-and-storage.prompt.md`).
3. **Copiá el contenido completo** del prompt y pegalo como primer mensaje del chat.
4. Claude leerá el `.md` de fase correspondiente, ejecutará las tareas y te reportará la verificación final.
5. Cuando termine OK, hacé el commit que indique el `.md` y pasá al siguiente prompt.

## Reglas globales (incorporadas en cada prompt)

- **Una fase = un commit**. No commit sin la verificación final pasando.
- **No saltarse la "Validación inicial"**. Si falla, parar y volver a la fase anterior.
- **No inventar features ni roles**. El set válido viene de `roles.js` / `featureMap.js`.
- **Credenciales jamás en logs ni en HTTP responses**. Sólo `accountAlias` y `siteUser` enmascarado.
- **Back-compat durante grace period** (fases 02 y 03): tolerar tokens legacy sin `account`/`scope`.
- **El usuario está autenticado en gcloud CLI** (proyecto `forusbots`). El working directory es `/Users/ivanalvis/Desktop/ForUsBots copy`.

## Orden

| # | Prompt | Pre-requisito |
|---|--------|--------------|
| 1 | [01-schema-and-storage.prompt.md](./01-schema-and-storage.prompt.md) | Fase 05 de GCP (deploy) cerrada — VM responde |
| 2 | [02-auth-middleware-and-scopes.prompt.md](./02-auth-middleware-and-scopes.prompt.md) | Fase 01 commiteada en main |
| 3 | [03-per-token-credentials.prompt.md](./03-per-token-credentials.prompt.md) | Fase 02 commiteada en main |
| 4 | [04-sandbox-and-docs.prompt.md](./04-sandbox-and-docs.prompt.md) | Fase 03 commiteada en main |
| 5 | [05-verification-and-rollout.prompt.md](./05-verification-and-rollout.prompt.md) | Fase 04 commiteada en main |

## Cuándo NO usar estos prompts

- Si la fase anterior no cerró bien (la "Validación inicial" del prompt va a frenar antes de hacer daño).
- Si querés cambiar el alcance del plan — primero editá el `.md` de fase correspondiente; los prompts dependen del contenido del `.md`.
- Si querés ejecutar **dos fases en el mismo chat** — no se recomienda. Cada fase es un commit y un contexto independiente; los prompts asumen un chat por fase.

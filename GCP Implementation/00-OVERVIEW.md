# GCP Implementation — Overview

Migración ForUsBots: Render → GCP con Firestore + BigQuery + Looker Studio.

Plan completo aprobado: [`~/.claude/plans/actualmente-mi-proyecto-est-vivid-dragon.md`](../../../.claude/plans/actualmente-mi-proyecto-est-vivid-dragon.md)

## Cómo usar este folder

Cada archivo numerado es una **sesión independiente** de implementación. Pegale al Claude del momento solo el archivo de la fase que vas a ejecutar. Cada archivo:

1. **Valida** que la fase anterior quedó completa (sin esto, NO procede)
2. Ejecuta los pasos de su fase
3. Te deja verificación end-to-end para que la siguiente fase pueda chequear que esta sí quedó

## Orden de fases

| # | Archivo                                                       | Duración | Requiere GCP | Reversible |
|---|---------------------------------------------------------------|----------|--------------|------------|
| 1 | [01-logging-refactor.md](./01-logging-refactor.md)            | ~4h      | No           | Sí (git revert) |
| 2 | [02-public-payload-cleanup.md](./02-public-payload-cleanup.md)| ~6h      | No           | Sí (git revert) |
| 3 | [03-gcp-infra-provisioning.md](./03-gcp-infra-provisioning.md)| ~2h      | Sí           | Sí (`gcloud projects delete`) |
| 4 | [04-firestore-data-layer.md](./04-firestore-data-layer.md)    | ~2 días  | Sí (emulator local + cloud) | Sí hasta el cutover |
| 5 | [05-deploy-and-cutover.md](./05-deploy-and-cutover.md)        | ~3h      | Sí           | Sí (volver a Render mientras no apaguemos) |
| 6 | [06-looker-studio-dashboards.md](./06-looker-studio-dashboards.md) | ~1 día | Sí           | Sí (los dashboards son separables) |

**Total estimado**: ~3-4 días de trabajo focused.

## Arquitectura final

```
[GitHub] → [Cloud Build] → [Artifact Registry] → [MIG (e2-small) + Stateful Disk]
                                                          ↓
                                                   [Firestore]
                                                          ↓
                                            [BigQuery] ← Looker Studio (@forusall.com)
```

## Decisiones ya tomadas (no replantear)

- **Histórico**: cortar limpio. No migrar datos de Render.
- **Endpoints `/forusbot/data/*`**: borrar definitivamente.
- **Looker Studio**: restringido a `@forusall.com`, puede mostrar PII.
- **Disponibilidad**: MIG size=1 con auto-healing + stateful disk + IP estática.
- **DB analítica**: Firestore (operacional) + BigQuery (analytics) vía extensión oficial `firestore-bigquery-export`.

## Reglas de oro durante la implementación

1. **Nunca saltar la validación inicial** de cada fase. Si falla, parar y arreglar la fase anterior antes de seguir.
2. **No commitear hasta que la verificación final de la fase pase**. Cada fase es 1 commit (o un PR).
3. **Si algo falla en producción durante 05**, NO apagar Render todavía. Es nuestra red de seguridad hasta que GCP esté estable por 24-48h.
4. **Los secretos NUNCA en commits**. Solo en Secret Manager (fase 03 en adelante) o `.env` local (gitignored).

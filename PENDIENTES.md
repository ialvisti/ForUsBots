# Pendientes y estado actual

Última revisión: 2026-08-03.

Este documento es el punto de entrada para retomar trabajo en ForUsBots.
Separa los bloqueos operativos de la deuda de seguridad y del backlog opcional.

## Resumen ejecutivo

| Área | Estado | Próxima acción |
|---|---|---|
| Producción GCP | Saludable y desplegada desde `main` | Mantener monitoreo y rollback |
| Git y CI | Base funcional `bc4b37f`; build `SUCCESS` | Mantener tests y build verdes |
| Idempotencia RAG | Durable para scrape de participante y plan | Validar el flujo completo desde n8n |
| Token scopes | Fases 01–04 implementadas; fase 05 incompleta | Cerrar el grace period de credenciales legacy |
| Transporte | Endpoint productivo HTTP legacy | Migrar a HTTPS o ingress privado |
| Looker Studio | Vista BQ y alertas en código; dashboards manuales sin cierre verificable | Confirmar/crear dashboards y accesos |
| Email trigger | Flujos existentes implementados | Añadir integración Playwright y resiliencia si se prioriza |

## Estado actual verificado

- GitHub y el checkout local sólo tienen la rama `main`.
- La base funcional auditada antes de este documento es
  `bc4b37ff01ac496d84d973a50f367ff6ed421b33`.
- Cloud Build `7bd897b6-e1a1-4d0c-9310-549c22c4eeb0` terminó en `SUCCESS`.
- El MIG está estable, alcanzó su target y usa la plantilla
  `forusbots-template-bc4b37f-0ef67a6cf5fe`.
- `/health` responde `{"ok":true}` y la API publicada declara versión `2.6.0`.
- La suite conocida pasa con 60 tests y 1 live test omitido; ESLint reporta
  cero errores y 21 warnings de mantenimiento.
- Los submits usados por RAG tienen receipts y jobs durables, replay al mismo
  job y conflicto `409` cuando cambia el payload.
- La documentación API y la sandbox consolidada están en `main`.

## Trabajo a medias

### P0 — Prueba integral desde n8n

Falta que el owner de n8n ejecute el caso real contra RAG y ForUsBots. Validar:

1. Un solo submit upstream para la misma clave idempotente.
2. Polling hasta `succeeded`.
3. Receipt, fingerprint, TTL y referencia de job consistentes.
4. Cero duplicación del efecto externo.

La evidencia debe contener sólo IDs técnicos, estados y timestamps. No guardar
tokens, HTML del portal, payloads completos ni PII en Git.

### P1 — Migrar el origen HTTP a HTTPS o ingress privado

El MIG sigue expuesto mediante el origen HTTP legacy. La migración debe
coordinarse con ForUsGuide y n8n:

1. Elegir HTTPS con certificado administrado o un ingress privado compatible
   con los callers actuales.
2. Mantener `/health`, autenticación y timeouts durante el cambio.
3. Actualizar el origen en RAG y cualquier allowlist de n8n.
4. Ejecutar canary, replay idempotente y rollback antes de retirar HTTP.

Criterio de cierre: ningún caller usa HTTP y los smokes de participant/plan
siguen siendo durables.

### P1 — Cerrar la fase 05 de token scopes

Las fases de schema, autorización, cuentas por token y sandbox están en el
repositorio. El grace period no está cerrado:

- `src/auth/account.js` aún permite `legacy-shared` y fallback a variables de
  entorno;
- `src/secrets.js` aún carga `SITE_USER`, `SITE_PASS` y `TOTP_SECRET`;
- los nombres de esos tres secretos todavía existen en el proyecto GCP junto
  con `TOKENS_JSON`.

Secuencia segura:

1. Auditar el shape de todos los tokens sin imprimir sus valores.
2. Ejecutar E2E para al menos admin, user y custom-deny.
3. Confirmar durante 24 horas cero uso inesperado de `legacy-shared` y cero
   errores de scope/account.
4. Escribir primero tests que exijan fail-closed cuando falte `account`.
5. Quitar el fallback de `src/auth/account.js` y la carga legacy de
   `src/secrets.js`.
6. Desplegar, verificar el rolling update y repetir los smokes.
7. Sólo después destruir los secretos legacy, con aprobación y rollback
   documentado.

No borrar secretos antes de verificar que todos los tokens productivos tienen
cuenta válida. La guía histórica está en
[`GCP Implementation/06-token-scopes/05-verification-and-rollout.md`](GCP%20Implementation/06-token-scopes/05-verification-and-rollout.md);
sus rutas y comandos deben actualizarse al repo/proyecto actuales antes de
ejecutarlos.

### P2 — Cerrar Looker Studio

El repositorio contiene la vista `v_errors_recent` y trabajo de alertas, pero
los dashboards de Looker son recursos manuales externos y su estado no puede
probarse desde Git. El owner debe confirmar o completar:

- Operaciones Diarias, Tendencias y Salud;
- acceso restringido al dominio corporativo y rechazo a cuentas externas;
- data sources compartidos con el mismo alcance;
- freshness, presupuesto de BigQuery y canales reales de notificación.

Actualizar este archivo con las URLs internas o, preferiblemente, con la
ubicación corporativa donde se custodian; no publicar enlaces sensibles en el
repositorio público.

### P2 — Robustecer `forusall-emailtrigger`

El flujo `year_end_notice` está implementado, pero quedan mejoras no bloqueantes:

- tests de integración con Playwright;
- retries limitados para fallos transitorios;
- screenshots/evidencia sanitizada cuando falla;
- validación adicional de preview y participant count;
- decidir cuáles de los email types aún no implementados siguen siendo
  requisitos reales antes de añadir código.

Aplicar YAGNI: no implementar todos los flows listados como ideas históricas
sin una prioridad de producto explícita.

### P3 — Mantenimiento

- Reducir gradualmente los 21 warnings de ESLint sin mezclarlo con cambios
  funcionales.
- Ejecutar periódicamente el live test omitido en un entorno controlado.
- Revisar costos, snapshots, alertas y crecimiento Firestore/BigQuery.

## Qué trabajar primero

1. Prueba real n8n → RAG → ForUsBots.
2. Diseño y canary de HTTPS/ingress privado.
3. Cierre fail-closed de token scopes después de 24 horas de evidencia.
4. Verificación manual de Looker Studio.
5. Integración Playwright y backlog de email sólo si producto lo prioriza.

## No hacer

- No imprimir ni guardar el contenido de `TOKENS_JSON` o de secretos legacy.
- No retirar el fallback antes de auditar todos los tokens productivos.
- No destruir secretos sin deploy verificado y rollback aprobado.
- No guardar capturas HTML del portal ni reportes con datos operativos en Git.
- No reintroducir la antigua rama de reportes anuales; fue excluida
  deliberadamente por contener artefactos generados y datos operativos.

## Documentación relacionada

- [`README.md`](README.md)
- [`GCP Implementation/00-OVERVIEW.md`](GCP%20Implementation/00-OVERVIEW.md)
- [`GCP Implementation/06-token-scopes/00-OVERVIEW.md`](GCP%20Implementation/06-token-scopes/00-OVERVIEW.md)
- [`GCP Implementation/07-looker-studio-dashboards.md`](GCP%20Implementation/07-looker-studio-dashboards.md)
- [`src/bots/forusall-emailtrigger/flows/README.md`](src/bots/forusall-emailtrigger/flows/README.md)

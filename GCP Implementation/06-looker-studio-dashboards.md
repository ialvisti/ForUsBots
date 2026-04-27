# Fase 06 — Dashboards en Looker Studio

**Duración estimada**: ~1 día (varios paneles + iteración visual)
**Requiere GCP**: Sí (BigQuery con datos reales)
**Reversible**: Sí (los dashboards son separables, se pueden borrar sin afectar la app)

---

## Validación inicial (la fase 05 quedó bien hecha)

```bash
cd "/Users/ivanalvis/Desktop/ForUsBots copy"
source .gcp-config.local

# 1. Working tree limpio post-cutover
git status
git log -1 --oneline | grep -i "deploy\|cutover\|gcp" && echo "Commit fase 05: OK"

# 2. VM viva
IP=$(gcloud compute addresses describe forusbots-ip --region=$REGION --format="value(address)")
curl -fsS http://$IP:10000/health
# Esperado: {"ok":true}

# 3. Cloud Build trigger configurado
gcloud beta builds triggers list --format="value(name)" | grep forusbots-main-deploy && echo "Trigger: OK"

# 4. BQ tiene datos reales (no solo de tests)
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) AS jobs FROM \`$PROJECT_ID.forusbots_analytics.jobs_raw_latest\` WHERE data.finished_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)"
# Esperado: count > 0 (jobs procesados en la última semana)

# 5. Las 6 vistas devuelven filas
for v in v_jobs_by_bot v_throughput_hourly v_throughput_daily v_throughput_monthly v_status_recent v_durations_recent; do
  count=$(bq query --use_legacy_sql=false --format=csv "SELECT COUNT(*) FROM \`$PROJECT_ID.forusbots_analytics.$v\`" 2>/dev/null | tail -1)
  echo "$v: $count rows"
done
# Esperado: todas con count >= 0 (algunas pueden estar vacías si no hay datos aún, pero deben existir)

# 6. Render apagado (verifica manualmente en https://dashboard.render.com)
echo "→ Verifica manualmente que los servicios de Render están suspendidos/borrados"
```

Si algo falla → vuelve a [05-deploy-and-cutover.md](./05-deploy-and-cutover.md).

---

## Contexto

Fase final: dashboards visuales sobre BigQuery. Esto reemplaza el `/forusbot/data/*` interno que ya borraste. Looker Studio es gratis, conecta directo a BQ, y se restringe a `@forusall.com`.

**Decisión confirmada**: acceso restringido a dominio `@forusall.com`. Los dashboards pueden mostrar PII (planId, participantId, payloads) porque solo lo ven empleados internos.

---

## Tareas

### 1. Acceder a Looker Studio

URL: https://lookerstudio.google.com

Loguéate con tu cuenta `@forusall.com`.

### 2. Crear el primer Data Source

1. Click **Create** → **Data source**
2. Buscar **BigQuery** → seleccionar
3. Authorize si te lo pide
4. **My projects** → `forusbots-prod` (o el `$PROJECT_ID` que usaste) → `forusbots_analytics` → `v_jobs_by_bot`
5. Click **Connect** → revisa los campos detectados → **Create report**

Esto te lleva al editor visual.

### 3. Dashboard 1 — Operaciones diarias

**Nombre**: "ForUsBots — Operaciones Diarias"

Componentes:

#### A. Scorecard "Jobs hoy"
- Métrica: `Record Count`
- Filtro de tiempo: hoy
- Datos: `v_durations_recent`

#### B. Scorecard "Jobs últimos 7 días"
- Métrica: `Record Count`
- Filtro: últimos 7 días sobre `data.finished_at`

#### C. Time series "Throughput por hora"
- Datos: `v_throughput_hourly`
- Eje X: `bucket`
- Eje Y: `count`
- Tipo: línea

#### D. Bar chart "Jobs por bot (top 10)"
- Datos: `v_jobs_by_bot`
- Dimensión: `bot_id`
- Métrica: `total`
- Sort: descendente por total

#### E. Stacked bar "Success vs Fail por bot"
- Datos: `v_jobs_by_bot`
- Dimensión: `bot_id`
- Métricas: `succeeded`, `failed` (apiladas)

#### F. Tabla "Últimos 50 jobs"
- Datos: `v_durations_recent`
- Columnas: `job_id`, `bot_id`, `state`, `run_ms`, `finished_at`
- Ordenar por `finished_at` desc, limit 50
- Resaltar filas con `state = 'failed'` en rojo

#### G. Filtros globales (top del dashboard)
- Date range picker (default: últimos 7 días)
- Filtro `bot_id` (multi-select)
- Filtro `state` (multi-select)

### 4. Dashboard 2 — Análisis temporal

**Nombre**: "ForUsBots — Tendencias"

#### A. Time series "Throughput diario (últimos 30 días)"
- Datos: `v_throughput_daily`
- Eje X: `bucket`, Eje Y: `count`

#### B. Time series "Throughput mensual (últimos 12 meses)"
- Datos: `v_throughput_monthly`

#### C. Histogram "Distribución de duraciones"
- Datos: `v_durations_recent`
- Métrica: `run_ms`
- Buckets: automáticos

#### D. Heatmap "Jobs por hora del día × día de la semana"
- Datos: `v_durations_recent`
- Custom field: `EXTRACT(HOUR FROM finished_at)` y `EXTRACT(DAYOFWEEK FROM finished_at)`

### 5. Dashboard 3 — Estado y errores

**Nombre**: "ForUsBots — Salud"

#### A. Scorecards row
- Succeeded últimas 24h (de `v_status_recent.succeeded_1d`)
- Failed últimas 24h (de `v_status_recent.failed_1d`)
- Success rate 14d: `succeeded_14d / (succeeded_14d + failed_14d) * 100`

#### B. Tabla "Últimos errores"
- Necesitas un campo nuevo. Crear un Custom Field en el data source:
  ```
  CASE WHEN data.state = 'failed' THEN data.error.message END
  ```
- Filtrar por `state = 'failed'`, ordenar por `finished_at` desc

#### C. Bar chart "Top errores por código"
- Custom field: `data.error.code`
- Métrica: count

### 6. Restricción de acceso (CRÍTICO)

Para CADA dashboard:
1. Click **Share** (esquina superior derecha)
2. **Get link** → cambiar a:
   - "Restricted" (NO "Anyone with the link")
3. **Manage access** → seleccionar:
   - "Anyone at forusall.com with the link can view"
4. NO seleccionar "Anyone with the link"

**Verificar acceso:**
- Tu cuenta `@forusall.com` puede ver: ✓
- Tu cuenta personal Gmail (no `@forusall.com`): debe ver error 403

### 7. Compartir URLs con el equipo

Una vez verificado, comparte los 3 links en Slack/email:
- 📊 Operaciones Diarias: `https://lookerstudio.google.com/...`
- 📈 Tendencias: `...`
- 🚨 Salud: `...`

### 8. (Opcional) Auto-refresh

En cada dashboard:
1. **Edit** → **File** → **Report settings**
2. **Data freshness**: cada 15 minutos (default 12h)
3. Esto consume queries BQ — si te preocupa el costo, deja en 1h o más

### 9. (Opcional) Programar reporte por email

Si quieres recibir el dashboard cada lunes a las 9am:
1. **Share** → **Schedule email delivery**
2. Configurar destinatarios (todos `@forusall.com`)
3. Frecuencia: weekly, lunes 9am
4. Formato: PDF

---

## Verificación final

```bash
# 1. (Manual) Abrir cada dashboard como usuario @forusall.com — todos cargan datos
# 2. (Manual) Compartir link con un usuario externo (Gmail personal) — debe recibir 403
# 3. Validar que las queries no exceden el budget BQ
gcloud logging read 'resource.type="bigquery_resource" protoPayload.serviceName="bigquery.googleapis.com"' --freshness=1d --limit=100 --format="value(protoPayload.serviceData.jobCompletedEvent.job.jobStatistics.totalBilledBytes)" | awk '{ s+=$1 } END { print "Total BQ bytes scanned today:", s }'
# Esperado: muy por debajo de 1TB (free tier)

# 4. Costo total del proyecto en GCP
gcloud billing accounts get-iam-policy $BILLING_ACCOUNT
# Y revisa: https://console.cloud.google.com/billing
# Esperado tras 7 días: proyección mensual entre $16-20

# 5. Confirmar que NO hay incidentes en producción
gcloud logging read 'severity>=ERROR resource.type="gce_instance"' --freshness=24h --format="value(timestamp,jsonPayload.type)"
# Esperado: pocos o ningún error
```

---

## Pitfalls comunes

- **Looker Studio cache**: por defecto cachea 12h. Si haces cambios en BQ y no los ves, click **More** (⋮) → **Refresh data**.
- **Field types incorrectos**: si BQ devuelve `bucket` como STRING en vez de TIMESTAMP, agrega un Custom Field con `PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', bucket)`.
- **Costos por queries pesadas**: cada interacción del dashboard ejecuta una query. Si tienes joins masivos, BQ puede cobrar. Mitigación: usar **Extract data** (snapshot diario) en vez de live query.
- **Permisos inconsistentes**: si tu equipo NO ve los dashboards aunque tengan `@forusall.com`, verifica:
  - El dashboard está en "Anyone at forusall.com" (no "Restricted")
  - El data source también está compartido (Share del data source separadamente)
  - El proyecto BQ acepta accesos vía la cuenta del usuario (puede requerir `roles/bigquery.dataViewer` por usuario)
- **Custom fields no se actualizan**: si modificas la fórmula y no la ves en el chart, **Refresh fields** en el data source.

---

## Bonus: alertas sobre BQ

Configura alertas que llamen a tu Slack o email cuando:
- Failed jobs > 5 en 1h
- Sin jobs procesados en 30 min (posible app caída)
- Latencia P95 > 60s

Vía Cloud Monitoring (no Looker Studio):

```bash
# Alerta: errores recientes
gcloud alpha monitoring policies create --policy-from-file=- <<EOF
displayName: "ForUsBots: jobs failed > 5 in 1h"
conditions:
  - displayName: "Failed jobs"
    conditionThreshold:
      filter: 'resource.type="gce_instance" AND severity="ERROR" AND jsonPayload.type="job.failed"'
      aggregations:
        - alignmentPeriod: 3600s
          perSeriesAligner: ALIGN_COUNT
      comparison: COMPARISON_GT
      thresholdValue: 5
notificationChannels:
  - "projects/$PROJECT_ID/notificationChannels/<TU_CHANNEL_ID>"
EOF
```

(Las notification channels se crean primero en Console → Monitoring → Alerting → Notification channels.)

---

## ✓ Migración completa

Con esta fase terminada, tu setup es:

```
[GitHub] → push main → [Cloud Build trigger]
                              ↓
                       [Artifact Registry]
                              ↓
                    [MIG (e2-small) auto-healing]
                              ↓
                  [Container: Express + Playwright]
                       ↓ writes      ↓ analytics reads
                  [Firestore]   →   [BigQuery]
                                         ↓
                              [Looker Studio dashboards]
                              (restricted @forusall.com)
```

**Costo final esperado**: ~$16-20 USD/mes (vs $48.75 en Render)
**Ahorro**: ~$28-32/mes (~60%)

**Tareas en background recomendadas**:
- Snapshot del Persistent Disk: ya programado diariamente (fase 03)
- Budget alert en GCP: configurado en fase 05
- Monitoring de errores: configurado arriba (opcional)

**Siguiente revisión**: en 30 días, validar costo real vs proyección y ajustar si la DB Firestore queda corta o sobra.

🎉 Done.

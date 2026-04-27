# Fase 05 — Deploy a GCP y cutover desde Render

**Duración estimada**: ~3 horas (más ~24-48h de monitoreo en paralelo antes de apagar Render)
**Requiere GCP**: Sí
**Reversible**: Sí, mientras Render siga prendido

---

## Validación inicial (la fase 04 quedó bien hecha)

```bash
cd "/Users/ivanalvis/Desktop/ForUsBots copy"
source .gcp-config.local

# 1. Working tree limpio, último commit es de la migración a Firestore
git status
git log -1 --oneline | grep -i "firestore\|bigquery\|capa de datos" && echo "Commit fase 04: OK"

# 2. Lint sigue pasando
npm run lint && echo "Lint: OK"

# 3. pg fuera, deps GCP dentro
node -e "
const p = require('./package.json');
if (p.dependencies.pg) { console.error('pg AÚN ESTÁ'); process.exit(1); }
['@google-cloud/firestore','@google-cloud/bigquery','@google-cloud/secret-manager'].forEach(d => {
  if (!p.dependencies[d]) { console.error('FALTA',d); process.exit(1); }
});
console.log('Deps: OK');
"

# 4. Archivos clave de fase 04
test -f src/secrets.js && \
test -f src/db/firestore.js && \
test -f src/db/bigquery.js && \
test ! -f src/routes/data-jobs-db.js && \
test ! -f src/routes/data-metrics-db.js && \
test ! -d migrations && \
echo "Estructura código: OK"

# 5. 6 vistas BQ existen
bq ls $PROJECT_ID:forusbots_analytics --format=json | jq -r '.[].tableReference.tableId' | grep -c "^v_"
# Esperado: 6

# 6. Smoke test contra Firestore real (app local apuntando a cloud)
GCP_PROJECT=$PROJECT_ID AUDIT_DB=1 node -e "
const { jobsCol } = require('./src/db/firestore');
(async () => {
  const snap = await jobsCol().limit(1).get();
  console.log('Firestore reachable, docs:', snap.size);
})();
"
# Esperado: imprime sin error
```

Si algo falla → vuelve a [04-firestore-data-layer.md](./04-firestore-data-layer.md).

---

## Contexto

Esta fase:
1. Crea los archivos de deploy (`cloudbuild.yaml`, startup script, etc.)
2. Hace el primer build manual y lo sube a Artifact Registry
3. Actualiza el instance template con la imagen real
4. Recrea la VM del MIG y verifica que arranca y responde
5. Configura el Cloud Build trigger desde GitHub para auto-deploy en cada push a `main`
6. Smoke tests end-to-end contra la VM en GCP
7. **Apunta clientes a la nueva URL** (cutover)
8. Monitorea ~24-48h en paralelo con Render
9. Apaga Render

---

## Tareas

### 1. Crear `cloudbuild.yaml` en la raíz

```yaml
# cloudbuild.yaml
steps:
  - id: build
    name: gcr.io/cloud-builders/docker
    args:
      - build
      - -t
      - $_IMAGE:$SHORT_SHA
      - -t
      - $_IMAGE:latest
      - .

  - id: push
    name: gcr.io/cloud-builders/docker
    args: [push, --all-tags, $_IMAGE]

  - id: rolling-update
    name: gcr.io/google.com/cloudsdktool/cloud-sdk
    entrypoint: bash
    args:
      - -c
      - |
        set -e
        # Crear nueva versión del template con la imagen recién subida
        gcloud compute instance-templates create-with-container forusbots-template-$SHORT_SHA \
          --machine-type=e2-small \
          --container-image=$_IMAGE:$SHORT_SHA \
          --service-account=$_SA_EMAIL \
          --scopes=cloud-platform \
          --tags=http-server \
          --address=forusbots-ip \
          --container-env=NODE_ENV=production,GCP_PROJECT=$PROJECT_ID,LOG_FORMAT=json,LOG_LEVEL=info,PORT=10000,AUDIT_DB=1 \
          --container-mount-disk=mount-path=/var/lib/forusbots,name=state \
          --disk=name=forusbots-state,device-name=state,mode=rw,boot=no
        # Apuntar el MIG a la nueva versión y rolling update
        gcloud compute instance-groups managed set-instance-template forusbots-mig \
          --zone=$_ZONE \
          --template=forusbots-template-$SHORT_SHA
        gcloud compute instance-groups managed rolling-action start-update forusbots-mig \
          --zone=$_ZONE \
          --version=template=forusbots-template-$SHORT_SHA \
          --max-surge=1 --max-unavailable=0

substitutions:
  _IMAGE: us-central1-docker.pkg.dev/${PROJECT_ID}/forusbots/forusbots
  _SA_EMAIL: forusbots-vm@${PROJECT_ID}.iam.gserviceaccount.com
  _ZONE: us-central1-a

options:
  logging: CLOUD_LOGGING_ONLY
  machineType: E2_HIGHCPU_8
```

### 2. Verificar `Dockerfile` (sin cambios, pero validar)

```bash
cat Dockerfile
# Confirmar que sigue siendo:
# FROM mcr.microsoft.com/playwright:v1.54.2-jammy
# CMD ["npm","start"]
```

Tweak menor recomendado: agregar `EXPOSE 10000` si no está, y validar `HEALTHCHECK`. Pero si funciona en Render, sirve aquí.

### 3. Configurar permisos de Cloud Build

```bash
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

# Cloud Build necesita poder:
# - Push a Artifact Registry
# - Crear instance templates
# - Modificar el MIG
for role in \
  roles/artifactregistry.writer \
  roles/compute.instanceAdmin.v1 \
  roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$CB_SA" \
    --role="$role"
done
```

### 4. Primer build manual

```bash
gcloud builds submit --config=cloudbuild.yaml --project=$PROJECT_ID
```

Esto:
- Construye la imagen Docker
- La sube a Artifact Registry
- Crea un nuevo instance template con esa imagen
- Hace rolling update del MIG → la VM se recrea con la imagen real

Espera ~5-10 minutos. Verifica:
```bash
gcloud compute instance-groups managed describe forusbots-mig --zone=$ZONE \
  --format="value(status.versionTarget.isReached)"
# Esperado: True
```

### 5. Verificar que la VM arranca y responde

```bash
# IP estática
IP=$(gcloud compute addresses describe forusbots-ip --region=$REGION --format="value(address)")

# Esperar ~2 min para que el container arranque
sleep 120

# Health check
curl -fsS http://$IP:10000/health
# Esperado: {"ok":true}

# Whoami con un admin token (deberías tener el SHARED_TOKEN en Secret Manager)
TOKEN=$(gcloud secrets versions access latest --secret=SHARED_TOKEN)
curl -sS http://$IP:10000/forusbot/whoami -H "x-auth-token: $TOKEN" | jq
# Esperado: {role: "admin", ...}
```

Si falla:
```bash
# Ver logs del container
gcloud logging read 'resource.type="gce_instance"' --limit=50 --format=json | jq -r '.[] | .jsonPayload // .textPayload'
```

### 6. End-to-end: encolar un job y verificar

```bash
# Encolar un scrape
JOB=$(curl -sS -X POST http://$IP:10000/forusbot/scrape-participant \
  -H "x-auth-token: $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"participantId":"158948","modules":[{"key":"census"}]}' | jq -r .jobId)

echo "JobID: $JOB"

# Polling
while true; do
  R=$(curl -sS http://$IP:10000/forusbot/jobs/$JOB -H "x-auth-token: $TOKEN")
  S=$(echo "$R" | jq -r .state)
  echo "State: $S"
  [[ "$S" == "succeeded" || "$S" == "failed" ]] && break
  sleep 3
done

echo "$R" | jq
```

Verificaciones del shape público:
- `state == "succeeded"`
- Tiene `data` con datos aplanados
- NO tiene `jobId`, `botId`, `meta`, `stages`, `createdBy`, etc.

### 7. Verificar que el dato llegó a Firestore

```bash
# Vía Console: console.firebase.google.com → Firestore → jobs/{jobId}
# Vía gcloud:
gcloud firestore documents describe "projects/$PROJECT_ID/databases/(default)/documents/jobs/$JOB"
```

### 8. Verificar replicación a BigQuery (~1 min después)

```bash
sleep 90
bq query --use_legacy_sql=false \
  "SELECT document_id, data.state FROM \`$PROJECT_ID.forusbots_analytics.jobs_raw_latest\` WHERE document_id='$JOB'"
# Esperado: una fila con state=succeeded
```

### 9. Verificar auto-healing

```bash
# Ver el nombre actual de la VM
INSTANCE=$(gcloud compute instance-groups managed list-instances forusbots-mig --zone=$ZONE --format="value(name)" | head -1)
echo "Instance: $INSTANCE"

# Matar el container (simular falla)
gcloud compute ssh $INSTANCE --zone=$ZONE --command="sudo docker ps -q | xargs sudo docker kill"

# Esperar el ciclo del health check (~2 min)
sleep 150

# La instancia debería seguir ahí (mismo nombre) con el container reiniciado
curl -fsS http://$IP:10000/health
# Esperado: {"ok":true}

# Si el container no se recupera solo, el MIG recreará la VM completa
# Verificar:
gcloud compute instance-groups managed list-instances forusbots-mig --zone=$ZONE
```

### 10. Verificar que el disco stateful sobrevivió

```bash
# Conectarse y verificar que /var/lib/forusbots tiene datos
gcloud compute ssh $INSTANCE --zone=$ZONE --command="sudo ls -la /var/lib/forusbots/"
# Esperado: directorios user-data/ y sessions/ con tamaño > 0
```

### 11. Cloud Build trigger desde GitHub

```bash
# Conectar el repo de GitHub a Cloud Build
gcloud beta builds triggers create github \
  --repo-name=ForUsBots \
  --repo-owner=ialvisti \
  --branch-pattern="^main$" \
  --build-config=cloudbuild.yaml \
  --name=forusbots-main-deploy \
  --description="Auto-deploy main → MIG"
```

> Si te pide autenticar el repo, usa `gcloud beta builds triggers list` después de hacerlo manualmente desde la Console: https://console.cloud.google.com/cloud-build/triggers

Probar el trigger:
```bash
# Hacer un commit trivial y push a main
echo "# deploy test" >> .deploy-test
git add .deploy-test
git commit -m "test: trigger Cloud Build"
git push origin main

# Ver el build en marcha
gcloud builds list --ongoing
```

### 12. Cutover: apuntar clientes a la nueva URL

**ANTES**:
- Tu cliente actual (probablemente la portal de ForUsAll u otro consumer) llama a `https://forusbots.onrender.com/...` (o lo que sea).

**AHORA**:
- Tienes que cambiarlo a `http://$IP:10000/...` o (mejor) un dominio estable.

**Recomendación**:
- Si quieres HTTPS y un nombre amigable, agrega un Cloud Load Balancer (~$18/mo) o un Cloudflare gratis frente a la VM.
- Si solo quieres HTTP a la IP: dale a tu cliente `http://$IP:10000/forusbot/*`.

**Aviso**: el cliente debe hacer el cambio al MISMO TIEMPO que verificas que GCP responde. Mantén Render arriba en paralelo durante ~24-48h.

### 13. Monitoreo en paralelo (24-48h)

Durante este período:
- Render sigue prendido (siguiendo recibiendo tráfico legacy si aún no migraste todos los clientes)
- GCP recibe el tráfico nuevo
- Logs de ambos lados visibles

**Métricas a observar**:
```bash
# Cloud Logging: errores por hora
gcloud logging read 'severity>=ERROR resource.type="gce_instance"' --freshness=1h --format="value(timestamp,jsonPayload.type)"

# Firestore: jobs por estado
bq query --use_legacy_sql=false \
  "SELECT data.state, COUNT(*) FROM \`$PROJECT_ID.forusbots_analytics.jobs_raw_latest\` GROUP BY data.state"

# Costo proyectado
gcloud billing accounts get-iam-policy $BILLING_ACCOUNT
# Y vía Console: console.cloud.google.com/billing
```

### 14. Apagar Render (cuando GCP esté estable 48h sin issues)

```bash
# En el dashboard de Render:
# 1. Suspender el web service `forusbots`
# 2. Suspender la database `forusbots`
# 3. (Más tarde) borrar definitivamente
```

NO borres aún el `render.yaml` del repo — archívalo:

```bash
git mv render.yaml render.yaml.archived
git commit -m "Archivar render.yaml — migrado a GCP"
```

---

## Verificación final

```bash
# 1. cloudbuild.yaml existe
test -f cloudbuild.yaml && echo "cloudbuild.yaml: OK"

# 2. Imagen en Artifact Registry
gcloud artifacts docker images list us-central1-docker.pkg.dev/$PROJECT_ID/forusbots --format="value(IMAGE,TAGS)" | head -3
# Esperado: imagen forusbots con tags latest y SHA

# 3. MIG running con imagen correcta
gcloud compute instance-groups managed describe forusbots-mig --zone=$ZONE --format="value(versions[0].instanceTemplate)"
# Esperado: forusbots-template-<SHA>

# 4. Health endpoint respondiendo
IP=$(gcloud compute addresses describe forusbots-ip --region=$REGION --format="value(address)")
curl -fsS http://$IP:10000/health && echo " — alive"

# 5. End-to-end job exitoso
TOKEN=$(gcloud secrets versions access latest --secret=SHARED_TOKEN)
JOB=$(curl -sS -X POST http://$IP:10000/forusbot/scrape-participant \
  -H "x-auth-token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"participantId":"158948","modules":[{"key":"census"}]}' | jq -r .jobId)
sleep 10
curl -sS http://$IP:10000/forusbot/jobs/$JOB -H "x-auth-token: $TOKEN" | jq -e '.state == "succeeded"' && echo "Job: OK"

# 6. Cloud Build trigger configurado
gcloud beta builds triggers list --filter="name:forusbots-main-deploy" --format="value(name,github.name)"
# Esperado: forusbots-main-deploy ialvisti/ForUsBots

# 7. Costos: revisa la consola de billing tras 7 días
# https://console.cloud.google.com/billing/$BILLING_ACCOUNT/reports

# 8. (Después de 48h) Render apagado
# Manualmente verifica que el dashboard de Render muestra "Suspended"
```

Commit final de esta fase:

```bash
git add -A
git commit -m "Deploy a GCP: cloudbuild.yaml + cutover desde Render

- Agrega cloudbuild.yaml con build → push → rolling update del MIG
- Configura Cloud Build trigger desde GitHub main
- Archiva render.yaml (migrado a GCP)
- Verificado: VM responde /health, jobs end-to-end OK, Firestore→BQ replicando
- Auto-healing del MIG validado
"
git push origin main
```

---

## Pitfalls comunes

- **Container no arranca**: revisa `gcloud logging read` con `severity=ERROR`. Lo más común: variables de entorno faltantes (especialmente `GCP_PROJECT`) o Secret Manager sin permisos para la SA.
- **VM en estado RUNNING pero `/health` no responde**: el container puede estar dentro pero crasheando. SSH a la VM y `sudo docker logs $(sudo docker ps -aq)`.
- **Persistent Disk no se monta**: si `/var/lib/forusbots` está vacío después del boot, el `--container-mount-disk` no se aplicó. Verifica el instance template con `gcloud compute instance-templates describe forusbots-template-<SHA>`.
- **Cloud Build trigger no dispara**: verifica que la app de GitHub esté instalada en el repo (vía Console > Cloud Build > Triggers > Connect Repository).
- **Costos sorpresa**: el primer mes puede tener un spike por el setup. Setea un budget alert: `gcloud billing budgets create --billing-account=$BILLING_ACCOUNT --display-name="ForUsBots" --budget-amount=50USD`.
- **DNS / dominio**: si agregaste un Load Balancer con dominio, el certificado SSL puede tardar 30-60 min en propagar. Usa `gcloud compute ssl-certificates describe`.
- **Render sigue cobrando**: asegúrate de SUSPENDER y luego BORRAR los servicios + DB en Render. Si solo paras la app pero no la DB, te siguen cobrando los $19/mes de Postgres.

---

## Salida que debe ver la fase 06

- VM productiva respondiendo `/health`
- Cloud Build trigger funcional (un push a main dispara deploy)
- Datos fluyendo de Firestore a BQ (`SELECT count(*) FROM jobs_raw_latest` retorna > 0)
- Las 6 vistas BQ devuelven filas reales

Si todo eso pasa, procede a [06-looker-studio-dashboards.md](./06-looker-studio-dashboards.md).

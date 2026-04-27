# Fase 03 — Provisionar infraestructura GCP

**Duración estimada**: ~2 horas (la mayoría es setup, no espera)
**Requiere GCP**: Sí — necesitas una cuenta de GCP con billing habilitado
**Reversible**: Sí (`gcloud projects delete` borra todo)

---

## Validación inicial (la fase 02 quedó bien hecha)

```bash
cd "/Users/ivanalvis/Desktop/ForUsBots copy"

# 1. Working tree limpio, último commit es de payload cleanup
git status
git log -1 --oneline | grep -i "shape\|payload\|public" && echo "Commit fase 02: OK"

# 2. Lint pasa (de la fase 01)
npm run lint && echo "Lint: OK"

# 3. Archivos de fase 02 existen
test -f src/middleware/public-response.js && \
test -f src/middleware/public-formatters.js && \
echo "Middleware fase 02: OK"

for bot in forusall-scrape-participant forusall-scrape-plan forusall-search-participants forusall-update-participant forusall-update-plan forusall-mfa-reset forusall-emailtrigger forusall-upload; do
  test -f "src/bots/$bot/formatPublic.js" || echo "MISSING: $bot/formatPublic.js"
done

# 4. OpenAPI v2.4.0
grep "version: 2.4.0" docs/openapi.yaml && echo "OpenAPI v2.4.0: OK"

# 5. Smoke test rápido del shape público (con app local arriba)
# (Opcional si ya lo verificaste; salta si la app no está prendida)
```

Si algo falla → vuelve a [02-public-payload-cleanup.md](./02-public-payload-cleanup.md).

---

## Validación de prerequisitos GCP (cuenta + tools)

```bash
# 1. gcloud CLI instalado
gcloud --version
# Esperado: Google Cloud SDK X.X.X

# 2. Estás autenticado con tu cuenta @forusall.com
gcloud auth list
# Esperado: tu cuenta marcada como ACTIVE

# 3. firebase CLI instalado (para deploy de indexes/rules y para la extensión)
firebase --version
# Si no está: npm install -g firebase-tools && firebase login

# 4. bq CLI instalado (viene con gcloud)
bq version
# Esperado: versión de bq tools

# 5. Cuenta de billing identificada
gcloud billing accounts list
# Esperado: al menos una cuenta con OPEN: True
# Anota el ACCOUNT_ID que vas a usar
```

Si falta algo: `brew install --cask google-cloud-sdk` y `npm install -g firebase-tools`.

---

## Contexto

Esta fase crea TODA la infraestructura GCP de una vez. Después de esta fase tienes:
- Un proyecto GCP nuevo (o usas uno existente)
- Firestore Native database
- BigQuery dataset `forusbots_analytics` con réplica desde Firestore
- Service Account con permisos mínimos
- 4 secretos en Secret Manager
- Artifact Registry para la imagen Docker
- Persistent Disk de 15GB para el state de Chromium
- IP estática externa
- Instance Template + Health Check + MIG con auto-healing y stateful disk

**Importante**: aún NO refactorizamos el código para usar Firestore (eso es fase 04). Solo creamos infraestructura.

---

## Tareas

### 0. Variables (define una vez al inicio del shell)

```bash
export PROJECT_ID="forusbots-prod"          # cambia si ya tienes uno
export REGION="us-central1"
export ZONE="us-central1-a"
export DB_LOCATION="us-central1"
export BILLING_ACCOUNT="$(gcloud billing accounts list --format='value(ACCOUNT_ID)' --filter='OPEN=True' | head -1)"
```

### 1. Crear el proyecto y enlazarlo a billing

```bash
# Crear proyecto (si no existe)
gcloud projects create $PROJECT_ID --name="ForUsBots Production"

# Linkear a billing
gcloud billing projects link $PROJECT_ID --billing-account=$BILLING_ACCOUNT

# Set como proyecto activo
gcloud config set project $PROJECT_ID
```

### 2. Habilitar APIs necesarias

```bash
gcloud services enable \
  compute.googleapis.com \
  firestore.googleapis.com \
  bigquery.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  logging.googleapis.com \
  cloudfunctions.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com
```

Espera ~30 segundos para que se propaguen.

### 3. Service Account con roles mínimos

```bash
# Crear SA
gcloud iam service-accounts create forusbots-vm \
  --display-name="ForUsBots VM Runtime"

SA_EMAIL="forusbots-vm@$PROJECT_ID.iam.gserviceaccount.com"

# Asignar roles mínimos
for role in \
  roles/datastore.user \
  roles/bigquery.dataViewer \
  roles/bigquery.jobUser \
  roles/secretmanager.secretAccessor \
  roles/artifactregistry.reader \
  roles/logging.logWriter \
  roles/monitoring.metricWriter; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$role"
done
```

### 4. Crear Firestore en modo Native

```bash
gcloud firestore databases create \
  --location=$DB_LOCATION \
  --type=firestore-native
```

### 5. Crear BigQuery dataset

```bash
bq mk --location=$DB_LOCATION --dataset \
  --description="ForUsBots analytics — replicado desde Firestore" \
  $PROJECT_ID:forusbots_analytics
```

### 6. Instalar la extensión Firestore→BigQuery

La extensión replica writes de una colección Firestore a una tabla BQ. Hay que instalarla **3 veces** (una por colección que queremos replicar: `jobs`, `events`, `jobs/{jobId}/stages`).

```bash
# Inicializar Firebase en el proyecto local (una sola vez)
firebase use --add $PROJECT_ID

# Instalar extensión para colección 'jobs'
firebase ext:install firebase/firestore-bigquery-export \
  --project=$PROJECT_ID
# Te va a pedir parámetros interactivamente:
#   - Collection path: jobs
#   - Dataset ID: forusbots_analytics
#   - Table prefix: jobs
#   - Backup collection: (vacío, no usar)
#   - Use new query syntax: yes

# Repetir para events
firebase ext:install firebase/firestore-bigquery-export \
  --project=$PROJECT_ID
# Collection path: events
# Table prefix: events

# Repetir para subcolección stages (wildcard)
firebase ext:install firebase/firestore-bigquery-export \
  --project=$PROJECT_ID
# Collection path: jobs/{jobId}/stages
# Table prefix: stages
```

Después de instalar las 3 instancias, BQ tendrá las tablas:
- `forusbots_analytics.jobs_raw_changelog` + `jobs_raw_latest`
- `forusbots_analytics.events_raw_changelog` + `events_raw_latest`
- `forusbots_analytics.stages_raw_changelog` + `stages_raw_latest`

### 7. Crear Secret Manager secrets

**IMPORTANTE**: nunca metas los secretos en código ni en commits. Usa este patrón:

```bash
# Para cada secret, te va a pedir el valor por stdin
for s in SITE_USER SITE_PASS TOTP_SECRET SHARED_TOKEN; do
  echo "Pegando secret: $s (Ctrl+D al terminar)"
  gcloud secrets create $s --replication-policy=automatic --data-file=-
done

# Dar acceso de lectura solo a la SA del bot
for s in SITE_USER SITE_PASS TOTP_SECRET SHARED_TOKEN; do
  gcloud secrets add-iam-policy-binding $s \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/secretmanager.secretAccessor"
done
```

Los valores los sacas de tu `.env.production` local (que NO está en git). **Rota antes** si crees que pudieron filtrarse en algún log.

### 8. Crear Artifact Registry

```bash
gcloud artifacts repositories create forusbots \
  --repository-format=docker \
  --location=$REGION \
  --description="ForUsBots Docker images"

# Configurar docker para auth
gcloud auth configure-docker $REGION-docker.pkg.dev
```

### 9. Crear Persistent Disk (stateful, para state de Chromium)

```bash
gcloud compute disks create forusbots-state \
  --size=15GB \
  --type=pd-balanced \
  --zone=$ZONE \
  --description="Chromium user-data + Playwright sessions persistentes"
```

### 10. Reservar IP estática externa

```bash
gcloud compute addresses create forusbots-ip \
  --region=$REGION \
  --description="IP pública estable para ForUsBots"

# Anotar la IP — la vas a necesitar después
gcloud compute addresses describe forusbots-ip --region=$REGION --format="value(address)"
```

### 11. Health check para auto-healing

```bash
gcloud compute health-checks create http forusbots-hc \
  --port=10000 \
  --request-path=/health \
  --check-interval=30s \
  --timeout=10s \
  --healthy-threshold=2 \
  --unhealthy-threshold=3 \
  --description="Health check de /health → autoheal del MIG"
```

### 12. Instance template

**ATENCIÓN**: en este punto NO existe aún la imagen Docker (la fase 05 la sube). Vamos a crear el template con un placeholder y lo actualizaremos en la fase 05.

```bash
# Imagen placeholder por ahora — se actualiza en fase 05
PLACEHOLDER_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/forusbots/forusbots:bootstrap"

gcloud compute instance-templates create-with-container forusbots-template \
  --machine-type=e2-small \
  --container-image=$PLACEHOLDER_IMAGE \
  --service-account=$SA_EMAIL \
  --scopes=cloud-platform \
  --tags=http-server \
  --address=forusbots-ip \
  --container-env=NODE_ENV=production,GCP_PROJECT=$PROJECT_ID,LOG_FORMAT=json,LOG_LEVEL=info,PORT=10000 \
  --container-mount-disk=mount-path=/var/lib/forusbots,name=state \
  --disk=name=forusbots-state,device-name=state,mode=rw,boot=no
```

> **Nota**: si te falla por la imagen placeholder, comenta esa línea y crea el template más adelante en la fase 05 después de subir la primera imagen real. Pero las dependencias (MIG, healthcheck) se crean ahora.

### 13. Managed Instance Group (size=1, autoheal, stateful)

```bash
# Crear el MIG
gcloud compute instance-groups managed create forusbots-mig \
  --base-instance-name=forusbots \
  --size=1 \
  --template=forusbots-template \
  --zone=$ZONE \
  --health-check=forusbots-hc \
  --initial-delay=180

# Configurar el disco como stateful (sobrevive recreaciones)
gcloud compute instance-groups managed update forusbots-mig \
  --zone=$ZONE \
  --stateful-disk=device-name=state,auto-delete=never

# Esperar a que la instancia exista
sleep 30
INSTANCE_NAME=$(gcloud compute instance-groups managed list-instances forusbots-mig \
  --zone=$ZONE --format="value(name)" | head -1)

# Asociar el Persistent Disk a la instancia concreta
gcloud compute instance-groups managed instance-configs create forusbots-mig \
  --zone=$ZONE \
  --instance=$INSTANCE_NAME \
  --stateful-disk=device-name=state,source=projects/$PROJECT_ID/zones/$ZONE/disks/forusbots-state,mode=rw,auto-delete=never
```

### 14. Firewall (permitir HTTP entrante)

```bash
gcloud compute firewall-rules create allow-http-10000 \
  --direction=INGRESS --action=ALLOW \
  --rules=tcp:10000 \
  --target-tags=http-server \
  --description="Permitir tráfico HTTP a ForUsBots"
```

> **Si quieres restringir el acceso solo a IPs específicas** (más seguro): agrega `--source-ranges=IP1,IP2,...` al comando anterior.

### 15. Snapshot schedule diario (backup del Persistent Disk)

```bash
gcloud compute resource-policies create snapshot-schedule forusbots-daily-snapshots \
  --region=$REGION \
  --max-retention-days=14 \
  --start-time=06:00 \
  --daily-schedule \
  --on-source-disk-delete=keep-auto-snapshots

gcloud compute disks add-resource-policies forusbots-state \
  --resource-policies=forusbots-daily-snapshots \
  --zone=$ZONE
```

---

## Verificación final

```bash
# 1. APIs habilitadas
gcloud services list --enabled --filter="name:firestore.googleapis.com OR name:bigquery.googleapis.com" --format="value(name)"
# Esperado: las dos listadas

# 2. Service account existe con roles
gcloud projects get-iam-policy $PROJECT_ID --format=json | jq -r ".bindings[] | select(.members[] | contains(\"$SA_EMAIL\")) | .role" | sort
# Esperado: lista con datastore.user, bigquery.dataViewer, bigquery.jobUser, secretmanager.secretAccessor, etc.

# 3. Firestore creado
gcloud firestore databases describe --database='(default)' --format="value(type)"
# Esperado: FIRESTORE_NATIVE

# 4. BQ dataset existe
bq ls $PROJECT_ID:forusbots_analytics
# Esperado: lista de tablas (las _raw_* aparecen tras el primer write Firestore)

# 5. Secrets creados (los 4)
gcloud secrets list --format="value(name)"
# Esperado: SITE_USER, SITE_PASS, TOTP_SECRET, SHARED_TOKEN

# 6. Verificar acceso de la SA a un secret
gcloud secrets get-iam-policy SITE_USER --format=json | grep -q "$SA_EMAIL" && echo "SA puede leer secrets: OK"

# 7. Artifact Registry existe
gcloud artifacts repositories list --location=$REGION --format="value(name)"
# Esperado: forusbots

# 8. Persistent Disk existe
gcloud compute disks describe forusbots-state --zone=$ZONE --format="value(sizeGb,type)"
# Esperado: 15  pd-balanced

# 9. IP estática reservada
gcloud compute addresses describe forusbots-ip --region=$REGION --format="value(address,status)"
# Esperado: IP IN_USE (o RESERVED si aún no se asoció)

# 10. MIG existe con autoheal
gcloud compute instance-groups managed describe forusbots-mig --zone=$ZONE \
  --format="value(autoHealingPolicies[0].healthCheck,statefulPolicy.preservedState.disks)"
# Esperado: el HC referenciado + el disco "state" como stateful

# 11. Firewall abierto
gcloud compute firewall-rules describe allow-http-10000 --format="value(allowed[0].ports)"
# Esperado: ['10000']

# 12. Snapshot schedule asociado
gcloud compute disks describe forusbots-state --zone=$ZONE --format="value(resourcePolicies)"
# Esperado: incluye forusbots-daily-snapshots

# 13. Test de read de un secret desde la VM (cuando esté arriba en fase 05)
# (skip por ahora — se valida en fase 05)
```

Si TODO pasa → guarda los IDs en un archivo local (NO commiteado):

```bash
cat > .gcp-config.local <<EOF
PROJECT_ID=$PROJECT_ID
REGION=$REGION
ZONE=$ZONE
SA_EMAIL=$SA_EMAIL
STATIC_IP=$(gcloud compute addresses describe forusbots-ip --region=$REGION --format='value(address)')
ARTIFACT_REPO=$REGION-docker.pkg.dev/$PROJECT_ID/forusbots
EOF

# Asegurar que esté en gitignore
grep -q ".gcp-config.local" .gitignore || echo ".gcp-config.local" >> .gitignore
```

**Esta fase NO requiere commit de código** (no se tocó código). Solo infra.

---

## Pitfalls comunes

- **Billing no habilitado**: `gcloud projects create` puede crear el proyecto pero ningún servicio funciona hasta que linkees billing. Verifica con `gcloud billing projects describe $PROJECT_ID`.
- **Cuotas regionales**: si te dice "QUOTA_EXCEEDED" para `IN_USE_ADDRESSES` o `CPUS`, pide aumento en `gcloud compute project-info describe`. Tu cuenta nueva puede tener límites bajos.
- **Firebase CLI vs gcloud CLI**: la extensión Firestore→BQ se instala con `firebase ext:install`, no con `gcloud`. Si te aparece "command not found", `npm install -g firebase-tools && firebase login`.
- **Imagen placeholder**: si el `instance-templates create-with-container` falla porque la imagen no existe, comenta el `--container-image` y créalo en fase 05 después de subir la imagen real. El MIG fallará un boot pero se recupera al actualizar el template.
- **Region mismatch**: TODO debe estar en la misma región (`us-central1`). Si pones Firestore en una región y BQ en otra, la extensión no replica.

---

## Salida que debe ver la fase 04

- `.gcp-config.local` existe con `PROJECT_ID`, `STATIC_IP`, etc.
- `gcloud firestore databases list` muestra el database
- `bq ls forusbots_analytics` muestra el dataset (las tablas `_raw_*` aparecerán al hacer el primer write desde código)
- 4 secretos en Secret Manager
- MIG existe (aunque la VM esté en estado de error por la imagen placeholder — eso se arregla en fase 05)

Si todo eso pasa, procede a [04-firestore-data-layer.md](./04-firestore-data-layer.md).

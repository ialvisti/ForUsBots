#!/usr/bin/env bash
set -euo pipefail

# Cloud Monitoring setup for ForUsBots.
# Idempotent: re-running is safe. Creates log-based metrics + alert policies.
#
# Required env (with defaults):
#   PROJECT_ID  — GCP project (default: forusbots)
#   EMAIL       — email for notification channel (default: ivan.alvis@forusall.com)

PROJECT_ID="${PROJECT_ID:-forusbots}"
EMAIL="${EMAIL:-ivan.alvis@forusall.com}"

echo "Project: $PROJECT_ID"
echo "Email:   $EMAIL"
echo ""

# ---------- 1. Notification channel (reuse if exists, create otherwise) ----------
echo "→ Notification channel"
CHANNEL=$(gcloud beta monitoring channels list \
  --project="$PROJECT_ID" \
  --filter="labels.email_address=\"$EMAIL\" AND type=\"email\"" \
  --format="value(name)" | head -1)

if [[ -z "$CHANNEL" ]]; then
  CHANNEL=$(gcloud beta monitoring channels create \
    --project="$PROJECT_ID" \
    --display-name="ForUsBots Alerts (email)" \
    --type=email \
    --channel-labels="email_address=$EMAIL" \
    --format="value(name)" 2>&1 | grep -o 'projects/[^]]*notificationChannels/[0-9]*')
  echo "  created: $CHANNEL"
else
  echo "  reused:  $CHANNEL"
fi
echo ""

# ---------- 2. Log-based metrics ----------
ensure_counter_metric() {
  local name="$1" desc="$2" filter="$3"
  if gcloud logging metrics describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "  metric '$name' already exists — skipping create"
    return
  fi
  gcloud logging metrics create "$name" \
    --project="$PROJECT_ID" \
    --description="$desc" \
    --log-filter="$filter"
  echo "  metric '$name' created"
}

ensure_distribution_metric() {
  local name="$1" desc="$2" filter="$3" extractor="$4"
  if gcloud logging metrics describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "  metric '$name' already exists — skipping create"
    return
  fi
  local tmp
  tmp=$(mktemp)
  cat > "$tmp" <<EOF
description: "$desc"
filter: |
  $filter
valueExtractor: "$extractor"
metricDescriptor:
  metricKind: DELTA
  valueType: DISTRIBUTION
  unit: "ms"
bucketOptions:
  exponentialBuckets:
    numFiniteBuckets: 64
    growthFactor: 2.0
    scale: 0.01
EOF
  gcloud logging metrics create "$name" \
    --project="$PROJECT_ID" \
    --config-from-file="$tmp"
  rm -f "$tmp"
  echo "  metric '$name' created"
}

echo "→ Log-based metrics"
ensure_counter_metric \
  "forusbots_job_failed" \
  "ForUsBots: count of job.failed events" \
  'resource.type="gce_instance" AND jsonPayload.service="forusbots" AND jsonPayload.type="job.failed"'

ensure_counter_metric \
  "forusbots_job_succeeded" \
  "ForUsBots: count of job.succeeded events" \
  'resource.type="gce_instance" AND jsonPayload.service="forusbots" AND jsonPayload.type="job.succeeded"'

ensure_distribution_metric \
  "forusbots_http_durMs" \
  "ForUsBots: HTTP request duration in ms (distribution)" \
  'resource.type="gce_instance" AND jsonPayload.service="forusbots" AND jsonPayload.type="http.response" AND jsonPayload.durMs>0' \
  'EXTRACT(jsonPayload.durMs)'
echo ""

# ---------- 3. Alert policies ----------
ensure_policy() {
  local display="$1" yaml="$2"
  local existing
  existing=$(gcloud monitoring policies list \
    --project="$PROJECT_ID" \
    --filter="displayName=\"$display\"" \
    --format="value(name)" | head -1)
  if [[ -n "$existing" ]]; then
    echo "  policy '$display' already exists — skipping create ($existing)"
    return
  fi
  echo "$yaml" | gcloud monitoring policies create --project="$PROJECT_ID" --policy-from-file=- >/dev/null
  echo "  policy '$display' created"
}

echo "→ Alert policies"

# Policy 1: failed jobs > 5 in 1h
ensure_policy "ForUsBots: jobs failed > 5 in 1h" "$(cat <<EOF
displayName: "ForUsBots: jobs failed > 5 in 1h"
combiner: OR
enabled: true
notificationChannels:
  - $CHANNEL
conditions:
  - displayName: "Failed jobs > 5 in 1h"
    conditionThreshold:
      filter: 'resource.type="gce_instance" AND metric.type="logging.googleapis.com/user/forusbots_job_failed"'
      aggregations:
        - alignmentPeriod: 3600s
          perSeriesAligner: ALIGN_SUM
      comparison: COMPARISON_GT
      thresholdValue: 5
      duration: 0s
EOF
)"

# Policy 2: no jobs succeeded in last 30 min
# NOTE: With low traffic (~10 jobs/30d), this WILL fire frequently. Tune the
# alignmentPeriod up (e.g. 21600s = 6h) once you've calibrated to real volume.
ensure_policy "ForUsBots: no jobs succeeded in 30m" "$(cat <<EOF
displayName: "ForUsBots: no jobs succeeded in 30m"
combiner: OR
enabled: true
notificationChannels:
  - $CHANNEL
conditions:
  - displayName: "Succeeded jobs absent for 30m"
    conditionAbsent:
      filter: 'resource.type="gce_instance" AND metric.type="logging.googleapis.com/user/forusbots_job_succeeded"'
      aggregations:
        - alignmentPeriod: 1800s
          perSeriesAligner: ALIGN_SUM
      duration: 1800s
EOF
)"

# Policy 3: HTTP request p95 latency > 60s
# Uses HTTP durMs (not run_ms) since run_ms isn't a top-level field in job logs.
ensure_policy "ForUsBots: HTTP p95 latency > 60s" "$(cat <<EOF
displayName: "ForUsBots: HTTP p95 latency > 60s"
combiner: OR
enabled: true
notificationChannels:
  - $CHANNEL
conditions:
  - displayName: "P95(durMs) > 60000 over 10m"
    conditionThreshold:
      filter: 'resource.type="gce_instance" AND metric.type="logging.googleapis.com/user/forusbots_http_durMs"'
      aggregations:
        - alignmentPeriod: 600s
          perSeriesAligner: ALIGN_PERCENTILE_95
      comparison: COMPARISON_GT
      thresholdValue: 60000
      duration: 0s
EOF
)"
echo ""

# ---------- 4. Summary ----------
echo "Done. Current policies:"
gcloud monitoring policies list \
  --project="$PROJECT_ID" \
  --filter='displayName:"ForUsBots"' \
  --format="table(displayName,enabled)"

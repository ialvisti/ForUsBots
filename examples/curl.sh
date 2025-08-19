#!/usr/bin/env bash
set -euo pipefail

# ============================================
# Config (robusta para set -u)
# ============================================
: "${HOST:=http://localhost:10000}"
: "${SHARED_TOKEN:=}"
: "${TOKEN:=${SHARED_TOKEN:-bomboclat}}"
: "${FILE:=./presentation.pdf}"
: "${BASE:=/forusbot}"
: "${SERVICE:=vault-file-upload}"

ENDPOINT="${HOST}${BASE}/${SERVICE}"
HEALTH_URL="${HOST}${BASE}/health"
STATUS_URL="${HOST}${BASE}/status"

# ============================================
# Helpers HTTP
# ============================================
curl_send() {
  # Requiere que $META esté definido (JSON en UNA sola línea)
  if [[ ! -f "$FILE" ]]; then
    echo "⚠️  Archivo no encontrado: $FILE" >&2
    exit 1
  fi
  curl -sS -X POST "$ENDPOINT" \
    -H "x-auth-token: $TOKEN" \
    -H "x-filename: $(basename "$FILE")" \
    -H "Content-Type: application/octet-stream" \
    -H "x-meta: $META" \
    --data-binary @"$FILE" \
  | if command -v jq >/dev/null; then
      jq '{ok, jobId, acceptedAt, queuePosition, estimate, capacitySnapshot}'
    else
      cat
    fi
}

health() {
  curl -sS "$HEALTH_URL" | if command -v jq >/dev/null; then jq .; else cat; fi
}

# Enviar con nombre de archivo personalizado (header x-filename) + meta inline
curl_send_named() {
  local FNAME="$1"; shift
  local META_INLINE="$1"; shift || true

  if [[ ! -f "$FILE" ]]; then
    echo "⚠️  Archivo no encontrado: $FILE" >&2
    exit 1
  fi

  curl -sS -X POST "$ENDPOINT" \
    -H "x-auth-token: $TOKEN" \
    -H "x-filename: ${FNAME}" \
    -H "Content-Type: application/octet-stream" \
    -H "x-meta: ${META_INLINE}" \
    --data-binary @"$FILE" \
  | if command -v jq >/dev/null; then
      jq '{ok, jobId, acceptedAt, queuePosition, estimate, capacitySnapshot}'
    else
      cat
    fi
}

# GET /forusbot/jobs/:id
jobs_get() {
  local JID="$1"
  curl -sS -H "x-auth-token: $TOKEN" "${HOST}${BASE}/jobs/${JID}" \
  | if command -v jq >/dev/null; then
      jq '{ok, jobId, state, acceptedAt, startedAt, finishedAt, error, result, waitingSeconds, elapsedSeconds, totalSeconds, stage, stageSeconds, stageMeta}'
    else
      cat
    fi
}

# GET /forusbot/jobs (listar)
jobs_list() {
  local STATE="${1:-all}"
  local LIMIT="${2:-50}"
  local OFFSET="${3:-0}"
  local BOT="${4:-}"
  local URL="${HOST}${BASE}/jobs?state=${STATE}&limit=${LIMIT}&offset=${OFFSET}"
  if [[ -n "$BOT" ]]; then URL="${URL}&botId=${BOT}"; fi
  curl -sS -H "x-auth-token: $TOKEN" "$URL" \
  | if command -v jq >/dev/null; then jq .; else cat; fi
}

# DELETE /forusbot/jobs/:id (cancelar)
jobs_cancel() {
  local JID="$1"
  curl -sS -X DELETE -H "x-auth-token: $TOKEN" "${HOST}${BASE}/jobs/${JID}" \
  | if command -v jq >/dev/null; then jq .; else cat; fi
}

# GET /forusbot/status
status() {
  curl -sS "$STATUS_URL" | if command -v jq >/dev/null; then jq .; else cat; fi
}

# GET /forusbot/locks
locks() {
  curl -sS -H "x-auth-token: $TOKEN" "${HOST}${BASE}/locks" \
  | if command -v jq >/dev/null; then jq .; else cat; fi
}

# GET /forusbot/settings
settings_get() {
  curl -sS -H "x-auth-token: $TOKEN" "${HOST}${BASE}/settings" \
  | if command -v jq >/dev/null; then jq .; else cat; fi
}

# PATCH /forusbot/settings
settings_patch() {
  # usage: settings_patch 5  (cambia maxConcurrency a 5)
  local MC="${1:-}"
  local BODY
  if [[ -n "$MC" ]]; then
    BODY=$(jq -c -n --argjson mc "$MC" '{maxConcurrency: $mc}')
  else
    BODY='{}'
  fi
  curl -sS -X PATCH -H "x-auth-token: $TOKEN" -H "Content-Type: application/json" \
    -d "$BODY" "${HOST}${BASE}/settings" \
  | if command -v jq >/dev/null; then jq .; else cat; fi
}

# GET /forusbot/metrics
metrics() {
  curl -sS -H "x-auth-token: $TOKEN" "${HOST}${BASE}/metrics" \
  | if command -v jq >/dev/null; then jq .; else cat; fi
}

# GET /forusbot/version
version() {
  curl -sS -H "x-auth-token: $TOKEN" "${HOST}${BASE}/version" \
  | if command -v jq >/dev/null; then jq .; else cat; fi
}

# GET /forusbot/openapi
openapi() {
  curl -sS -H "x-auth-token: $TOKEN" "${HOST}${BASE}/openapi"
}

# ============================================
# Generadores de x-meta (fechas SIEMPRE en 1333)
# ============================================
make_meta() {
  # usage: make_meta "1333-01-05" "Recordkeeper Agreement"
  local DATE="$1"
  local CAPTION="${2:-Recordkeeper Agreement}"
  printf '{"planId":580,"formData":{"section":"CONTRACTS & AGREEMENTS","caption":"%s","status":"Audit Ready","effectiveDate":"%s"}}' "$CAPTION" "$DATE"
}

make_meta_other() {
  # usage: make_meta_other "1333-02-07" "Mi titulo personalizado 1333"
  local DATE="$1"
  local CUSTOM="$2"
  printf '{"planId":580,"formData":{"section":"PLAN DOCUMENTS","caption":"Other","captionOtherText":"%s","status":"Audit Ready","effectiveDate":"%s"}}' "$CUSTOM" "$DATE"
}

# ============================================
# Atajos para disparar con nombre + fecha 1333
# ============================================
fire_one() {
  # usage: fire_one "doc-1333-01-05-A.pdf" "1333-01-05" [caption]
  local FNAME="$1"; local DATE="$2"; local CAP="${3:-Recordkeeper Agreement}"
  local META_INLINE; META_INLINE="$(make_meta "$DATE" "$CAP")"
  curl_send_named "$FNAME" "$META_INLINE"
}

fire_one_other() {
  # usage: fire_one_other "doc-1333-02-07-X.pdf" "1333-02-07" "Custom caption 1333"
  local FNAME="$1"; local DATE="$2"; local CUSTOM="$3"
  local META_INLINE; META_INLINE="$(make_meta_other "$DATE" "$CUSTOM")"
  curl_send_named "$FNAME" "$META_INLINE"
}

# Watch del estado cada 2s (N veces)
watch_status() {
  local N="${1:-15}"
  for ((i=1;i<=N;i++)); do
    echo "— status $i —"
    status
    sleep 2
  done
}

# Polling de un job hasta terminar
poll_job() {
  local JID="$1"
  local i=0
  while true; do
    i=$((i+1))
    echo "— poll $i —"
    local js
    js="$(jobs_get "$JID")"
    echo "$js"
    # termina si succeeded o failed o canceled
    if echo "$js" | grep -q '"state": *"succeeded"'; then break; fi
    if echo "$js" | grep -q '"state": *"failed"'; then break; fi
    if echo "$js" | grep -q '"state": *"canceled"'; then break; fi
    sleep 2
  done
}

# Dispara un job y hace polling
test_202_and_poll() {
  local out; out="$(fire_one "doc-1333-06-15-Z.pdf" "1333-06-15" "Recordkeeper Agreement")"
  echo "$out"
  local jid; jid="$(echo "$out" | jq -r '.jobId')"
  [ -z "$jid" ] && { echo "No jobId"; return 1; }
  poll_job "$jid"
}

# ============================================
# Casos Felices (1.*) – (legacy 1700s; se mantienen)
# ============================================
test_1A() { META='{"planId":580,"formData":{"section":"CONTRACTS & AGREEMENTS","caption":"Recordkeeper Agreement","status":"Audit Ready","effectiveDate":"1705-05-02"}}'; curl_send; }
test_1B() { META='{"planId":580,"formData":{"section":"CONTRACTS & AGREEMENTS","caption":"Sponsor Fee Disclosure","status":"Audit Ready","effectiveDate":"1705-06-01"}}'; curl_send; }
test_1C() { META='{"planId":580,"formData":{"section":"CONTRACTS & AGREEMENTS","caption":"ADV Part II","status":"Document Missing","effectiveDate":"1704-12-31"}}'
  curl -i -sS -X POST "$ENDPOINT" -H "x-auth-token: $TOKEN" -H "x-filename: $(basename "$FILE")" -H "Content-Type: application/octet-stream" -H "x-meta: $META" --data-binary @"$FILE"; }
test_1D() { META='{"planId":580,"formData":{"section":"CONTRACTS & AGREEMENTS","caption":"3(16) Contract","status":"Audit Ready","effectiveDate":"1705-01-15"}}'; curl_send; }
test_1E() { META='{"planId":580,"formData":{"section":"CONTRACTS & AGREEMENTS","caption":"Plan Service Agreement","status":"Audit Ready","effectiveDate":"1703-09-30"}}'; curl_send; }

# ============================================
# “Other” (2.*)
# ============================================
test_2A_other_ok() { META='{"planId":580,"formData":{"section":"PLAN DOCUMENTS","caption":"Other","captionOtherText":"Mi título personalizado – 1705","status":"Audit Ready","effectiveDate":"1705-05-02"}}'; curl_send; }
test_2B_other_sin_texto_400() {
  META='{"planId":580,"formData":{"section":"PLAN DOCUMENTS","caption":"Other","status":"Audit Ready","effectiveDate":"1705-05-02"}}'
  curl -i -sS -X POST "$ENDPOINT" -H "x-auth-token: $TOKEN" -H "x-filename: $(basename "$FILE")" -H "Content-Type: application/octet-stream" -H "x-meta: $META" --data-binary @"$FILE"
}
test_2C_other_texto_ignorarse_warning() { META='{"planId":580,"formData":{"section":"CONTRACTS & AGREEMENTS","caption":"Recordkeeper Agreement","captionOtherText":"Ignorar este texto","status":"Audit Ready","effectiveDate":"1705-05-02"}}'; curl_send; }

# ============================================
# Validaciones / Errores (3.*)
# ============================================
test_3A_token_incorrecto_401() {
  META='{"planId":580,"formData":{"section":"CONTRACTS & AGREEMENTS","caption":"Recordkeeper Agreement","status":"Audit Ready","effectiveDate":"1705-05-02"}}'
  curl -i -sS -X POST "$ENDPOINT" -H 'x-auth-token: wrong-token' -H "x-filename: $(basename "$FILE")" -H 'Content-Type: application/octet-stream' -H "x-meta: $META" --data-binary @"$FILE"
}
test_3B_meta_invalido_400() {
  curl -i -sS -X POST "$ENDPOINT" -H "x-auth-token: $TOKEN" -H "x-filename: $(basename "$FILE")" -H "Content-Type: application/octet-stream" \
    -H 'x-meta: {"planId":580,"formData":{"section":"CONTRACTS & AGREEMENTS","caption":"Recordkeeper Agreement","status":"Audit Ready","effectiveDate":"1705-05-02"}' \
    --data-binary @"$FILE"
}
test_3C_falta_status_400() {
  META='{"planId":580,"formData":{"section":"CONTRACTS & AGREEMENTS","caption":"Recordkeeper Agreement","status":"","effectiveDate":"1705-05-02"}}'
  curl -i -sS -X POST "$ENDPOINT" -H "x-auth-token: $TOKEN" -H "x-filename: $(basename "$FILE")" -H "Content-Type: application/octet-stream" -H "x-meta: $META" --data-binary @"$FILE"
}
test_3D_sin_binario_400() {
  META='{"planId":580,"formData":{"section":"CONTRACTS & AGREEMENTS","caption":"Recordkeeper Agreement","status":"Audit Ready","effectiveDate":"1705-05-02"}}'
  curl -i -sS -X POST "$ENDPOINT" -H "x-auth-token: $TOKEN" -H "x-filename: no-body.pdf" -H "Content-Type: application/octet-stream" -H "x-meta: $META"
}

# ============================================
# Variaciones (4.*)
# ============================================
test_4B_fechas_limite() {
  echo "— 31 de enero —"
  META='{"planId":580,"formData":{"section":"CONTRACTS & AGREEMENTS","caption":"Recordkeeper Agreement","status":"Audit Ready","effectiveDate":"1705-01-31"}}'
  curl_send
  echo "— 29 de febrero 1704 —"
  META='{"planId":580,"formData":{"section":"CONTRACTS & AGREEMENTS","caption":"Recordkeeper Agreement","status":"Audit Ready","effectiveDate":"1704-02-29"}}'
  curl_send
}

# ============================================
# Robustez/UX (5.*)
# ============================================
test_5A_caption_invalido() { META='{"planId":580,"formData":{"section":"CONTRACTS & AGREEMENTS","caption":"Not A Real Caption","status":"Audit Ready","effectiveDate":"1705-05-02"}}'; curl_send; }
test_5B_section_invalida() { META='{"planId":580,"formData":{"section":"WRONG SECTION","caption":"Recordkeeper Agreement","status":"Audit Ready","effectiveDate":"1705-05-02"}}'; curl_send; }
test_5C_other_caption_largo() {
  long="Este es un caption personalizado extremadamente largo para validar longitudes y edge cases – $(date +%s)"
  META=$(jq -c -n --arg t "$long" '{"planId":580,"formData":{"section":"PLAN DOCUMENTS","caption":"Other","captionOtherText":$t,"status":"Audit Ready","effectiveDate":"1705-05-02"}}' | tr -d '\n')
  curl_send
}

# ============================================
# Cola / Concurrencia (fechas 1333 y nombres distintos)
# ============================================
test_q_fire5_parallel() {
  fire_one       "doc-1333-01-05-A.pdf" "1333-01-05" "Recordkeeper Agreement" &
  fire_one       "doc-1333-02-07-B.pdf" "1333-02-07" "Sponsor Fee Disclosure" &
  fire_one       "doc-1333-03-09-C.pdf" "1333-03-09" "ADV Part II" &
  fire_one_other "doc-1333-04-11-D.pdf" "1333-04-11" "Mi título personalizado 1333 D" &
  fire_one       "doc-1333-05-13-E.pdf" "1333-05-13" "Plan Service Agreement" &
  wait
}

test_q_fire5_and_watch() {
  ( test_q_fire5_parallel ) &   # dispara en background
  watch_status 20               # observa el estado ~40s
  wait
}

test_q_status() { status; }

# ============================================
# Ayuda
# ============================================
list() {
  declare -F | awk '{print $3}' | grep -E '^test_|^health$|^jobs_|^locks$|^settings_|^metrics$|^version$|^openapi$' | sort
}

usage() {
  cat <<EOF
Uso:
  chmod +x ./examples/curl.sh
  FILE=./presentation.pdf TOKEN=dev-secret HOST=http://localhost:10000 \\
    ./examples/curl.sh <función>

Funciones disponibles:
$(list | sed 's/^/  - /')

Notas:
- El header x-meta debe ser JSON en UNA sola línea.
- El body es binario (usa --data-binary @archivo).
- Endpoints:
    GET  \$HOST${BASE}/health
    GET  \$HOST${BASE}/status
    GET  \$HOST${BASE}/jobs
    GET  \$HOST${BASE}/jobs/:id
    DELETE \$HOST${BASE}/jobs/:id
    GET  \$HOST${BASE}/locks
    GET  \$HOST${BASE}/settings
    PATCH \$HOST${BASE}/settings
    GET  \$HOST${BASE}/metrics
    GET  \$HOST${BASE}/version
    GET  \$HOST${BASE}/openapi
    POST \$HOST${BASE}/${SERVICE}   (202 Accepted)
EOF
}

# ============================================
# Dispatcher (debe ir al FINAL)
# ============================================
if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

case "$1" in
  health|test_*|list|jobs_get|jobs_list|jobs_cancel|locks|settings_get|settings_patch|metrics|version|openapi|poll_job|watch_status) "$1" "$2" "${3:-}" "${4:-}" ;;
  *) usage; exit 1 ;;
esac

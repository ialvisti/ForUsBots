#!/usr/bin/env bash
# scripts/test-public-shape.sh
#
# Smoke test del shape público del endpoint /forusbot/jobs/:id.
# Encola un scrape-participant, hace polling, y valida que el payload
# sea minimalista (sin jobId, botId, meta, stages, createdBy, timestamps).
#
# Uso:
#   BASE=http://localhost:10000 TOKEN=secret PARTICIPANT_ID=158948 \
#     bash scripts/test-public-shape.sh
set -e

BASE="${BASE:-http://localhost:10000}"
TOKEN="${TOKEN:-}"
PARTICIPANT_ID="${PARTICIPANT_ID:-158948}"

if [[ -z "$TOKEN" ]]; then
  echo "TOKEN env var is required" >&2
  exit 2
fi

# 1) Encolar
JOB=$(curl -sS -X POST "$BASE/forusbot/scrape-participant" \
  -H "x-auth-token: $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"participantId\":\"$PARTICIPANT_ID\",\"modules\":[{\"key\":\"census\"}]}" \
  | jq -r .jobId)

if [[ -z "$JOB" || "$JOB" == "null" ]]; then
  echo "Could not enqueue job" >&2
  exit 3
fi

echo "Enqueued jobId=$JOB"

# 2) Polling
RESP=""
for _ in $(seq 1 60); do
  RESP=$(curl -sS "$BASE/forusbot/jobs/$JOB" -H "x-auth-token: $TOKEN")
  STATE=$(echo "$RESP" | jq -r .state)
  if [[ "$STATE" == "succeeded" || "$STATE" == "failed" || "$STATE" == "canceled" ]]; then
    break
  fi
  sleep 2
done

echo "Final response:"
echo "$RESP" | jq .

# 3) Validate public shape — leaked internal keys cause failure
echo "$RESP" | jq -e '
  .state == "succeeded"
  and has("data")
  and (.data | has("participantId"))
  and (has("jobId") | not)
  and (has("botId") | not)
  and (has("meta") | not)
  and (has("stages") | not)
  and (has("createdBy") | not)
  and (has("acceptedAt") | not)
  and (has("startedAt") | not)
  and (has("finishedAt") | not)
  and (has("totalSeconds") | not)
  and (has("rawResult") | not)
  and (has("stagesSummaryMsByName") | not)
' >/dev/null && echo "✓ Public shape OK" || (echo "✗ Public shape FAILED"; exit 1)

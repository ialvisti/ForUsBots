#!/usr/bin/env bash
set -euo pipefail

# Simple healthcheck script for Docker/Render.
# It tries both /health and /forusbot/health and exits 0 on success.

PORT="${PORT:-10000}"
HOST="http://127.0.0.1:${PORT}"

urls=(
  "${HOST}/health"
  "${HOST}/forusbot/health"
)

for u in "${urls[@]}"; do
  if curl -fsS --max-time 3 "$u" | grep -q '"ok": *true'; then
    exit 0
  fi
done

# If none returned ok:true, mark container unhealthy
exit 1

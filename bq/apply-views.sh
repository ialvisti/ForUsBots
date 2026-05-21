#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-forusbots}"
DATASET="${DATASET:-forusbots_analytics}"
VIEWS_DIR="$(cd "$(dirname "$0")" && pwd)/views"

echo "Applying views in $VIEWS_DIR to ${PROJECT_ID}:${DATASET}"

shopt -s nullglob
files=("$VIEWS_DIR"/v_*.sql)
if (( ${#files[@]} == 0 )); then
  echo "No views found in $VIEWS_DIR" >&2
  exit 1
fi

for sql in "${files[@]}"; do
  name=$(basename "$sql" .sql)
  echo "→ $name"
  bq query \
    --project_id="$PROJECT_ID" \
    --use_legacy_sql=false \
    --quiet \
    < "$sql"
done

echo ""
echo "Done. Views in ${PROJECT_ID}:${DATASET}:"
bq ls --project_id="$PROJECT_ID" --format=pretty "$DATASET" | grep -E '^\| +v_' || true

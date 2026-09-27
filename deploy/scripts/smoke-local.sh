#!/usr/bin/env bash
# Local smoke checks for Update Me (does NOT hit production).
set -euo pipefail
API="${API_BASE:-http://localhost:5000/api/v1}"
WEB="${WEB_BASE:-http://localhost:3000}"
failed=0

check() {
  local name="$1" url="$2" expect="${3:-200}"
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url" || true)
  if [[ "$code" == "$expect" ]]; then
    echo "${name}=PASS status=${code}"
  else
    echo "${name}=FAIL status=${code}"
    failed=$((failed + 1))
  fi
}

check live "$API/health/live"
check ready "$API/health/ready"
status=$(curl -fsS "$API/health" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p' | head -1)
echo "health_status=${status}"
[[ "$status" == "unhealthy" ]] && failed=$((failed + 1))

rid=$(curl -fsSI -H 'X-Request-Id: smoke-local-001' "$API/health/live" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-request-id"{print $2}')
echo "request_id=${rid}"

check landing "$WEB/"
check manifest "$WEB/manifest.webmanifest"
check sw "$WEB/sw.js"
check explore "$WEB/explore"
check traffic "$WEB/traffic"

echo "smoke_failed_count=${failed}"
exit "$failed"

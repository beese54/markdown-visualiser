#!/usr/bin/env bash
# Drive the real app in Chromium against the running container.
#
# Each drive runs in a sibling container that shares the app's network
# namespace, so the app is reachable at 127.0.0.1 - Chromium silently upgrades
# http:// to https:// for any other hostname, which a plain-HTTP container
# cannot answer.
#
#   ./run.sh            all drives
#   ./run.sh reader     one drive by name (ingest|reader|export|adversarial)
set -euo pipefail

CONTAINER="${CONTAINER:-markdown_visualiser-app-1}"
IMAGE="${IMAGE:-markdown-visualiser:local}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/shots"

# Docker on Windows needs a drive-letter path for -v, but Git Bash reports a
# POSIX one and rewrites bare backslashes on the way to the exe. `cygpath -m`
# gives the mixed form - C:/Users/... - which both accept unchanged.
host_path() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$1"
  else
    printf '%s' "$1"
  fi
}

only="${1:-all}"
mkdir -p "$OUT"

# Resolved once, so every docker invocation below mounts the same way.
DRIVE_MOUNT="$(host_path "$HERE")"
OUT_MOUNT="$(host_path "$OUT")"

echo "==> regenerating fixtures"
node "$HERE/make-fixtures.mjs"

# The script is copied into /app so Node resolves playwright-core from the
# image's own node_modules rather than from the read-only mount.
drive() {
  local name="$1" script="$2" args="${3:-}"
  if [ "$only" != "all" ] && [ "$only" != "$name" ]; then return 0; fi
  echo
  echo "==> $name"
  docker run --rm \
    --network "container:${CONTAINER}" \
    --ipc=host --init \
    -v "${DRIVE_MOUNT}:/drive:ro" \
    -v "${OUT_MOUNT}:/out" \
    --entrypoint sh "${IMAGE}" \
    -c "cp /drive/${script} /app/run.mjs && cd /app && node run.mjs http://127.0.0.1:8080 /drive/fixtures.json ${args}"
}

drive ingest      drive.mjs
drive reader      drive-reader.mjs
drive export      drive-export.mjs /out
drive shots       shots.mjs        /out

if [ "$only" = "all" ] || [ "$only" = "adversarial" ]; then
  echo
  echo "==> adversarial"
  docker run --rm \
    --network "container:${CONTAINER}" \
    --ipc=host --init \
    -v "${DRIVE_MOUNT}:/drive:ro" \
    --entrypoint sh "${IMAGE}" \
    -c "cd /app && node /drive/adversarial.mjs http://127.0.0.1:8080"
fi

echo
echo "All drives passed."

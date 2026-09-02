#!/usr/bin/env bash
# Drive the real app in Chromium inside a sibling container.
#
# Runs against the running compose service, sharing its network namespace so
# the app is reachable at 127.0.0.1 - Chromium silently upgrades http:// to
# https:// for any other hostname, which a plain-HTTP container cannot answer.
set -euo pipefail

CONTAINER="${CONTAINER:-markdown_visualiser-app-1}"
IMAGE="${IMAGE:-markdown-visualiser:local}"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "==> regenerating fixtures.json"
node "$HERE/make-fixtures.mjs"

echo "==> driving $CONTAINER"
# The script is copied into /app so Node resolves playwright-core from the
# image's own node_modules rather than from the read-only mount.
docker run --rm \
  --network "container:${CONTAINER}" \
  --ipc=host --init \
  -v "${HERE}:/drive:ro" \
  --entrypoint sh "${IMAGE}" \
  -c 'cp /drive/drive.mjs /app/drive.mjs && cd /app && node drive.mjs http://127.0.0.1:8080 /drive/fixtures.json'

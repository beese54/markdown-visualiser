# ADR-007: Official Playwright runtime image, run as non-root

## Status

Accepted

## Context

The print service needs Chromium and its OS dependencies in the container, and it renders untrusted HTML.

## Options Considered

- Official Playwright image with `playwright-core` installed separately.
- A slim Node image with `playwright install --with-deps chromium`.

## Decision

The runtime stage uses `mcr.microsoft.com/playwright:v1.62.1-noble`. `playwright-core` is pinned to the same version. The image runs as `pwuser`.

## Rationale

`Dockerfile` comments: the image ships Chromium and dependencies but not the npm package, and the versions must match or the executable lookup breaks. The image defaults to root, which disables the Chromium sandbox, so the service does not run as root. The slim-base alternative was deferred so the browser was proven working first (`tasks/todo.md`).

## Consequences

- The image is about 3.63 GB, since three browsers ship and one is used. The slim alternative is a recorded, unstarted follow-up.
- Upgrades must change the pin and the tag together.
- The hardening in `docker-compose.yml` applies: read-only root, `/tmp` tmpfs, `cap_drop: ALL`, `no-new-privileges`, `ipc: host` and `init: true` for Chromium stability.

## Related Components

`Dockerfile`, `docker-compose.yml`, `package.json`, [DEPLOYMENT.md](../DEPLOYMENT.md)

<!-- sources: Dockerfile, docker-compose.yml, package.json, tasks/todo.md -->

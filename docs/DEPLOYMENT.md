# Deployment

> How the system is built, configured and deployed, and how to roll back.

## Environments

- **Local development:** Vite dev server (`npm run dev`) for the client and `npm run dev:server` (`tsx watch server/index.ts`) for the server.
- **Local container:** `docker compose up --build`, serving on `http://localhost:8080`, bound to `127.0.0.1`. The image is tagged `markdown-visualiser:local`.
- **Staging / production:** none are defined in the repository. Where and how it is hosted: uncertain — verify with developer.
- **CI:** the only workflow is `docforge.yml` (documentation checks and manual build). There is no build, test or deploy pipeline for the application: uncertain — verify with developer.

The dev-server proxy from Vite to the print service was not checked (`vite.config.ts` was not read), so PDF export in `npm run dev` may need the container: uncertain — verify with developer.

<!-- sources: package.json, docker-compose.yml, .github/workflows/docforge.yml -->

## Build

`npm run build` runs `vite build` (client into `dist/`) and then `esbuild` to bundle `server/index.ts` into `dist-server/index.js`. It targets Node 20, ESM, and keeps packages external, so `node_modules` must exist at runtime.

The `Dockerfile` has two stages:

1. `build` (`node:24-bookworm-slim`): `npm ci`, then `npm run typecheck && npm run build`. A type error fails the image build.
2. `runtime` (`mcr.microsoft.com/playwright:v1.62.1-noble`): `npm ci --omit=dev`, then copies `dist/` and `dist-server/` and switches to user `pwuser`.

`playwright-core` is pinned to exactly `1.62.1` in `package.json` to match the image tag. The pin and the tag must move together.

`init.sh` runs the full local bootstrap: it checks Node 20 or later, runs `npm ci`, vendors design skills, typechecks, builds and runs tests.

The runtime image is about 3.63 GB, because the base ships three browsers and only Chromium is used. Slimming it is a recorded but unstarted follow-up (`tasks/todo.md`).

<!-- sources: package.json, Dockerfile, init.sh, tasks/todo.md -->

## Deploy

Local and single-host:

```bash
docker compose up --build -d
curl -sf localhost:8080/healthz
```

Compose builds the `runtime` target and runs it with `read_only: true`, a 512 MB `/tmp` tmpfs, `ipc: host`, `init: true`, `cap_drop: ALL`, `no-new-privileges`, `mem_limit: 2g`, `pids_limit: 512` and `restart: unless-stopped`.

Do not publish port 8080 beyond loopback without putting access control in front of it. The service has no authentication and renders posted HTML in a headless browser (see [SECURITY.md](SECURITY.md)).

No registry push, orchestration manifests or hosted deployment steps exist in the repository.

<!-- sources: docker-compose.yml, Dockerfile -->

## Configuration

| Variable | Default | Set by | Meaning |
|---|---|---|---|
| `PORT` | `8080` | Dockerfile | Listen port |
| `HOST` | `0.0.0.0` | Dockerfile | Listen address inside the container |
| `STATIC_ROOT` | `/app/dist` in the image | Dockerfile | Directory served as the SPA |
| `LOG_LEVEL` | `info` | Compose | Fastify/Pino log level |
| `NODE_ENV` | `production` | Dockerfile, Compose | Standard |

There are no secrets and no config files. Limits (upload caps, body limit, timeouts, concurrency) are code constants. See [DESIGN.md](DESIGN.md#configuration-strategy).

The `HEALTHCHECK` fetches `http://127.0.0.1:8080/healthz` every 30 s (20 s start period, 3 retries), so it assumes the default port. Changing `PORT` without changing the health check makes the container report unhealthy.

<!-- sources: server/index.ts, Dockerfile, docker-compose.yml -->

## Rollback

The application is stateless, so rollback means running the previous image. Nothing needs undoing in a database or volume.

Because the only image tag defined is `markdown-visualiser:local`, a rebuild overwrites it. To keep a rollback target, tag the working image (for example `docker tag markdown-visualiser:local markdown-visualiser:<version>`) before rebuilding. Alternatively check out the previous commit and run `docker compose up --build -d`. No release tagging or registry process is defined: uncertain — verify with developer.

<!-- sources: docker-compose.yml, Dockerfile -->

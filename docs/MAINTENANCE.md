# Maintenance

> Written for the engineer who inherits this system.

## Starting and Stopping

- Start: `docker compose up --build -d`. Stop: `docker compose down`.
- The server handles `SIGTERM` and `SIGINT` by closing Fastify, then closing Chromium, then exiting 0. `docker stop` therefore shuts down cleanly.
- Chromium is launched lazily on the first PDF request, not at startup. `GET /healthz` reports `browser: idle` until then and after a browser crash. This is not a fault.
- Compose sets `restart: unless-stopped`.

<!-- sources: server/index.ts, server/pdf.ts, docker-compose.yml -->

## Dependency Updates

- `package-lock.json` is committed, and the Docker build uses `npm ci`.
- Runtime dependencies are only `fastify`, `@fastify/static`, `p-limit` and `playwright-core`. Everything else is a build-time dependency, because Vite bundles the client. Keep new client libraries in `devDependencies`, or the runtime layer grows (comment in `package.json`).
- **`playwright-core` and the base image tag must be updated together** (`1.62.1` in both `package.json` and `Dockerfile`). A mismatch breaks the browser executable lookup (comment in `Dockerfile`).
- The unified/remark/rehype packages, `hast-util-sanitize`, Shiki, KaTeX and Mermaid define rendering and the trust boundary. After upgrading, run the unit tests and the adversarial probe (see [TESTING.md](TESTING.md)).
- `eslint` runs with `--max-warnings 0`, so new lint warnings after an upgrade fail `npm run lint`.
- Dependency audit tooling and update cadence (Dependabot or similar): none found in the repository.

<!-- sources: package.json, Dockerfile, .github/workflows/docforge.yml -->

## Database Migrations

Not applicable. There is no database and the application persists nothing. See [DATA_MODEL.md](DATA_MODEL.md).

<!-- sources: server/index.ts, server/pdf.ts, docker-compose.yml -->

## Secret Rotation

Not applicable. No secrets, credentials or API keys were found in the repository, image or Compose file. If the docforge CI install (`DOCFORGE_SPEC`) requires credentials: uncertain — verify with developer.

<!-- sources: Dockerfile, docker-compose.yml, .github/workflows/docforge.yml -->

## Configuration Management

Configuration is a handful of environment variables (see [DEPLOYMENT.md](DEPLOYMENT.md#configuration)). Hard limits live in code. Two values are duplicated and must be edited together: the 20 MB PDF body limit is in `LIMITS.pdfBodyLimitBytes` (`src/types/domain.ts`) and in `PDF_BODY_LIMIT` (`server/index.ts`). The 30 s render deadline appears as `LIMITS.pdfRenderDeadlineMs` and as `RENDER_DEADLINE_MS` in `server/pdf.ts`.

<!-- sources: src/types/domain.ts, server/index.ts, server/pdf.ts -->

## Logs

The server writes structured JSON logs (Fastify/Pino) to stdout, and the level comes from `LOG_LEVEL`. Read them with `docker compose logs -f app`. PDF failures are logged at `error` with the underlying error. The HTTP response to the client is intentionally generic. No log shipping, retention or aggregation is configured in the repository. See [OPERATIONS.md](OPERATIONS.md).

<!-- sources: server/index.ts, docker-compose.yml -->

## Backups

Nothing to back up. The service is stateless and stores no user documents (the container root is read-only, with only `/tmp` writable). The source repository is the only asset.

<!-- sources: docker-compose.yml, server/pdf.ts -->

## Releases

`package.json` says version `1.0.0` and the project is `private`. No release process, tagging convention or automated release pipeline is defined. The `docforge` workflow builds a PDF manual on manual dispatch or on tags (`refs/tags/`). Everything else about releasing: uncertain — verify with developer. Record changes in [CHANGELOG.md](../CHANGELOG.md) under `[Unreleased]`.

<!-- sources: package.json, .github/workflows/docforge.yml, CHANGELOG.md -->

## Making Production Changes

1. Run `npm run typecheck`, `npm run lint` and `npm test`. The Docker build also runs the typecheck.
2. Build the image and start it: `docker compose up --build -d`.
3. Run `npm run test:e2e`, which needs the container up. Its default container name is `markdown_visualiser-app-1`, overridable with `CONTAINER`, and `IMAGE` similarly. Run `npm run test:security` for any change under `server/` or `src/pipeline/`.
4. Meet the rest of the criteria in `definition_of_done.md` where relevant.
5. Update the affected docs. `docforge.toml` maps changed files to docs, and CI runs `docforge check --strict`.

<!-- sources: package.json, tests/e2e/run.sh, definition_of_done.md, docforge.toml, Dockerfile -->

## Known Technical Debt

- **Image size.** The runtime image is 3.63 GB because it uses the full Playwright image. Proposed fix: `node:24-slim` plus `playwright install --with-deps chromium` (about 1.2 GB, an estimate from the authors). Not done.
- **Unused `printSchema`.** `src/pipeline/sanitize.ts` exports a stricter server-side schema, described as applied before Chromium. Nothing imports it, and the server has no sanitiser. The print service relies on JavaScript being disabled and on request blocking instead. Either wire it in or delete it.
- **Duplicated constants** between client and server (see Configuration Management).
- **Very large sets:** virtualised rendering is deferred until a real set proves slow (`tasks/todo.md`).
- `tests/e2e/run.sh` hard-codes the Compose container name and has Windows path handling. `DoD` lists `tests/adversarial/pdf-endpoint.sh`, which does not exist; the probe is `tests/e2e/adversarial.mjs`.
- The `docforge.toml` project name is `pilot-live`, which does not match the package name `markdown-visualiser`.

<!-- sources: tasks/todo.md, src/pipeline/sanitize.ts, server/pdf.ts, server/index.ts, src/types/domain.ts, tests/e2e/run.sh, definition_of_done.md, docforge.toml -->

## Fragile Areas

### Fragile area: sanitiser schema and pipeline order

- Component: `src/pipeline/sanitize.ts`, `src/pipeline/render.ts`
- Why it is sensitive: the sanitiser is the only defence between dropped markdown and the DOM. A `src` allowance must have the inherited bare `'src'` removed (`inheritedExcept`), or the stricter rule constrains nothing. This caused a real `data:text/html` XSS during development.
- What depends on it: the reader (`dangerouslySetInnerHTML`), the HTML export, and the PDF service.
- What must be tested before changing it: `npm test` (pipeline and sanitise tests) and a check that KaTeX and Shiki output still survives.
- Relevant files: `src/pipeline/sanitize.ts`, `src/pipeline/render.ts`, `src/pipeline/plugins/rehype-assets.ts`.
- Relevant ADR: [ADR-002](adr/002-sanitiser-immediately-after-rehype-raw.md)

### Fragile area: print service

- Component: `server/pdf.ts`
- Why it is sensitive: it renders caller-supplied HTML in Chromium. `javaScriptEnabled: false`, the context-level route that blocks everything except `data:`, `blob:` and `about:`, the per-request context, and the queue cap are layered controls. `waitUntil: 'load'` is deliberate, because `networkidle` would wait for the timeout on every render.
- What depends on it: PDF export.
- What must be tested before changing it: `npm run test:security` (adversarial probe) and `npm run test:e2e` export drive.
- Relevant files: `server/pdf.ts`, `docker-compose.yml`, `Dockerfile`.
- Relevant ADR: [ADR-003](adr/003-contained-print-service.md), [ADR-007](adr/007-playwright-official-image-non-root.md)

### Fragile area: folder walking and ordering

- Component: `src/ingest/walker.ts`, `src/ingest/ordering.ts`
- Why it is sensitive: `readEntries` returns batches (about 100 in Chromium) and must be drained in a loop, or large folders silently lose files. The drop's item list must be read synchronously before the first `await`.
- What must be tested before changing it: `tests/unit/walker.test.ts`, `tests/unit/ordering.test.ts`, and the ingest drive.
- Relevant files: `src/ingest/walker.ts`, `src/ingest/ordering.ts`.
- Relevant ADR: [ADR-004](adr/004-composite-string-sort-key-for-reading-order.md), [ADR-006](adr/006-webkitgetasentry-for-folder-drop.md)

### Fragile area: export serialisation

- Component: `src/export/standalone.ts`
- Why it is sensitive: diagrams must be static SVG before serialising, because the print context has no JavaScript. Images must be retyped by extension (`assets.ts`), or exports get `data:text/plain` images. Both went wrong during development and were fixed (`tasks/todo.md`).
- What must be tested before changing it: the export drive (`tests/e2e/drive-export.mjs`), which re-opens both exports with the network blocked.
- Relevant files: `src/export/standalone.ts`, `src/ingest/assets.ts`, `src/styles/print.css`.

<!-- sources: src/pipeline/sanitize.ts, server/pdf.ts, src/ingest/walker.ts, src/ingest/assets.ts, src/export/standalone.ts, tasks/todo.md -->

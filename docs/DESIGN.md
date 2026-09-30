# Design

> Design intent: boundaries, abstractions and conventions.

## Design Principles

- **One renderer, in the browser.** The server never parses markdown. The PDF matches the screen because it is printed from the HTML the screen showed. [ADR-001](adr/001-single-client-side-markdown-pipeline.md)
- **Contain, don't trust.** Untrusted input is sanitised at one named boundary, and the one server endpoint that handles hostile HTML is layered so no single control is load-bearing. [ADR-002](adr/002-sanitiser-immediately-after-rehype-raw.md), [ADR-003](adr/003-contained-print-service.md)
- **Never change a document silently.** Every repair is recorded as a `RepairNote` and shown to the user. The source file is never modified. [ADR-005](adr/005-report-every-markdown-repair.md)
- **One bad file never costs the set.** Failures are recorded on the document (`error`) or in `skipped`, not thrown away or fatal.
- **Local first.** Nothing is uploaded. The one exception is PDF export, which sends rendered HTML to the server for one request and stores nothing.
- **Zero third-party requests**, so the HTML export works offline. [ADR-008](adr/008-self-hosted-fonts-no-third-party-requests.md)

<!-- sources: src/pipeline/render.ts, src/pipeline/plugins/remark-repair.ts, src/ingest/docset.ts, src/types/domain.ts, server/pdf.ts, README.md -->

## Component Boundaries

- `ingest/` produces a `DocumentSet` and knows nothing about rendering. The `DocumentSet` is the only description of the user's files. The app is described as "a pure function of a DocumentSet" in `domain.ts`.
- `pipeline/` turns one `MarkdownDoc` into a `RenderResult`. It has no UI dependencies. It receives assets and a link resolver through `RenderContext`.
- `state/` holds the current set and the render cache.
- `reader/` displays results and owns no markdown logic.
- `export/` serialises a set and calls the server.
- `server/` has no dependency on the pipeline. It has four runtime dependencies: `fastify`, `@fastify/static`, `p-limit` and `playwright-core`. `LIMITS.pdfBodyLimitBytes` in `src/types/domain.ts` is mirrored by a separate constant in `server/index.ts`, so the two must be changed together.

<!-- sources: src/types/domain.ts, src/pipeline/render.ts, server/index.ts, package.json -->

## Key Abstractions and Patterns

- **`DocumentSet` / `MarkdownDoc` / `RenderResult`**: immutable data passed between layers. See [DATA_MODEL.md](DATA_MODEL.md).
- **Trust boundary.** `rehype-sanitize` runs directly after `rehype-raw`. KaTeX, Shiki, Mermaid placeholders and asset rewriting run after it, on an already-clean tree. Nothing user-controlled may be added below it. `sanitize.ts` therefore allows only *marker* classes, not `style`, `<svg>` or KaTeX classes.
- **Composite sort key.** Reading order is a single dot-joined string compared as text: `dirRank.explicitOrder.indexRank.numericPrefix.naturalName`. [ADR-004](adr/004-composite-string-sort-key-for-reading-order.md)
- **Repair pass as a remark plugin.** It runs on the mdast tree before conversion to HTML and pushes `RepairNote`s into a caller-owned sink. Five rules exist: `heading-skip`, `duplicate-h1`, `list-nesting`, `mixed-markers`, `unbalanced-emphasis`. Some are only reported. For example, unbalanced emphasis is reported and left as literal text.
- **Object URLs for assets**, owned by the set and revoked when the set is discarded. They are converted to data URIs only at export time.
- **Render cache.** `WeakMap` per set plus an in-flight map, so concurrent requests for the same document share one render. Nothing invalidates it, because results cannot change for a given set.
- **Folder walking** uses `webkitGetAsEntry`. [ADR-006](adr/006-webkitgetasentry-for-folder-drop.md)

<!-- sources: src/pipeline/sanitize.ts, src/pipeline/render.ts, src/ingest/ordering.ts, src/pipeline/plugins/remark-repair.ts, src/ingest/assets.ts, src/state/render.ts -->

## Configuration Strategy

Server configuration is by environment variable only. `PORT` (default 8080), `HOST` (default 0.0.0.0), `STATIC_ROOT` (default `../dist` relative to the bundle) and `LOG_LEVEL` (default `info`). The Dockerfile sets `NODE_ENV`, `PORT`, `HOST` and `STATIC_ROOT`; Compose sets `NODE_ENV` and `LOG_LEVEL`. Limits are constants in code, not configuration: file and size caps in `LIMITS` (`src/types/domain.ts`), and print-service timeouts and concurrency in `server/pdf.ts`. There are no config files or secrets. See [DEPLOYMENT.md](DEPLOYMENT.md#configuration).

<!-- sources: server/index.ts, server/pdf.ts, src/types/domain.ts, Dockerfile, docker-compose.yml -->

## Error Handling

- **Ingest:** `IngestError` with a code (`too-large`, `too-many-files`, `no-markdown`, `read-failed`) and a user-readable message that includes measured sizes. The store maps any error to an `error` phase.
- **Per file:** an unreadable file becomes a `MarkdownDoc` with `error` set and still appears in the index. Malformed frontmatter YAML is left in the body as content.
- **Render:** a document with `error` renders as empty. A render failure is shown as a `failed` state for that document only.
- **Server:** 400 for a bad body, 429 with `retry-after: 5` when busy, 504 on timeout, 503 for anything else. The 503 body is generic and the detail goes only to the log, because browser errors can disclose paths. See [API.md](API.md).
- Unknown or unreadable links are classified `missing` rather than rendered as dead links.

<!-- sources: src/types/domain.ts, src/state/store.ts, src/ingest/docset.ts, src/ingest/links.ts, src/state/render.ts, server/index.ts -->

## Logging

Only the server logs. It uses Fastify's built-in logger (Pino), with the level set by `LOG_LEVEL`. Startup failure and shutdown signals are logged, and render failures are logged with the error at `error` level. The client has no logging framework: uncertain — verify with developer. See [OPERATIONS.md](OPERATIONS.md).

<!-- sources: server/index.ts -->

## Authentication and Authorisation

None, by design. The app holds no data and grants no capability beyond printing HTML the caller supplied. Protection is network placement: Compose binds to `127.0.0.1`. See [SECURITY.md](SECURITY.md) and [ADR-003](adr/003-contained-print-service.md).

<!-- sources: docker-compose.yml, README.md, tasks/todo.md -->

## State Management

- **Client:** a Zustand store (`useReader`) with `phase`, `set` and `activeDocId`. Replacing or resetting the set revokes its object URLs.
- **Server:** stateless. The only shared state is one Chromium `Browser`, which is relaunched if it disconnects, and a `p-limit` queue. Each request uses a fresh `BrowserContext`.
- **Persistence:** none. A page reload loses the set.

<!-- sources: src/state/store.ts, src/state/render.ts, server/pdf.ts -->

## API Conventions

The API is two endpoints with JSON errors of the form `{ "error": "<message>" }`. Anything under `/api/` that is not found returns a JSON 404. Everything else falls back to `index.html`. Responses carry `x-content-type-options: nosniff`, `referrer-policy: no-referrer` and `cross-origin-opener-policy: same-origin`. Hashed assets are cached as immutable, and `index.html` is `no-cache`. See [API.md](API.md).

<!-- sources: server/index.ts -->

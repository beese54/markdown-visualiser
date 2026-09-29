# Architecture

> Which components exist and how information flows between them.

## Overview

Markdown Visualiser turns a dropped folder of markdown files into a typeset reading edition in the browser. It can export that edition as one self-contained HTML file or as a PDF.

There is one markdown pipeline and it runs in the browser. The server is a static file host plus a stateless PDF print service. It never sees markdown, only HTML the browser has already rendered. See [ADR-001](adr/001-single-client-side-markdown-pipeline.md).

```
  browser:  drop folder -> ingest -> DocumentSet -> render pipeline -> reader UI
                                                          |
                                     export: inline CSS/fonts/images/diagrams
                                                          | (PDF only) POST /api/export/pdf
  container: Fastify -> Playwright Chromium (JS off, network blocked) -> PDF
```

<!-- sources: src/pipeline/render.ts, src/export/pdf.ts, src/export/standalone.ts, server/index.ts, server/pdf.ts -->

## Components

| Component | Location | Responsibility |
|---|---|---|
| Ingest | `src/ingest/` | Walks a dropped folder (`walker.ts`), separates markdown from images and skipped files, extracts frontmatter and titles, computes reading order (`ordering.ts`), builds the asset map (`assets.ts`), resolves links between documents (`links.ts`). `docset.ts` assembles the `DocumentSet` and enforces size limits. |
| Domain types | `src/types/domain.ts` | `DocumentSet`, `MarkdownDoc`, `AssetRef`, `RenderResult`, `RepairNote`, and the `LIMITS` constants. See [DATA_MODEL.md](DATA_MODEL.md). |
| Render pipeline | `src/pipeline/` | The unified chain in `render.ts`, the sanitiser schema (`sanitize.ts`), and plugins: repair, Shiki, Mermaid placeholders, asset and link rewriting. |
| State | `src/state/` | `store.ts` is a Zustand store holding the ingest phase, the current set and the active document. `render.ts` caches render results per document and prefetches neighbours. |
| Reader UI | `src/reader/`, `src/app/`, `src/ingest/Dropzone.tsx` | React components: paper shell, index sidebar, document view, progress rail, lightbox, Mermaid drawing, repair notice, export bar. |
| Export | `src/export/` | `standalone.ts` builds the one-file HTML. `pdf.ts` posts it to the print service. |
| Styles | `src/styles/` | Design tokens, paper surface, print rules, self-hosted fonts. |
| Web server | `server/index.ts` | Fastify: serves `dist/`, `/healthz`, `POST /api/export/pdf`, security headers, SPA fallback. |
| Print service | `server/pdf.ts` | Shared Chromium, per-request hardened context, concurrency limit, deadlines. |

<!-- sources: src/ingest/*.ts, src/state/store.ts, src/state/render.ts, src/types/domain.ts, server/index.ts, server/pdf.ts, README.md -->

## Information Flow

1. **Ingest.** The Dropzone passes a `DataTransfer` or `FileList` to the store. The walker collects files, `stripCommonRoot` removes the shared root folder, and `buildDocumentSet` produces a `DocumentSet`. Nothing leaves the browser.
2. **Render.** When a document is opened, `state/render.ts` calls `renderDocument`. The result is cached in a `WeakMap` keyed by set, and the next and previous documents are prefetched when the browser is idle.
3. **Display.** The reader injects the sanitised HTML and draws Mermaid diagrams lazily.
4. **HTML export.** `buildStandalone` renders every document off-screen, draws all diagrams, inlines images as data URIs and inlines the page's CSS. The result is one HTML string.
5. **PDF export.** The same string is POSTed as JSON to `/api/export/pdf`. Chromium loads it via `setContent`, and the service returns the PDF.

Details and failure modes are in [HOW_IT_WORKS.md](HOW_IT_WORKS.md).

<!-- sources: src/state/store.ts, src/state/render.ts, src/export/standalone.ts, src/export/pdf.ts, server/index.ts -->

## External Systems

- **Chromium via Playwright** (`playwright-core` 1.62.1). The runtime image is the official Playwright image `v1.62.1-noble`, which provides the browser. See [DEPENDENCIES.md](DEPENDENCIES.md).
- **No third-party network calls at runtime.** Fonts are self-hosted, and the application makes no third-party requests (README, DoD 0.7). The reader does not call any other backend.
- **Build-time only:** `init.sh` clones `MengTo/Skills` from GitHub to vendor design skills into `.claude/skills/mengto/`. If the clone fails, the script continues.
- **Documentation tooling:** `.github/workflows/docforge.yml` runs `docforge`, which is installed from a GitHub repository. Its source is marked uncertain in the workflow itself.

<!-- sources: package.json, Dockerfile, init.sh, .github/workflows/docforge.yml, definition_of_done.md -->

## Infrastructure

A single container built from `Dockerfile` and run by `docker-compose.yml`. It has no database, no cache service, no queue and no persistent volume. The only writable path is a 512 MB `/tmp` tmpfs. Limits: `mem_limit` 2g, `pids_limit` 512, all capabilities dropped, `no-new-privileges`, read-only root filesystem, `ipc: host`, `init: true`. The container runs as `pwuser`, not root.

No hosting platform, load balancer or orchestration is defined in the repository. Where production runs: uncertain — verify with developer.

<!-- sources: docker-compose.yml, Dockerfile -->

## Deployment Architecture

The Dockerfile has two stages. The `build` stage (Node 24 bookworm-slim) runs `npm ci`, typecheck and `npm run build`. The `runtime` stage (Playwright noble image) installs production dependencies only and copies `dist/` and `dist-server/`. It listens on port 8080. Compose publishes it on `127.0.0.1:8080` only. Steps are in [DEPLOYMENT.md](DEPLOYMENT.md).

<!-- sources: Dockerfile, docker-compose.yml, package.json -->

# How It Works

> End-to-end workflows. For each: trigger, receiver, processing, services called, storage, async work, result, failure modes.

## Workflows

### Workflow: Drop a folder and build a document set

1. Trigger: the user drops a folder or files on the page. A directory picker (`webkitdirectory` file list) is the fallback.
2. Received by: `Dropzone` calls `useReader.ingestDataTransfer` or `ingestFileList` (`src/state/store.ts`).
3. Processing: `walkDataTransfer` captures entries synchronously (the item list is emptied when the handler returns). It then walks directories, draining `readEntries` in a loop, and skips `.git`, `node_modules`, `dist`, `build` and similar. `stripCommonRoot` removes a single shared root folder. `buildDocumentSet` checks limits first (2000 files, 200 MB total). Files are then classified: `.md/.markdown/.mdown/.mkd` are documents, common image types become assets, and everything else goes into `skipped`. Markdown files over 10 MB are skipped. For each document, frontmatter is parsed. The title is `frontmatter.title`, else the first H1, else a prettified filename. `order` is read from frontmatter. Documents are sorted by the composite key.
4. Services called: none.
5. Data stored: in memory only (Zustand store). Images become object URLs.
6. Asynchronous work: file reads, and the `phase` transitions `reading` → `building` → `ready`.
7. Result: the first document in reading order becomes active.
8. What can fail: `IngestError` for too many files, too large, no markdown found, or read failure. The store shows the message. A file that cannot be read appears in the index marked as failed. Dropping a very large tree may stop at 2000 files, because the walker stops there. Malformed frontmatter is treated as plain content.

<!-- sources: src/state/store.ts, src/ingest/walker.ts, src/ingest/docset.ts, src/ingest/ordering.ts, src/ingest/assets.ts, src/types/domain.ts -->

### Workflow: Render and read a document

1. Trigger: a document becomes active (open, index click, keyboard navigation).
2. Received by: `useRenderedDoc` in `src/state/render.ts`, which calls `renderDocument` (`src/pipeline/render.ts`).
3. Processing: a discovery parse finds the code languages so Shiki can load only those grammars. The main chain is: parse → frontmatter → GFM → math → **repair** → callouts → remark-rehype → rehype-raw → **sanitise** → KaTeX → Shiki → Mermaid placeholders → asset and link rewriting → heading ids and index tree → table wrapping → drop-cap marking → stringify. Word count and reading time (220 wpm) are computed.
4. Services called: none. Mermaid is drawn later in the browser and loaded lazily.
5. Data stored: the `RenderResult` is cached in memory per set. Neighbouring documents are prefetched when the browser is idle.
6. Asynchronous work: Shiki grammar loading, Mermaid drawing, and idle prefetch.
7. Result: HTML in the paper reader, a heading index, and a repair list (line, before, after) if any repairs were made.
8. What can fail: a render error shows a failed state for that document only. A link to a markdown file that is not in the set is marked missing. Image lookup falls back to a basename match and refuses ambiguous matches. An unresolved image shows a placeholder (README and `tasks/todo.md` describe this; the component itself was not read for this document).

<!-- sources: src/state/render.ts, src/pipeline/render.ts, src/pipeline/plugins/remark-repair.ts, src/ingest/links.ts, src/ingest/assets.ts, tasks/todo.md -->

### Workflow: Export self-contained HTML

1. Trigger: the user picks HTML export in the export bar (`src/reader/ExportBar.tsx`; not read, so the exact UI is uncertain — verify with developer).
2. Received by: `buildStandalone` in `src/export/standalone.ts`, entirely in the browser.
3. Processing: every document is placed in an off-screen host, so unopened documents are included. Diagrams already drawn on screen are copied, and the rest are drawn in the off-screen host (Mermaid needs layout to measure text). Images are fetched from their object URLs and converted to data URIs. All stylesheets are read from `document.styleSheets` with `url()` references inlined.
4. Services called: none.
5. Data stored: none. The file is downloaded via a temporary object URL.
6. Asynchronous work: fetching and encoding assets, diagram drawing.
7. Result: one `.html` file that works with the network disabled. The filename is sanitised by `safeFilename`.
8. What can fail: an image that cannot be read loses its `src`. A cross-origin stylesheet is skipped, and none are expected. Diagrams must be settled before serialising, because the print context runs without JavaScript.

<!-- sources: src/export/standalone.ts, tasks/todo.md -->

### Workflow: Export PDF

1. Trigger: the user picks PDF export.
2. Received by: `requestPdf` (`src/export/pdf.ts`) builds on the HTML export. It rejects locally if the HTML is over 20 MB, then POSTs `{ html, title, format }` to `/api/export/pdf`.
3. Processing (server): the body is validated, and `format` is `Letter` or otherwise `A4`. `renderPdf` rejects with 429 if the queue is saturated. Otherwise it waits for a slot (concurrency is CPU count, clamped to 1–4). It creates a fresh browser context with JavaScript off and service workers blocked, and denies every request except `data:`, `blob:` and `about:`. It loads the HTML, waits for fonts, emulates print media and prints with a running title header and `page / total` footer. It closes the context in a `finally`.
4. Services called: the local Chromium instance only.
5. Data stored: none. The HTML is in memory for one request.
6. Asynchronous work: a queue, a 20 s `setContent` timeout, a 20 s context default timeout and a 30 s overall deadline.
7. Result: `application/pdf` as an attachment. The client downloads it.
8. What can fail: 400 for a missing or empty `html`. 413 if the body is over 20 MB. 429 when busy. 504 on deadline. 503 for any other failure, including Chromium being unavailable. See [API.md](API.md) and [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

<!-- sources: src/export/pdf.ts, server/index.ts, server/pdf.ts -->

### Workflow: Health check and shutdown

1. Trigger: the Docker `HEALTHCHECK` every 30 s, or an operator calling `GET /healthz`.
2. Received by: `server/index.ts`.
3. Processing: returns `status`, `browser` (`up` or `idle`), the queue `{active, pending}` and uptime. It does not launch a browser. `browser: idle` is normal before the first PDF request.
4. On `SIGTERM` or `SIGINT` the server closes, then closes the browser, then exits 0.
5. What can fail: if the process does not answer, the container is marked unhealthy after 3 retries. The Dockerfile does not restart it by itself. Compose's `restart: unless-stopped` acts on exit, not on unhealthy status.

<!-- sources: server/index.ts, Dockerfile, docker-compose.yml -->

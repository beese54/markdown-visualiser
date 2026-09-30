# Troubleshooting

> Practical guide. Keep historical lessons even after the bug is fixed.

## Known Problems

Entries marked *(historical)* were found and fixed during development (recorded in `tasks/todo.md`). They are kept because the same symptom can return.

### Problem: PDF export returns 429 "The print service is busy"

- Possible symptoms: export fails with a busy message. The response has `retry-after: 5`.
- Likely causes: more than concurrency × 4 requests pending. Concurrency is the CPU count clamped to 1–4.
- Diagnostic steps: `curl localhost:8080/healthz` and look at `queue.active` and `queue.pending`.
- Resolution: retry after a few seconds. For sustained load, more CPUs raise concurrency up to 4. The container memory limit is 2 GB.
- Relevant logs: none are written for 429s.
- Relevant components: `server/pdf.ts` (`BusyError`), `server/index.ts`.
- Escalation considerations: sustained 429s with a lightly used system suggest stuck renders. Check `docker compose logs app`.

### Problem: PDF export returns 504 or "Rendering took too long"

- Possible symptoms: export fails after about 30 s.
- Likely causes: a very large or complex document. Fonts or layout never settling.
- Diagnostic steps: check the HTML export size. Try the HTML export.
- Resolution: use the self-contained HTML export and print from the browser (the error message says this).
- Relevant components: `server/pdf.ts` (`RENDER_DEADLINE_MS` 30 s, `SETCONTENT_TIMEOUT_MS` 20 s).
- Escalation considerations: raising deadlines needs load testing, and `LIMITS.pdfRenderDeadlineMs` in `src/types/domain.ts` must be kept in step.

### Problem: PDF export returns 503 "The print service is unavailable"

- Possible symptoms: generic 503 with no detail.
- Likely causes: Chromium failed to launch or crashed. Possible causes are memory pressure or missing `ipc: host`. Base image or `playwright-core` version mismatch. The read-only root filesystem needing a writable location beyond `/tmp`. Which of these applies must be read from the log.
- Diagnostic steps: `docker compose logs app` and search for `pdf render failed`. Check `/healthz`. `browser: idle` right after a failure is expected, because the browser handle is cleared on disconnect and relaunched on the next request.
- Resolution: confirm `playwright-core` and the image tag are both `1.62.1`. Confirm Compose still has `ipc: host`, `init: true` and the `/tmp` tmpfs. Restart the container.
- Relevant logs: `pdf render failed` at `error` level.
- Relevant components: `server/pdf.ts`, `Dockerfile`, `docker-compose.yml`.
- Escalation considerations: the client sees no detail by design. Do not expose the underlying error to callers.

### Problem: PDF export rejected with "over the 20 MB limit" or HTTP 413

- Possible symptoms: message from the client, or a 413 from the server.
- Likely causes: many or large images inlined as data URIs.
- Resolution: use the HTML export, or reduce image sizes. The limit is in two places (`src/types/domain.ts` and `server/index.ts`).
- Relevant components: `src/export/pdf.ts`, `server/index.ts`.

### Problem: Files missing from a large dropped folder *(historical)*

- Possible symptoms: files "randomly" absent from the index.
- Likely causes: `readEntries` returns batches, so calling it once truncates. Also a file is skipped once the 2000-file limit is hit, or an unreadable file is ignored by the walker.
- Diagnostic steps: check the skipped list and the count. Run `tests/unit/walker.test.ts`.
- Resolution: keep the drain loop in `walker.ts`. Split the folder if it exceeds the limit.
- Relevant components: `src/ingest/walker.ts`.

### Problem: Images blank or broken in exported HTML *(historical)*

- Possible symptoms: images fine in the reader but not in the exported file. The offline check can still pass in the same browser session, because blob URLs stay valid there.
- Likely causes: files from a directory drop often have an empty MIME type, so the object URL was untyped and the data URI became `data:text/plain`.
- Resolution: assets are retyped from the file extension in `buildAssetMap`. Check that extension mapping in `src/ingest/assets.ts` includes the format.
- Relevant components: `src/ingest/assets.ts`, `src/export/standalone.ts`.

### Problem: Mermaid diagrams show source, or are missing from the export *(historical)*

- Possible symptoms: diagram source text displayed instead of a diagram. Or a placeholder in the PDF or HTML export for documents that were never opened.
- Likely causes: a failed dynamic import of the Mermaid chunk was cached permanently. Or the exporter copied only diagrams already drawn on screen. The print context has JavaScript disabled, so placeholders never become diagrams.
- Resolution: the exporter now draws diagrams for every document in an off-screen host before serialising. If the problem returns, check the Mermaid loader for a cached rejected promise (`src/reader/Mermaid.tsx`, not read for this document).
- Relevant components: `src/reader/Mermaid.tsx`, `src/export/standalone.ts`.

### Problem: Mismatched title and body after navigating *(historical)*

- Possible symptoms: for one frame, the new title sits above the previous document's text.
- Likely causes: render state updated only in an effect.
- Resolution: state is keyed by document id and mismatches resolve during render (`useRenderedDoc`). Preserve that when editing it.
- Relevant components: `src/state/render.ts`.

### Problem: Heading hierarchy wrong after repair *(historical)*

- Possible symptoms: two titles on one page, or a demoted section's children appearing as its siblings in the index.
- Likely causes: repair depth must derive from the parent's *output* depth, and a promoted heading must count as the H1.
- Resolution: both are fixed in `remark-repair.ts` and covered by tests.
- Relevant components: `src/pipeline/plugins/remark-repair.ts`.

### Problem: Container reports unhealthy

- Possible symptoms: `docker ps` shows unhealthy.
- Likely causes: the health check is hard-coded to port 8080 and it fails if `PORT` changed. The server failed to start (it exits 1 on listen failure).
- Diagnostic steps: `docker compose logs app`. `curl localhost:8080/healthz`.
- Relevant components: `Dockerfile`, `server/index.ts`.

### Problem: Browser e2e drives cannot reach the app

- Possible symptoms: `npm run test:e2e` fails at start.
- Likely causes: the container is not running, or its name is not `markdown_visualiser-app-1`, which is the script default. The drives use `127.0.0.1` on purpose, since Chromium upgrades other plain-HTTP hostnames to HTTPS.
- Resolution: start the container and set `CONTAINER` and `IMAGE` if the names differ.
- Relevant components: `tests/e2e/run.sh`.

<!-- sources: server/index.ts, server/pdf.ts, src/ingest/walker.ts, src/ingest/assets.ts, src/export/standalone.ts, src/state/render.ts, src/pipeline/plugins/remark-repair.ts, tests/e2e/run.sh, tasks/todo.md, Dockerfile, docker-compose.yml -->

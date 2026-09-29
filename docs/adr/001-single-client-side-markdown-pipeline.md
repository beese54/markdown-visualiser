# ADR-001: Single client-side markdown pipeline

## Status

Accepted

## Context

The app renders markdown and exports PDF. PDF needs a real browser engine, which lives on the server.

## Options Considered

- Render markdown in the browser and in a server-side pipeline for PDF.
- Render markdown only on the server.
- Render once in the browser and post the finished HTML to a print-only server.

## Decision

Render only in the browser. The server receives rendered, fully inlined HTML and prints it.

## Rationale

From `README.md` (previous version): a second server-side pipeline would drift from the client one and the PDF would stop matching the reader. Posting rendered HTML makes the PDF identical to the screen by construction and keeps the server small, stateless and free of markdown dependencies. `src/export/pdf.ts` states the server "is a print service, not a second renderer".

## Consequences

- Document content leaves the browser at PDF export (in memory for one request only). HTML export stays local.
- The export must inline everything (CSS, fonts, images, diagrams) before posting.
- The server has four runtime dependencies (`package.json`).

## Related Components

`src/pipeline/render.ts`, `src/export/pdf.ts`, `src/export/standalone.ts`, `server/index.ts`, [ARCHITECTURE.md](../ARCHITECTURE.md)

<!-- sources: README.md (previous version), src/export/pdf.ts, src/export/standalone.ts, package.json -->

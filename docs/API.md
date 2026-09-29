# API

> Behaviour, assumptions and side effects that a generated API spec does not capture.

## Overview

The server (`server/index.ts`) exposes two application endpoints plus static hosting. There is no authentication, versioning or CORS configuration in the code (no CORS plugin is registered). No generated API spec exists in the repository. All errors are JSON `{ "error": string }`, except the SPA fallback. General conventions are in [DESIGN.md](DESIGN.md#api-conventions).

<!-- sources: server/index.ts, package.json -->

## Endpoints

### GET /healthz

- Purpose: liveness and light status. Used by the Docker `HEALTHCHECK`.
- Authentication: none.
- Parameters: none.
- Response example:
  ```json
  { "status": "ok", "browser": "idle", "queue": { "active": 0, "pending": 0 }, "uptime": 42 }
  ```
- `browser` is `up` only if a Chromium instance has been launched and is connected. `idle` is normal before the first PDF request and after a browser disconnect. The call never launches a browser.
- Side effects: none.

### POST /api/export/pdf

- Purpose: print already-rendered, self-contained HTML to PDF.
- Authentication: none.
- Request: `application/json`, body limit 20 MB.
  ```json
  { "html": "<!doctype html>…", "title": "Handbook", "format": "A4", "landscape": false }
  ```
  - `html` (required): non-empty string. Must inline all assets, because every request except `data:`, `blob:` and `about:` is aborted and JavaScript is disabled. Remote images and stylesheets will not load.
  - `title`: string, default `Documents`. Printed in the page header (escaped, first 120 characters) and used for the filename.
  - `format`: `Letter` or anything else falls back to `A4`.
  - `landscape`: honoured only when exactly `true`. The bundled client (`src/export/pdf.ts`) does not send it.
- Response 200: `application/pdf`, `content-disposition: attachment; filename="<ascii-title>.pdf"`. The filename is reduced to `[\w.-]`, at most 80 characters, and falls back to `documents`.
- Output: margins 22/18/20/22 mm (top/right/bottom/left), `preferCSSPageSize: true`, background printing on, print media, `en-GB` locale, UTC timezone, header with title, footer `page / total`.
- Dependencies: the local Chromium via `playwright-core`.
- Side effects: launches a shared Chromium on first use. Creates and always closes one browser context per request. Nothing is written to disk by application code. The HTML is not logged by application code.
- Concurrency: at most `clamp(CPU count, 1, 4)` renders run at once. More than 4× that many pending requests get 429.

### Static files and fallback

- `GET /` and other paths serve `STATIC_ROOT` (the Vite build). `index.html` is `no-cache`. Files whose name contains a hash of eight or more hex characters get `public, max-age=31536000, immutable`.
- Any other unmatched path returns `index.html` (SPA fallback), except paths starting `/api/`, which return JSON 404 `{ "error": "Not found" }`.
- Every response gets `x-content-type-options: nosniff`, `referrer-policy: no-referrer`, `cross-origin-opener-policy: same-origin`.

<!-- sources: server/index.ts, server/pdf.ts, src/export/pdf.ts -->

## Errors

| Status | Endpoint | Cause | Body / headers |
|---|---|---|---|
| 400 | `POST /api/export/pdf` | Missing body, `html` not a string, or blank | `Expected a JSON body with an "html" string.` |
| 413 | `POST /api/export/pdf` | Body over 20 MB | Fastify default. Reported as verified by the adversarial probe in `tasks/todo.md`. |
| 429 | `POST /api/export/pdf` | Queue saturated | `The print service is busy.` with `retry-after: 5` |
| 504 | `POST /api/export/pdf` | 30 s render deadline exceeded | Advises using the HTML export instead |
| 503 | `POST /api/export/pdf` | Any other failure, including browser launch failure | `The print service is unavailable.` Details go to the server log only. |
| 404 | `/api/*` | Unknown API path | `{ "error": "Not found" }` |

Malformed non-JSON content types were verified to produce 400 according to `tasks/todo.md`. The exact framework behaviour was not confirmed in code: uncertain — verify with developer. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for diagnosis.

<!-- sources: server/index.ts, server/pdf.ts, tasks/todo.md -->

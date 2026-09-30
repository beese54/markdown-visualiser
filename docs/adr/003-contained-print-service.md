# ADR-003: Contained, unauthenticated print service

## Status

Accepted

## Context

`POST /api/export/pdf` renders caller-supplied HTML in a real browser. That is a known SSRF and resource-exhaustion class, and the only meaningful attack surface. The service holds no data.

## Options Considered

- Trust the client's sanitisation and print directly.
- Re-sanitise HTML on the server (a `printSchema` exists in `sanitize.ts` but is not used).
- Contain the browser with layered controls and add no authentication.

## Decision

Contain the browser in layers: JavaScript disabled, a context-level default-deny route (only `data:`, `blob:`, `about:`), a fresh `BrowserContext` per request, a `p-limit` concurrency limit with a queue cap returning 429, a 20 MB body limit, and timeouts at each level. No authentication. Compose binds to `127.0.0.1`.

## Rationale

Comments in `server/pdf.ts`: each control answers a named threat and no single one is load-bearing. The client inlines every asset, so blocking all network access costs nothing legitimate. `docker-compose.yml` states the app has nothing to authenticate. `tasks/todo.md` records the endpoint as deliberately unauthenticated because it grants nothing beyond printing what the caller supplied.

## Consequences

- Exposure beyond loopback publishes a headless browser. Anything reachable needs external access control and TLS.
- No per-client rate limit, so one client can use all capacity.
- Server-side sanitisation is not applied (`printSchema` is unused).
- Changes to `server/pdf.ts` require the adversarial probe.

## Related Components

`server/pdf.ts`, `server/index.ts`, `docker-compose.yml`, `tests/e2e/adversarial.mjs`, [SECURITY.md](../SECURITY.md)

<!-- sources: server/pdf.ts, server/index.ts, docker-compose.yml, src/pipeline/sanitize.ts, tasks/todo.md -->

# Operations

> Running the system day to day: monitoring, alerts, routine tasks, incidents.

## Monitoring

- **`GET /healthz`** returns `status`, `browser` (`up` or `idle`), `queue` (`active`, `pending`) and `uptime` in seconds. `idle` is normal until the first PDF request.
- **Docker health check:** runs `/healthz` every 30 s with a 5 s timeout, a 20 s start period and 3 retries. Check with `docker ps` or `docker inspect`.
- **Logs:** `docker compose logs -f app` (JSON, level from `LOG_LEVEL`).
- **Resources:** the container is limited to 2 GB memory and 512 pids. Watch `docker stats`. Chromium is the main consumer.
- No metrics endpoint, dashboards or tracing exist in the repository.

<!-- sources: server/index.ts, Dockerfile, docker-compose.yml -->

## Alerts

None are configured in the repository. Suggested signals (not implemented): the container going unhealthy, repeated `pdf render failed` log lines, sustained `queue.pending` above 0, and 429, 503 or 504 responses. Alerting infrastructure: uncertain — verify with developer.

<!-- sources: server/index.ts, docker-compose.yml -->

## Routine Operations

- **Deploy or update:** `docker compose up --build -d` (see [DEPLOYMENT.md](DEPLOYMENT.md)).
- **Restart:** `docker compose restart app`. Chromium is relaunched on the next PDF request.
- **Smoke check after any change:** `curl -sf localhost:8080/healthz`, then export a PDF from the UI.
- **Regression check:** `npm run test:e2e` and `npm run test:security`. Both need the container running.
- No scheduled jobs, backups, log rotation or data clean-up exist. The service is stateless.
- Docker's default logging behaviour applies to logs, so long-running hosts may need log rotation configured outside the repository: uncertain — verify with developer.

<!-- sources: docker-compose.yml, package.json, tests/e2e/run.sh -->

## Incident Response

1. **Is it up?** `curl localhost:8080/healthz`. If it fails, run `docker compose ps` and `docker compose logs --tail 200 app`. The server exits 1 if it cannot listen.
2. **Only PDF export failing?** The web UI and HTML export do not depend on the print service, so users can continue with HTML export. See the 429, 503 and 504 entries in [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
3. **Overload or memory pressure:** restart the container. Check that `ipc: host`, `init: true` and the memory limit are still in Compose.
4. **Suspected abuse of the endpoint:** the service is unauthenticated, so first confirm it is bound to `127.0.0.1` (`docker compose ps`, port mapping) and not published wider. If it was exposed, restrict access at the network level before investigating, and see [SECURITY.md](SECURITY.md).
5. **Bad release:** roll back per [DEPLOYMENT.md](DEPLOYMENT.md#rollback).

Escalation contacts and on-call arrangements: uncertain — verify with developer.

<!-- sources: server/index.ts, docker-compose.yml, Dockerfile -->

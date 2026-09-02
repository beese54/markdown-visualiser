# markdown-visualiser — build log

## L0 — Foundation ✅ COMPLETE

- [x] L0.1 Blueprint artifacts (specification.json, definition_of_done.md, progress_tracking.json, init.sh)
- [x] L0.2 Package + build config (Vite 7, React 19, TS 5.9 strict, Vitest, ESLint 9)
- [x] L0.3 Domain types (`src/types/domain.ts`)
- [x] L0.4 Design tokens + paper surface + self-hosted OFL fonts
- [x] L0.5 App shell placeholder
- [x] L0.6 Fastify server + Dockerfile + compose

### Gate results

| Check | Result |
|---|---|
| Typecheck | clean (`tsc --noEmit`, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`) |
| Lint | clean, 0 warnings |
| Tests | **8 passed / 8** |
| Build | ok — JS 194.23 kB (61.05 kB gzip), CSS 22.33 kB (4.37 kB gzip), dist 1.2 MB |
| DoD 0.5 SPA served | PASS — `curl localhost:8080` returns the app |
| DoD 0.6 healthz | PASS — `{"status":"ok","browser":"down","uptime":5}` |
| DoD 0.7 no 3rd-party fonts | PASS — zero googleapis/gstatic references in `dist/` |
| DoD 4.8 non-root | PASS — `uid=1001(pwuser)` |

### Security audit — L0 diff, per category

- **Injection at input boundaries** — audit clean. L0 accepts no user input. Static serving is
  confined to `STATIC_ROOT` by `@fastify/static`; the SPA fallback sends a fixed filename with no
  interpolation of request data.
- **Authn/authz on new endpoints** — audit clean. `/healthz` returns status and uptime only, no
  environment or path disclosure. No state-changing endpoint exists yet. Compose binds
  `127.0.0.1` so nothing is reachable off-host by default.
- **Secrets** — audit clean. None hardcoded, none logged. No credentials in the image.
- **Unvalidated input reaching state changes** — audit clean. L0 has no mutable state.
- **Resource handling** — audit clean. `bodyLimit` set explicitly to 20 MB rather than left at the
  1 MiB default; `mem_limit 2g`, `pids_limit 512`, `cap_drop ALL`, `no-new-privileges`,
  `read_only` rootfs with a 512 MB `/tmp` tmpfs; SIGTERM/SIGINT close the server before exit.

### Notes carried forward

- **Image is 3.63 GB.** The official Playwright image ships Chromium, Firefox and WebKit; we use
  only Chromium. Slimming to a `node:24-slim` base with `playwright install --with-deps chromium`
  should land near ~1.2 GB. Deferred to L4 so the browser is proven working first.
- **`read_only: true` + Chromium** needs revalidating at L4.3 when a browser actually launches —
  Chromium may want a writable HOME beyond the `/tmp` tmpfs.

---

## L1 — Ingest 🔄 IN PROGRESS

- [x] L1.1 Recursive walker with drained `readEntries`
- [x] L1.2 Ordering key computation
- [x] L1.3 Asset map with object URLs
- [ ] L1.4 DocumentSet builder + limits + resilience
- [ ] L1.5 Inter-document link resolution
- [ ] L1.6 Dropzone + store

---

## Deferred

- Slim the runtime image to Chromium-only (see note above).
- Virtualised rendering for very large document sets (only if a real set proves slow).

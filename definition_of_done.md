# Definition of Done

Every criterion names the command that proves it. A criterion that cannot be demonstrated by
running its command is **not done**, regardless of how the code looks.

---

## L0 — Foundation

| # | Criterion | Verified by |
|---|---|---|
| 0.1 | TypeScript compiles with no errors under `strict` | `npm run typecheck` |
| 0.2 | Lint passes with zero warnings | `npm run lint` |
| 0.3 | Vite production build succeeds | `npm run build` |
| 0.4 | Test runner executes and the token smoke test passes | `npm test` |
| 0.5 | Container builds and serves the themed shell on :8080 | `docker compose up --build -d && curl -sf localhost:8080 \| grep -q 'markdown-visualiser'` |
| 0.6 | Health endpoint reports browser status | `curl -sf localhost:8080/healthz` |
| 0.7 | Fonts are served from the origin, never from a third party | `grep -rE "fonts\.(googleapis\|gstatic)" dist/ ; test $? -ne 0` |

## L1 — Ingest

| # | Criterion | Verified by |
|---|---|---|
| 1.1 | Ordering honours frontmatter `order`, numeric prefixes, index names, depth, then natural alpha | `npm test -- ordering` |
| 1.2 | A 250+ file fixture tree is walked with zero dropped entries (proves the looped `readEntries`) | `npm test -- walker` |
| 1.3 | Relative inter-document links resolve to in-app doc ids | `npm test -- links` |
| 1.4 | Images register in the AssetMap under normalised relative paths | `npm test -- assets` |
| 1.5 | Oversized and over-count drops are rejected with the actual measured size in the message | `npm test -- limits` |
| 1.6 | A single unparseable file does not fail the set | `npm test -- resilience` |

## L2 — Pipeline

| # | Criterion | Verified by |
|---|---|---|
| 2.1 | GFM tables, footnotes, task lists and strikethrough render | `npm test -- gfm` |
| 2.2 | `> [!NOTE]` / `[!WARNING]` / `[!TIP]` callouts render as styled admonitions | `npm test -- callouts` |
| 2.3 | KaTeX renders inline and display math | `npm test -- math` |
| 2.4 | Shiki highlights code and the bundle excludes the Oniguruma WASM | `npm test -- shiki` |
| 2.5 | `<script>`, `onerror=`, `javascript:` hrefs and `<iframe>` are stripped | `npm test -- sanitize` |
| 2.6 | KaTeX and Shiki output survives intact (proves the trust-boundary ordering) | `npm test -- sanitize` |
| 2.7 | A deliberately malformed fixture repairs to clean hierarchy and reports every fix | `npm test -- repair` |
| 2.8 | Repairs are reported, never silent — RepairNote count matches applied changes | `npm test -- repair` |

## L3 — Reader UI

| # | Criterion | Verified by |
|---|---|---|
| 3.1 | A multi-file set is navigable end-to-end via the index sidebar | Browser drive: drop `tests/fixtures/handbook`, click through every index entry |
| 3.2 | Active-section tracking follows scroll position | Browser drive: scroll and observe the rail |
| 3.3 | Fully keyboard operable; visible focus on every interactive element | Browser drive: Tab through the whole app with no mouse |
| 3.4 | No horizontal scroll from 360px to 2560px | Browser drive at 360 / 768 / 1440 / 2560 |
| 3.5 | Zero serious/critical accessibility violations | axe-core run in-page, asserted in the browser drive |
| 3.6 | All motion is suppressed under `prefers-reduced-motion` | Browser drive with the emulation flag set |

## L4 — Export + Integration

| # | Criterion | Verified by |
|---|---|---|
| 4.1 | Standalone HTML opens correctly with the network fully disabled | Save export, disable network, open file |
| 4.2 | Exported PDF matches the screen, with running heads and folio numbers | Generate and inspect the PDF |
| 4.3 | Mermaid diagrams appear as SVG in the PDF (proves the settle-before-serialise fix) | Export a mermaid fixture, inspect the PDF |
| 4.4 | `file:///etc/passwd` in posted HTML reads nothing | `tests/adversarial/pdf-endpoint.sh` |
| 4.5 | Internal-IP and `169.254.169.254` requests are aborted | `tests/adversarial/pdf-endpoint.sh` |
| 4.6 | A body over the limit returns 413, not a crash | `tests/adversarial/pdf-endpoint.sh` |
| 4.7 | Saturating concurrency returns 429, not an unbounded browser spawn | `tests/adversarial/pdf-endpoint.sh` |
| 4.8 | Container runs as non-root | `docker compose exec app id -u \| grep -qv '^0$'` |

## Global gates (every layer)

| # | Criterion | Verified by |
|---|---|---|
| G.1 | Full suite green, counts reported | `npm test` |
| G.2 | Typecheck clean | `npm run typecheck` |
| G.3 | Per-category security audit of the layer diff, stated per category | Recorded in `tasks/todo.md` at the layer gate |
| G.4 | One atomic commit per layer referencing its task ids | `git log --oneline` |

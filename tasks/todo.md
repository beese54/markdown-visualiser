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

---

## L2 — Pipeline ✅ COMPLETE

- [x] L2.1 Sanitize schema at the trust boundary
- [x] L2.2 Markdown repair remark plugin
- [x] L2.3 Shiki hast visitor, JS regex engine
- [x] L2.4 Mermaid placeholder extraction
- [x] L2.5 Asset path resolution
- [x] L2.6 Assembled pipeline + headings + reading time

### Gate results

| Check | Result |
|---|---|
| Typecheck | clean |
| Lint | clean, 0 warnings |
| Tests | **111 passed / 111** (45 new pipeline tests) |
| Build | ok — 303.65 kB JS / 96.14 kB gzip |

### Two real bugs found and fixed by the tests

**1. `data:text/html` image source survived sanitization — a genuine XSS vector.**
The `src` protocol allowlist checks only the *scheme*, so `data:` passed and
`data:text/html;base64,<script>…` rendered intact. The deeper cause was subtler:
`hast-util-sanitize` permits an attribute if *any* of its definitions match, and the
upstream default schema contributes a bare `'src'` that matches every value. Adding
`['src', /regex/]` alongside it constrained nothing. Fixed with `inheritedExcept()`,
which drops the permissive entry before re-declaring `src` as a value allowlist of
raster image types only — SVG excluded, since it can carry script. `rehype-assets`
was hardened the same way so a plugin running past the trust boundary cannot
reintroduce what the sanitizer rejected.

**2. Demoting a heading orphaned its subtree.**
`# A / ## A1 / # B / ## B1` produced depths `[1,2,2,2]`: B was correctly demoted to
h2, but B1 stayed at h2 and so became B's *sibling* rather than its child — the index
showed a structure the document did not have. The depth is now derived from the
parent's *output* depth rather than its input depth, so a moved section carries its
children with it. Expected `[1,2,2,3]`.

### Security audit — L2 diff, per category

- **Injection at input boundaries** — the markdown pipeline *is* the input boundary.
  `rehype-sanitize` sits immediately after `rehype-raw`, and 13 hostile-payload tests
  cover script/iframe/object/embed/form/style/meta/base tags, `onerror`/`onload`/
  `onmouseover` handlers, `javascript:`/`vbscript:` hrefs, non-image data URIs, and
  handlers nested inside otherwise-valid table markup. Two findings above, both fixed.
- **Authn/authz** — audit clean. No endpoints added.
- **Secrets** — audit clean. None present, none logged.
- **Unvalidated input reaching state changes** — audit clean. The pipeline is pure:
  markdown in, HTML string out, no persistence or side effects.
- **Resource handling** — audit clean. Shiki uses the JS regex engine (no WASM
  fetch); grammars load on demand and a missing one degrades to plain text rather
  than throwing; Mermaid is extracted as placeholders, never rendered here.

### Notes carried forward

- ~~heading ids get a `user-content-` prefix~~ - **checked, and not true.** The heading
  plugin runs downstream of `rehype-sanitize`, so clobbering never touches ids it sets.
  Verified in the browser: `id="hello-world"`, unprefixed.
- The pipeline is not yet imported by any component, so it is absent from the bundle
  and the mermaid/shiki/katex chunk splits do not appear in build output yet. Both
  land in L3.

---

## L3 — Reader UI ✅ COMPLETE

- [x] L3.1 Archival paper shell
- [x] L3.2 Index sidebar with heading tree
- [x] L3.3 Scroll progress rail + active section
- [x] L3.4 Document view: drop caps, folio, frontmatter block
- [x] L3.5 Mermaid rendering, lazy loaded
- [x] L3.6 Figure captions + lightbox
- [x] L3.7 Keyboard nav, reduced motion, a11y pass

### Gate results

| Check | Result |
|---|---|
| Typecheck | clean |
| Lint | clean, 0 warnings |
| Unit tests | **121 passed / 121** |
| Browser drive | **32 passed / 32** (`tests/e2e/drive-reader.mjs`) |
| Build | 666 kB / 207 kB gzip eager; shiki, katex, mermaid split out |
| DoD 3.1 navigation | PASS — all 6 index entries open their document |
| DoD 3.2 active section | PASS — heading tree tracks scroll |
| DoD 3.3 keyboard | PASS — arrows move between documents, 16 focusable, visible focus |
| DoD 3.4 responsive | PASS — no overflow at 360/480/768/1024/1440/2560 |
| DoD 3.5 accessibility | PASS — zero serious/critical axe violations |
| DoD 3.6 reduced motion | PASS — all motion tokens collapse to 0ms |

### Seven bugs found, six of them only visible by looking

The unit suite was green through every one of these. Three came from driving real
Chromium; four came from reading a screenshot.

1. **A React portal into `dangerouslySetInnerHTML` was silently discarded.** Mermaid
   rendered correctly and then wrote into a node React had already replaced. Root
   cause: the parent re-renders often (scroll, lightbox, navigation) and each one
   re-applied `dangerouslySetInnerHTML`, rebuilding the whole subtree. Fixed by
   memoising `Prose` on the HTML string, and by re-querying the slot after the await
   rather than holding a node reference across it.
2. **`loadMermaid()` cached a rejected promise.** The chunk is ~3 MB; navigating away
   mid-download aborts the fetch, and that failure was then cached permanently — every
   later document silently showed diagram source instead of a diagram.
3. **Navigation painted the new title above the previous body.** `useRenderedDoc`
   updated state only in an effect, so one frame showed a mismatched page. State is now
   keyed by document id, with the mismatch resolved during render.
4. **The whitespace repair ate meaningful spaces.** A `$`-anchored strip removed the
   space belonging to the text node before a link, so "See the [setup guide]" rendered
   as "See thesetup guide". Probing the parser showed remark already normalises every
   case that rule targeted — it was **unreachable dead code whose only observable effect
   was this bug**, so it was removed rather than patched, along with its type member,
   UI label and spec entry.
5. **Promoted headings were not recorded as titles.** With the redundant title removed,
   an h5 promoted to h1 left `seenH1` false, so a later genuine h1 was never demoted and
   the page rendered two competing titles.
6. **KaTeX printed every equation twice.** Its stylesheet — never imported — is what
   hides the MathML copy it emits alongside the HTML rendering.
7. **Shiki produced no colour.** With `defaultColor: false` it emits `--shiki-*` custom
   properties, and nothing was mapping them onto `color`.

Also fixed: the progress rail was `float`ed inside a grid container, so it became a grid
item that took a whole row and pushed the sheet several hundred pixels down the page; the
document title was printed twice (the header plus the document's own h1); an image that
resolved but could not be decoded showed the browser's broken-image icon rather than the
styled placeholder; and `.index-dir` used gold at 75% opacity, compositing to 3.61:1
against the dark frame — under the 4.5:1 minimum for small text.

Regression tests cover items 4–7 plus the contrast and title-duplication fixes. Items 1–3
are covered by the browser drive.

### Security audit — L3 diff, per category

- **Injection at input boundaries** — `dangerouslySetInnerHTML` receives only pipeline
  output that has passed the L2 trust boundary. The two places this layer writes markup
  itself are Mermaid SVG (parsed via `createContextualFragment` from already-sanitised
  source, with mermaid in `securityLevel: 'strict'`) and the image-failure placeholder,
  whose only variable text is set through `textContent`. Audit clean.
- **Authn/authz on new endpoints** — audit clean. No endpoints added.
- **Secrets** — audit clean. None present, none logged.
- **Unvalidated input reaching state changes** — audit clean. Navigation is keyed by
  `data-doc` ids the pipeline itself minted; an unknown id resolves to no document
  rather than to arbitrary state.
- **Resource handling** — audit clean. Object URLs are revoked when a set is replaced or
  closed; every listener, `IntersectionObserver`, `ResizeObserver` and animation frame is
  torn down in its cleanup; the scroll handler coalesces to one layout read per frame;
  and mermaid renders are bounded by a 15s timeout so a hung diagram cannot leave a slot
  blank indefinitely.

---

## L4 — Export + Integration 🔄 NEXT

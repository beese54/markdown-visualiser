# Markdown Visualiser

Drop a folder of markdown files into a browser and get back a typeset reading
edition: ordered, cross-linked, and set on an archival paper surface built for
reading rather than for scanning. Export it as a print-quality PDF or as a
single self-contained HTML file.

It exists for one narrow purpose — helping people read markdown files in a
neater, more legible way than a raw editor or a utilitarian preview pane
allows.

> ### Design by Meng To
>
> **The entire visual design of this project comes from the work of
> [Meng To](https://github.com/MengTo) — full credit for how this looks
> belongs to him.** The archival-paper direction, the serif typographic
> hierarchy, the index-as-navigation, the layered elevation and the progress
> rail are all implementations of design direction he published in
> [MengTo/Skills](https://github.com/MengTo/Skills) (MIT).
>
> See [CREDITS.md](CREDITS.md) for exactly which skills shaped which parts,
> and go look at [his work](https://github.com/MengTo?tab=repositories) and
> [Design+Code](https://designcode.io) directly.

```bash
./init.sh
docker compose up --build     # → http://localhost:8080
```

---

## What it does

- **Understands a folder, not just a file.** Nested directories, frontmatter
  ordering, numeric filename prefixes, `README`/`index` conventions, and
  relative links between documents that become real in-app navigation.
- **Renders the whole of markdown.** GFM tables, footnotes and task lists;
  `> [!NOTE]` callouts; KaTeX maths; Shiki syntax highlighting; Mermaid
  diagrams; local images with figure captions and a lightbox.
- **Repairs messy markdown, and says so.** Skipped heading levels, duplicate
  H1s and broken list nesting are normalised — and every change is listed in
  the document, because silently editing someone's writing is not acceptable
  behaviour for a reader.
- **Exports two ways.** A PDF with running heads and page numbers, or one
  portable HTML file that opens correctly with the network disabled.

## Architecture

There is exactly one markdown pipeline, and it runs in the browser.

```
  ┌─ browser ───────────────────────────────────────────────┐
  │  drop folder → ingest → DocumentSet → repair → render    │
  │                                             ↓            │
  │                                      paper reader UI     │
  │                                             ↓            │
  │                             inline all CSS + assets      │
  └────────────────────────────────┬────────────────────────┘
                                   │ POST rendered HTML
                                   ↓
  ┌─ container ─────────────────────────────────────────────┐
  │  Fastify → Playwright Chromium → setContent() → PDF      │
  │  (stateless print service, nothing persisted)            │
  └─────────────────────────────────────────────────────────┘
```

A server-side markdown pipeline would be a second implementation that silently
drifts from the client one, and PDFs would stop matching what the reader saw.
Posting the already-rendered HTML makes the PDF identical to the screen by
construction, and keeps the server a small stateless service with no markdown
dependencies at all.

**Trade-off, stated plainly:** document content does leave the browser at PDF
export time. It is held in memory for one request and never written to disk,
but that moment is not purely local. The HTML export is entirely local.

### The trust boundary

The plugin order in `src/pipeline/render.ts` is the load-bearing decision:

```
parse → frontmatter → gfm → math → repair → callouts
  → remark-rehype {allowDangerousHtml} → rehype-raw
  → rehype-sanitize          ←── TRUST BOUNDARY
  → katex → shiki → mermaid → assets → stringify
```

`rehype-raw` turns embedded HTML into real elements, so the sanitizer runs
immediately after it. Everything downstream is markup *we* generate from an
already-clean tree, so it needs no whitelisting — putting the sanitizer last
would instead force `style=`, `<svg>`, `<math>` and dozens of KaTeX classes to
be permitted, which is precisely the surface an attacker wants.

## Security

The PDF endpoint renders caller-supplied HTML in a real browser — a known SSRF
and resource-exhaustion class, and the app's only meaningful attack surface. It
is contained rather than trusted, in layers, so no single control is
load-bearing:

| Control | Stops |
|---|---|
| `javaScriptEnabled: false` | script-driven fetch, exfiltration, infinite loops |
| context-level default-deny routing (`data:`/`blob:`/`about:` only) | SSRF to internal hosts and cloud metadata, `file://` reads, and the CSS-only vectors (`@import`, `url()`, `<link>`) that need no JavaScript |
| fresh `BrowserContext` per request | state carrying between untrusted documents |
| `p-limit` + queue cap | unbounded browser spawning; sheds to 429 |
| `bodyLimit`, `setContent` and render deadlines | oversized bodies and documents that never settle |

All verified by probe against the running container, not by inspection:
`npm run test:security` (11 checks).

## Verifying

```bash
npm test              # 121 unit tests
npm run typecheck
npm run lint
npm run test:e2e      # 4 browser drives, needs the container running
npm run test:security # adversarial probe of the PDF endpoint
```

The browser drives run inside a sibling container sharing the app's network
namespace, driving the real served bundle in Chromium:

| Drive | Covers |
|---|---|
| `drive.mjs` | ingest: walker, reading order, grouping, titles, skips |
| `drive-reader.mjs` | navigation, keyboard, responsiveness, axe accessibility, reduced motion |
| `drive-export.mjs` | both exports, re-opened with the network blocked |
| `adversarial.mjs` | the security table above |

## Project layout

```
src/
  ingest/     folder walk, ordering, asset map, link resolution
  pipeline/   unified chain, sanitize schema, repair, shiki, mermaid
  reader/     paper shell, index, document view, diagrams, lightbox
  export/     standalone HTML serialiser, client PDF call
  styles/     tokens, paper surface, print
server/       Fastify static host + hardened Playwright print service
tests/        unit tests, fixtures, browser drives
```

## Design

Every visual decision here traces back to [Meng To](https://github.com/MengTo).
The archival-paper direction — dark shell around a warm parchment sheet, serif
as the primary design driver, index-like navigation with active markers, drop
caps and folio marks, layered elevation, the calm literary motion — comes from
skills he published in [MengTo/Skills](https://github.com/MengTo/Skills) (MIT),
vendored into `.claude/skills/mengto/` by `init.sh`. **[CREDITS.md](CREDITS.md)
sets out which skill shaped which part.**

Typography is Fraunces, Newsreader and IBM Plex Mono — all SIL OFL,
self-hosted, so the app makes **zero third-party requests** (which is also what
lets the HTML export work offline).

## Licence

MIT — see [LICENSE](LICENSE). The design credit above is not a licence
condition but a statement of fact: the look of this application is Meng To's
work, and [CREDITS.md](CREDITS.md) records it in full. Bundled fonts are SIL
OFL 1.1.

## Limits and non-goals

Drops are capped at 200 MB / 2000 files / 10 MB per file; PDF request bodies at
20 MB. Not in scope: editing markdown, persistence between sessions,
authentication, cloud sync, or live filesystem watching.

## Known follow-up

The runtime image is 3.63 GB because the official Playwright image ships
Chromium, Firefox and WebKit and only Chromium is used. A `node:24-slim` base
with `playwright install --with-deps chromium` should land near ~1.2 GB.

# Task-level context (qodo BP#3) — requirements the code must satisfy

Source: the repo's own blueprint artifacts. These give the reviewer acceptance criteria
to measure the implementation against, enabling *requirements gap* findings.

## definition_of_done.md
```markdown
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
```

## specification.json
```json
{
  "name": "markdown-visualiser",
  "version": "1.0.0",
  "purpose": "Drag-and-drop markdown files or folders into a browser and get a typeset, archival-paper reading experience, exportable as PDF or a single self-contained HTML file.",
  "architecture": {
    "principle": "Exactly one markdown rendering pipeline, running client-side. The server never parses markdown.",
    "client": "Vite + React 19 + TypeScript SPA. Ingest, repair, render, read, and export-serialisation all happen in the browser.",
    "server": "Fastify serving the static SPA plus a stateless Playwright print service. No persistence, no database, no filesystem writes."
  },
  "schemas": {
    "AssetRef": {
      "path": "string  - normalised POSIX relative path, lowercased for lookup",
      "originalPath": "string  - as it appeared in the drop",
      "url": "string  - blob: URL valid for the session",
      "mime": "string",
      "bytes": "number"
    },
    "Heading": {
      "id": "string  - github-slugger slug, unique within a document",
      "depth": "number  - 1..6, post-repair",
      "text": "string",
      "children": "Heading[]"
    },
    "RepairNote": {
      "rule": "'heading-skip' | 'duplicate-h1' | 'list-nesting' | 'mixed-markers' | 'unbalanced-emphasis'",
      "line": "number | null",
      "before": "string",
      "after": "string",
      "detail": "string"
    },
    "MarkdownDoc": {
      "id": "string  - stable hash of relative path",
      "path": "string  - normalised POSIX relative path from drop root",
      "dir": "string",
      "filename": "string",
      "title": "string  - frontmatter.title, else first H1, else prettified filename",
      "frontmatter": "Record<string, unknown>",
      "raw": "string",
      "order": "number | null  - explicit frontmatter order, if present",
      "sortKey": "string  - computed by ordering.ts",
      "error": "string | null  - per-file failure, does not fail the set"
    },
    "DocumentSet": {
      "id": "string",
      "rootName": "string  - dropped folder name, or 'Documents' for loose files",
      "docs": "MarkdownDoc[]  - in resolved reading order",
      "assets": "Map<string, AssetRef>",
      "skipped": "{ path: string, reason: string }[]",
      "totalBytes": "number",
      "createdAt": "number"
    },
    "RenderResult": {
      "docId": "string",
      "html": "string  - sanitised, KaTeX- and Shiki-processed",
      "headings": "Heading[]",
      "repairs": "RepairNote[]",
      "mermaidBlocks": "{ id: string, code: string }[]",
      "wordCount": "number",
      "readingMinutes": "number"
    }
  },
  "ordering": {
    "rules": [
      "1. Explicit numeric `order` in YAML frontmatter (ascending).",
      "2. Conventional index names open their directory: README, index, introduction, overview, 00. Ranked above the numeric prefix so a folder opens on its own introduction rather than on its first numbered chapter.",
      "3. Numeric filename prefix: 01-intro.md, 2_setup.md, 003.overview.md.",
      "4. Directory depth then directory name, so nested sections stay grouped under their parent.",
      "5. Case-insensitive natural alphabetical on filename as the final tiebreak."
    ],
    "note": "Rules are applied lexicographically as a composite sort key, not as a cascade of comparators, so ordering is stable and testable."
  },
  "repair": {
    "philosophy": "Never silently alter the user's document. Every change is recorded as a RepairNote and surfaced in the UI as an inspectable list.",
    "rules": {
      "heading-skip": "Collapse skipped heading levels (H1 -> H3 becomes H1 -> H2) while preserving relative hierarchy.",
      "duplicate-h1": "The first H1 becomes the document title; subsequent H1s are demoted to H2 and everything below shifts accordingly.",
      "list-nesting": "Normalise inconsistent indentation to the nearest valid nesting level.",
      "mixed-markers": "Unify bullet markers within a single list to the list's dominant marker.",
      "unbalanced-emphasis": "Close unterminated emphasis/strong runs at end of block rather than letting them bleed."
    }
  },
  "pipeline": {
    "order": [
      "remark-parse",
      "remark-frontmatter",
      "remark-gfm",
      "remark-math",
      "remarkRepair (local)",
      "remark-github-blockquote-alert",
      "remark-rehype { allowDangerousHtml: true }",
      "rehype-raw",
      "rehype-sanitize(schema)   <-- TRUST BOUNDARY",
      "rehype-katex",
      "rehypeShiki (local hast visitor)",
      "rehypeMermaidPlaceholder (local)",
      "rehype-stringify"
    ],
    "invariant": "Nothing user-controlled may be introduced after rehype-sanitize. KaTeX, Shiki and Mermaid markup is generated by us, from already-sanitised source, and is therefore trusted."
  },
  "api": {
    "GET /healthz": {
      "response": "200 { status: 'ok', browser: 'up' | 'down' }"
    },
    "POST /api/export/pdf": {
      "request": {
        "contentType": "application/json",
        "body": {
          "html": "string  - complete standalone document, all CSS/fonts/images already inlined as data URIs",
          "title": "string",
          "format": "'A4' | 'Letter'  - default A4",
          "margin": "{ top, right, bottom, left } CSS lengths - optional"
        },
        "bodyLimit": "20971520 (20 MB)"
      },
      "response": "200 application/pdf, Content-Disposition: attachment",
      "errors": {
        "400": "Malformed body or missing html field",
        "413": "Body exceeds bodyLimit (FST_ERR_CTP_BODY_TOO_LARGE)",
        "429": "Concurrency limit reached, Retry-After set",
        "503": "Browser unavailable",
        "504": "Render exceeded the hard deadline"
      }
    }
  },
  "errorBehaviour": {
    "unparseableFile": "Recorded on MarkdownDoc.error; the document appears in the index marked as failed; the rest of the set renders normally.",
    "missingImage": "Renders a styled placeholder figure naming the missing path; never a broken-image icon.",
    "oversizedDrop": "Drops over 200 MB total or 2000 files are rejected before processing with a message naming the actual size.",
    "unsupportedFile": "Recorded in DocumentSet.skipped with a reason; never silently discarded.",
    "pdfTimeout": "504 with a message advising export of the standalone HTML instead.",
    "noMarkdownFound": "Explicit empty-state explaining that no .md or .markdown files were found in the drop."
  },
  "limits": {
    "maxTotalBytes": 209715200,
    "maxFiles": 2000,
    "maxSingleFileBytes": 10485760,
    "pdfBodyLimitBytes": 20971520,
    "pdfRenderDeadlineMs": 30000
  },
  "nonGoals": [
    "Editing markdown in the app",
    "Persistence between sessions",
    "Authentication or multi-user",
    "Cloud sync or remote storage",
    "Live filesystem watching",
    "Themes beyond the archival paper direction"
  ]
}
```


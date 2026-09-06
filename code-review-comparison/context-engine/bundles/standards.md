# Repo rules & engineering standards (qodo BP#4)

## Global engineering principles (CLAUDE.md — user's standing standards)
```markdown
# Working Principles

## 0. Playbooks Library
- At the START of ANY substantial task, use the `sonnet5-protocols` Skill: match the task in its routing index, then read and follow ONLY the single matching pattern file (never bulk-read the library).
- If NO applicable playbook exists: proceed with the task first; at the END, run Pattern AM (`pattern-am-protocol-improver.md`) to compile the learnings into a new pattern — it handles naming, the template, and syncing every index location in one pass.

## 1. Plan-Code Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity
- **Gatekeeper Clause:** Do not write production code until blueprint artifacts are reviewed and approved by the user.

## 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

## 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

## 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness
- **State Reversion:** If post-implementation evaluation fails, revert the commit and re-enter the planning loop rather than patching a flawed design.

## 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "Is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

## 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management
- **Plan First:** Write plan to `tasks/todo.md` with checkable items
- **Verify Plan:** Check in before starting implementation
- **Track Progress:** Mark items complete as you go
- **Explain Changes:** High-level summary at each step
- **Document Results:** Add review section to `tasks/todo.md`
- **Capture Lessons:** Update `tasks/lessons.md` after corrections
- **Atomic Commits:** One descriptive Git commit per discrete task; sync `progress_tracking.json` immediately after.

## Blueprint Artifacts
For enterprise/long-horizon tasks, generate and get approval on these before coding:
- **specification.json** — features, API contracts, and data schemas
- **definition_of_done.md** — objective, testable success criteria per sub-task
- **progress_tracking.json** — sequenced ledger of atomic tasks
- **init.sh** — environment initialization to ensure reproducibility

## Core Principles
- **Simplicity First:** Make every change as simple as possible. Impact minimal code.
- **No Laziness:** Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact:** Changes should only touch what's necessary. Avoid introducing bugs.
```

## Lint rules in force (eslint.config.js)
```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/', 'dist-server/', 'node_modules/', '.claude/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  // Node-side code: the server, and the harness scripts that drive Chromium.
  // These legitimately use process/console and are not part of the bundle.
  //
  // The e2e drive is dual-context: the outer script is Node, but the bodies
  // passed to page.evaluate() are serialised and run inside the browser, so
  // both global sets are in scope within one file and the linter cannot tell
  // them apart.
  {
    files: ['server/**/*.ts', 'tests/e2e/**/*.mjs', '*.config.{ts,js}'],
    languageOptions: {
      globals: {
        // Node
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        // Browser, for page.evaluate() bodies
        document: 'readonly',
        window: 'readonly',
        location: 'readonly',
        performance: 'readonly',
        getComputedStyle: 'readonly',
        File: 'readonly',
        Event: 'readonly',
        atob: 'readonly',
        Uint8Array: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      // A CLI harness reports its results by printing them.
      'no-console': 'off',
    },
  },
)
```

## TypeScript strictness in force (tsconfig.json)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "types": ["vite/client", "node"],

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,

    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,

    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "server", "tests", "vite.config.ts", "vitest.config.ts"]
}
```

## Public claims the code must live up to (README.md)
```markdown
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

## What it looks like

Drop a folder anywhere on the page. Nothing is uploaded.

![The empty state: a cream paper panel on a dark shell, reading "Drop a folder of markdown."](docs/screenshots/dropzone.png)

Documents are typeset as one continuous reading edition — callouts, Mermaid
diagrams, highlighted code and KaTeX maths, with the index as navigation.

![A markdown document set as a book page: serif headings, a drop cap, a note callout and a flow diagram, with a contents index down the left](docs/screenshots/reader.png)

Every repair is listed in the document, with the line, the text before and the
text after. The source file is never modified — the adjustments apply to the
rendering only.

![The repairs panel expanded, listing a duplicate title and a promoted heading with their line numbers and before/after text](docs/screenshots/repairs.png)

---

## What it does

- **Understands a folder, not just a file.** Nested directories, frontmatter
  ordering, numeric filename prefixes, `README`/`index` conventions, and
  relative links between documents that become real in-app navigation.
- **Renders the whole of markdown.** GFM tables, footnotes and task lists;
  `> [!NOTE]` callouts; KaTeX maths; Shiki syntax highlighting; Mermaid
  diagrams; local images with figure captions and a lightbox.
- **Repairs messy markdown, and says so.** Five rules — skipped heading levels,
  duplicate H1s, broken list nesting, mixed bullet markers and unbalanced
  emphasis — are normalised for the rendering, never in the source file. Every
  change is listed in the document with its line number and its before/after
  text, because silently editing someone's writing is not acceptable behaviour
  for a reader.
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
```

## Design-system agent skills available to this repo
beautiful-shadows
book-serif-index
editorial-tech
LICENSE
light-mode-paper-technical
masked-reveal
progressive-blur
scroll-progress-timeline

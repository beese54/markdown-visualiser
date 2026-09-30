# Dependencies

> Dependencies that would be hard to replace or could significantly affect the application.

## Critical Dependencies

### Playwright (`playwright-core` and the `mcr.microsoft.com/playwright` image)

- Purpose: headless Chromium for PDF generation (`server/pdf.ts`).
- Current version: `playwright-core` 1.62.1 (exact pin); base image `v1.62.1-noble`.
- Why it is used: the PDF is printed from the same HTML the reader shows, so a real browser engine is required. The image supplies Chromium and its OS dependencies but not the npm package, so `playwright-core` is installed separately.
- Replacement difficulty: medium. Print options (header and footer templates, `preferCSSPageSize`, request routing) are Playwright-specific, and the security model depends on its context-level routing.
- Upgrade considerations: change the npm pin and the Dockerfile tag together, or the executable lookup breaks. Re-run the export drive and adversarial probe.
- Known limitations: the image is 3.63 GB because it ships three browsers. `page.pdf()` takes no timeout of its own, so it is bounded through the page default timeout.

### unified / remark / rehype ecosystem

- Purpose: the markdown-to-HTML pipeline (`unified`, `remark-parse`, `remark-gfm`, `remark-math`, `remark-frontmatter`, `remark-github-blockquote-alert`, `remark-rehype`, `rehype-raw`, `rehype-sanitize`, `rehype-katex`, `rehype-stringify`, plus `hast-util-sanitize`, `unist-util-visit`).
- Current version: `unified` ^11.0.5, `remark-rehype` ^11.1.2, `rehype-sanitize` ^6.0.0 (from `package.json` ranges).
- Why it is used: a single AST-based chain lets sanitisation be placed at an exact point.
- Replacement difficulty: high. The repair plugin, sanitise schema and asset and link plugins are written against mdast and hast.
- Upgrade considerations: the sanitiser's semantics matter. `hast-util-sanitize` allows an attribute if any definition matches, which the schema has to work around (see [MAINTENANCE.md](MAINTENANCE.md#fragile-areas)). Re-run the hostile-payload tests.
- Known limitations: `rehype-katex` is used without `throwOnError` and renders errors inline.

### Fastify (`fastify`, `@fastify/static`)

- Purpose: HTTP server, static hosting, body limits, logging.
- Current version: `fastify` ^5.6.1, `@fastify/static` ^8.2.0.
- Replacement difficulty: low, since the server is one small file.
- Upgrade considerations: 413 for oversized bodies and the Pino logger rely on Fastify defaults.

### p-limit

- Purpose: concurrency limit on renders.
- Current version: ^7.1.0.
- Replacement difficulty: low. The 429 behaviour depends on its `activeCount`, `pendingCount` and `concurrency`.

### Shiki

- Purpose: syntax highlighting (loaded lazily by language).
- Current version: ^4.4.3.
- Replacement difficulty: medium. `tasks/todo.md` and `definition_of_done.md` state the JS regex engine is used so no WASM is bundled. The plugin was not read: uncertain — verify with developer.
- Upgrade considerations: highlighting output uses `--shiki-*` CSS variables that the stylesheets map onto colour (`tasks/todo.md`).

### Mermaid

- Purpose: diagrams, drawn client-side and lazily loaded (a chunk of about 3 MB according to `tasks/todo.md`).
- Current version: ^11.17.2.
- Replacement difficulty: medium. Diagrams must be drawn as static SVG before export, because the print context has no JavaScript.
- Upgrade considerations: it measures text, so it needs a laid-out DOM (`src/export/standalone.ts`).

### KaTeX

- Purpose: maths rendering. Version ^0.16.22. Its stylesheet is required to hide the MathML copy, otherwise every equation prints twice (`tasks/todo.md`).

### React 19, Vite 7, Zustand, TypeScript

- Purpose: UI, build and client state. Versions: React ^19.2.0, Vite ^7.1.9, Zustand ^5.0.8, TypeScript ^5.9.3.
- Replacement difficulty: high for React (whole reader UI), low for Zustand (one store).
- All are `devDependencies`, because Vite bundles them into `dist/`.

### Fonts (Fraunces, Newsreader, IBM Plex Mono via `@fontsource`)

- Purpose: typography, self-hosted (SIL OFL).
- Why it matters: self-hosting is what keeps the app free of third-party requests and lets the HTML export work offline.

### Design source: MengTo/Skills

- Purpose: design direction, credited in [CREDITS.md](../CREDITS.md). `init.sh` vendors selected skills from the GitHub repository into `.claude/skills/mengto/`. This is not a runtime dependency, and a failed clone does not stop `init.sh`.

<!-- sources: package.json, Dockerfile, init.sh, server/pdf.ts, src/pipeline/sanitize.ts, src/export/standalone.ts, tasks/todo.md, definition_of_done.md, README.md -->

# Data Model

> Entities, relationships, constraints, ownership and business rules.

## Overview

There is no database. The data model is a set of in-memory TypeScript types in `src/types/domain.ts`, created when a folder is dropped and discarded on reset or reload. `specification.json` is said to hold the matching schemas but was not read for this document: uncertain — verify with developer.

<!-- sources: src/types/domain.ts, src/state/store.ts -->

## Entities

| Entity | Purpose | Key fields |
|---|---|---|
| `DocumentSet` | One drop. | `id`, `rootName` (folder name or `Documents`), `docs` (in reading order), `assets`, `skipped`, `totalBytes`, `createdAt` |
| `MarkdownDoc` | One markdown file. | `id` (FNV-1a hash of the normalised path, base 36), `path`, `dir`, `filename`, `title`, `frontmatter`, `raw`, `order`, `sortKey`, `error` |
| `AssetRef` | A non-markdown image. | `path` (lowercased normalised key), `originalPath`, `url` (object URL), `mime`, `bytes` |
| `SkippedFile` | A file not used. | `path`, `reason` |
| `RenderResult` | Output of the pipeline for one document. | `docId`, `html` (sanitised), `headings` (tree), `repairs`, `mermaidBlocks`, `wordCount`, `readingMinutes` |
| `Heading` | Index tree node. | `id` (slug), `depth` 1–6, `text`, `children` |
| `RepairNote` | One recorded repair. | `rule`, `line`, `before`, `after`, `detail` |
| `MermaidBlock` | A diagram to draw. | `id` (content-hashed), `code` |
| `IngestError` | Failure of the whole drop. | `code`: `too-large`, `too-many-files`, `no-markdown`, `read-failed` |

`RepairRule` is one of `heading-skip`, `duplicate-h1`, `list-nesting`, `mixed-markers`, `unbalanced-emphasis`.

<!-- sources: src/types/domain.ts, src/ingest/docset.ts -->

## Relationships

A `DocumentSet` has many `MarkdownDoc`, many `AssetRef` and many `SkippedFile`. Each `MarkdownDoc` has zero or one `RenderResult` in the render cache (a `WeakMap` keyed by the set object), which has many `Heading`, `RepairNote` and `MermaidBlock`. Documents refer to each other and to assets by relative path, resolved by `src/ingest/links.ts` and `assets.ts`.

<!-- sources: src/types/domain.ts, src/state/render.ts, src/ingest/links.ts -->

## Constraints and Indexes

- Limits (`LIMITS`): 2000 files, 200 MB total, 10 MB per markdown file, 20 MB PDF body, 30 s render deadline.
- Recognised markdown extensions: `.md`, `.markdown`, `.mdown`, `.mkd`. Image extensions: `.png .jpg .jpeg .gif .webp .avif .svg .bmp .ico`.
- `MarkdownDoc.id` derives from the path only. Two documents cannot share a path. Hash collisions are not handled: uncertain — verify with developer.
- Asset keys are normalised (backslashes, `./`, duplicate slashes, leading slash, lowercase). On a duplicate key the first file wins.
- The link index maps paths, extensionless paths and directory paths (to `README` or `index`). A key that matches two different documents is removed as ambiguous.
- `DocumentSet.id` includes `Date.now()`, so it is not stable across drops.
- Reading order is by `sortKey` (see below). Ties break on path.

<!-- sources: src/types/domain.ts, src/ingest/assets.ts, src/ingest/links.ts, src/ingest/docset.ts, src/ingest/ordering.ts -->

## Ownership and Retention

The set is owned by the browser tab that created it (the Zustand store). It has no retention: reset or replacing the set revokes all object URLs, and a reload discards everything. The server retains nothing. The render cache is weakly keyed to the set. A failed document is retained in the set with `error` set.

<!-- sources: src/state/store.ts, src/state/render.ts, server/pdf.ts -->

## Migrations

Not applicable: no persisted schema.

<!-- sources: src/state/store.ts -->

## Business Rules

- **Title:** `frontmatter.title`, else first ATX or setext H1, else prettified filename (numeric prefix stripped, words capitalised).
- **Reading order,** highest priority first: directory grouping (root files first, nested directories together); explicit frontmatter `order` (numeric or numeric string); index names (`readme`, `index`, `introduction`, `intro`, `overview`, `start`, `getting-started`, `home`, `00`, `_index`, `summary`); numeric filename prefix (`01-`, `2_`, `003.`); natural alphabetical. Index rank deliberately outranks numeric prefix. Missing values sort last within their rank.
- **Ignored directories:** `.git`, `.svn`, `.hg`, `node_modules`, `.next`, `.nuxt`, `dist`, `build`, `.cache`, `.idea`, `.vscode`, `__pycache__`, `.venv`, `venv`. Also `.DS_Store` and `Thumbs.db`.
- **Frontmatter:** a leading `---` block (an optional BOM is allowed). Invalid YAML is left in the body as content.
- **Common root:** if every file shares one top-level folder, it becomes `rootName` and is stripped from paths.
- **Repairs** never touch the source, are always reported, and:
  - drop a leading H1 that repeats the document title;
  - demote later H1s to H2 and shift their subtree;
  - promote a heading with no parent;
  - pull a heading with a skipped level up to one below its parent;
  - lift the children of a list item that contains only a list;
  - normalise the tight/loose spacing of a list;
  - report unclosed `**` or `__` as rendered literally.
- **Reading time:** words ÷ 220, rounded, minimum 1.
- **Links:** classified `internal`, `external`, `anchor` or `missing`. A relative `.md` link that resolves to nothing is `missing`.
- **Images:** a lookup falls back to a basename match, and refuses ambiguous ones.

<!-- sources: src/ingest/ordering.ts, src/ingest/docset.ts, src/ingest/walker.ts, src/pipeline/plugins/remark-repair.ts, src/pipeline/render.ts, src/ingest/links.ts, src/ingest/assets.ts -->

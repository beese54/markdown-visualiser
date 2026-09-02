/**
 * Core domain model. Mirrors the schemas in specification.json.
 *
 * The whole app is a pure function of a DocumentSet: ingest produces one,
 * the pipeline renders each document in it, the reader displays it, and the
 * exporter serialises it. Nothing else holds state about the user's files.
 */

/** A non-markdown file (image, etc.) registered during ingest. */
export interface AssetRef {
  /** Normalised POSIX relative path, lowercased — the lookup key. */
  readonly path: string
  /** The path exactly as it appeared in the drop, for display and diagnostics. */
  readonly originalPath: string
  /** Object URL, valid for the lifetime of the session. */
  readonly url: string
  readonly mime: string
  readonly bytes: number
}

export interface Heading {
  /** Slug, unique within its document. */
  readonly id: string
  /** 1..6, after the repair pass has normalised the hierarchy. */
  readonly depth: number
  readonly text: string
  readonly children: Heading[]
}

export type RepairRule =
  | 'heading-skip'
  | 'duplicate-h1'
  | 'list-nesting'
  | 'mixed-markers'
  | 'unbalanced-emphasis'
  | 'trailing-ws'

/**
 * A single recorded change made by the repair pass.
 *
 * These exist so the UI can show the user exactly what was altered. Repairing
 * a document without reporting it would be editing someone's writing behind
 * their back, which this app does not do.
 */
export interface RepairNote {
  readonly rule: RepairRule
  readonly line: number | null
  readonly before: string
  readonly after: string
  readonly detail: string
}

export interface MarkdownDoc {
  /** Stable hash of the relative path. */
  readonly id: string
  /** Normalised POSIX relative path from the drop root. */
  readonly path: string
  readonly dir: string
  readonly filename: string
  /** frontmatter.title, else the first H1, else a prettified filename. */
  readonly title: string
  readonly frontmatter: Readonly<Record<string, unknown>>
  readonly raw: string
  /** Explicit frontmatter `order`, when present. */
  readonly order: number | null
  /** Composite key computed by ordering.ts; sorting is a plain string compare. */
  readonly sortKey: string
  /** Per-file failure. A failed document never fails the whole set. */
  readonly error: string | null
}

export interface SkippedFile {
  readonly path: string
  readonly reason: string
}

export interface DocumentSet {
  readonly id: string
  /** The dropped folder's name, or 'Documents' for loose files. */
  readonly rootName: string
  /** In resolved reading order. */
  readonly docs: readonly MarkdownDoc[]
  readonly assets: ReadonlyMap<string, AssetRef>
  readonly skipped: readonly SkippedFile[]
  readonly totalBytes: number
  readonly createdAt: number
}

export interface MermaidBlock {
  /** Content-hashed, so a re-render of unchanged source reuses the id and a
   *  changed diagram never collides with the previous one's cached defs. */
  readonly id: string
  readonly code: string
}

export interface RenderResult {
  readonly docId: string
  /** Sanitised, then KaTeX- and Shiki-processed. Safe to inject. */
  readonly html: string
  readonly headings: readonly Heading[]
  readonly repairs: readonly RepairNote[]
  readonly mermaidBlocks: readonly MermaidBlock[]
  readonly wordCount: number
  readonly readingMinutes: number
}

/** Hard limits from specification.json. Enforced at ingest, before any work. */
export const LIMITS = {
  maxTotalBytes: 200 * 1024 * 1024,
  maxFiles: 2000,
  maxSingleFileBytes: 10 * 1024 * 1024,
  pdfBodyLimitBytes: 20 * 1024 * 1024,
  pdfRenderDeadlineMs: 30_000,
} as const

export const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd'] as const

export const IMAGE_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.bmp', '.ico',
] as const

export class IngestError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'too-large'
      | 'too-many-files'
      | 'no-markdown'
      | 'read-failed',
  ) {
    super(message)
    this.name = 'IngestError'
  }
}

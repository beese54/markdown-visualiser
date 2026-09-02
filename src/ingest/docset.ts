import { parse as parseYaml } from 'yaml'

import type { DocumentSet, MarkdownDoc, SkippedFile } from '@/types/domain'
import { LIMITS, MARKDOWN_EXTENSIONS, IngestError } from '@/types/domain'
import { buildAssetMap, extensionOf, isImagePath, normaliseAssetPath } from './assets'
import { computeSortKey, prettifyFilename, sortByReadingOrder } from './ordering'
import type { WalkedFile } from './walker'

/**
 * Turn a walked file list into a DocumentSet.
 *
 * Resilience is the governing rule here: a set is built from files written by
 * different people at different times, and one bad file must never cost the
 * user the other ninety-nine. Every failure is recorded - on the document as
 * `error`, or in `skipped` - and nothing is discarded silently.
 */

const isMarkdownPath = (path: string): boolean =>
  (MARKDOWN_EXTENSIONS as readonly string[]).includes(extensionOf(path))

/** Stable, collision-resistant id derived from the path. FNV-1a. */
export function hashPath(path: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36).padStart(7, '0')
}

// The optional BOM is written as an escape rather than a literal so the
// source stays plain ASCII. Files saved by Windows editors often carry one,
// and an unhandled BOM stops the frontmatter block from matching at all.
const FRONTMATTER_RE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

export interface Frontmatter {
  readonly data: Record<string, unknown>
  /** The document body with the frontmatter block removed. */
  readonly body: string
}

/**
 * Extract YAML frontmatter. Malformed YAML is not an error the user should
 * have to care about - the block is left in place as content and parsing
 * continues, which is what every markdown tool they already use does.
 */
export function extractFrontmatter(raw: string): Frontmatter {
  const match = FRONTMATTER_RE.exec(raw)
  if (!match?.[1]) return { data: {}, body: raw }

  try {
    const parsed: unknown = parseYaml(match[1])
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { data: {}, body: raw.slice(match[0].length) }
    }
    return {
      data: parsed as Record<string, unknown>,
      body: raw.slice(match[0].length),
    }
  } catch {
    return { data: {}, body: raw }
  }
}

/** First ATX or setext H1 in the body, if there is one. */
export function firstHeading(body: string): string | null {
  const atx = /^[ \t]{0,3}#[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(body)
  if (atx?.[1]) return atx[1].trim()

  const setext = /^[ \t]{0,3}(\S.*)\r?\n[ \t]{0,3}=+[ \t]*$/m.exec(body)
  if (setext?.[1]) return setext[1].trim()

  return null
}

function coerceOrder(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function coerceTitle(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** Enforce the hard limits before any parsing work is done. */
export function assertWithinLimits(files: readonly WalkedFile[]): void {
  if (files.length > LIMITS.maxFiles) {
    throw new IngestError(
      `That drop contains ${files.length.toLocaleString()} files. The limit is ` +
        `${LIMITS.maxFiles.toLocaleString()} — try dropping a single folder instead.`,
      'too-many-files',
    )
  }

  const total = files.reduce((sum, f) => sum + f.file.size, 0)
  if (total > LIMITS.maxTotalBytes) {
    throw new IngestError(
      `That drop is ${formatBytes(total)}. The limit is ${formatBytes(LIMITS.maxTotalBytes)}.`,
      'too-large',
    )
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}

export interface BuildOptions {
  readonly rootName: string
}

export async function buildDocumentSet(
  files: readonly WalkedFile[],
  opts: BuildOptions,
): Promise<DocumentSet> {
  assertWithinLimits(files)

  const skipped: SkippedFile[] = []
  const markdownFiles: WalkedFile[] = []
  const imageFiles: WalkedFile[] = []

  for (const entry of files) {
    if (isMarkdownPath(entry.path)) {
      if (entry.file.size > LIMITS.maxSingleFileBytes) {
        skipped.push({
          path: entry.path,
          reason: `${formatBytes(entry.file.size)} exceeds the ${formatBytes(
            LIMITS.maxSingleFileBytes,
          )} single-file limit`,
        })
        continue
      }
      markdownFiles.push(entry)
    } else if (isImagePath(entry.path)) {
      imageFiles.push(entry)
    } else {
      skipped.push({ path: entry.path, reason: 'not a markdown or image file' })
    }
  }

  if (markdownFiles.length === 0) {
    throw new IngestError(
      files.length === 0
        ? 'Nothing was dropped.'
        : `No markdown files found among ${files.length.toLocaleString()} files. ` +
          `Looked for ${MARKDOWN_EXTENSIONS.join(', ')}.`,
      'no-markdown',
    )
  }

  const docs = await Promise.all(
    markdownFiles.map((entry) => readDoc(entry).catch((err: unknown) => failedDoc(entry, err))),
  )

  return {
    id: hashPath(`${opts.rootName}:${Date.now()}`),
    rootName: opts.rootName,
    docs: sortByReadingOrder(docs),
    assets: buildAssetMap(imageFiles),
    skipped,
    totalBytes: files.reduce((sum, f) => sum + f.file.size, 0),
    createdAt: Date.now(),
  }
}

async function readDoc(entry: WalkedFile): Promise<MarkdownDoc> {
  const raw = await entry.file.text()
  const { data, body } = extractFrontmatter(raw)

  const path = normaliseAssetPath(entry.path)
  const slash = path.lastIndexOf('/')
  const filename = slash === -1 ? path : path.slice(slash + 1)
  const dir = slash === -1 ? '' : path.slice(0, slash)
  const order = coerceOrder(data['order'])

  return {
    id: hashPath(path),
    path,
    dir,
    filename,
    title:
      coerceTitle(data['title']) ?? firstHeading(body) ?? prettifyFilename(filename),
    frontmatter: data,
    raw,
    order,
    sortKey: computeSortKey({ path, order }),
    error: null,
  }
}

/**
 * A document that could not be read still appears in the index, marked as
 * failed. Dropping it silently would leave the user hunting for a file they
 * know they included.
 */
function failedDoc(entry: WalkedFile, err: unknown): MarkdownDoc {
  const path = normaliseAssetPath(entry.path)
  const slash = path.lastIndexOf('/')
  const filename = slash === -1 ? path : path.slice(slash + 1)

  return {
    id: hashPath(path),
    path,
    dir: slash === -1 ? '' : path.slice(0, slash),
    filename,
    title: prettifyFilename(filename),
    frontmatter: {},
    raw: '',
    order: null,
    sortKey: computeSortKey({ path, order: null }),
    error: err instanceof Error ? err.message : 'Could not read this file',
  }
}

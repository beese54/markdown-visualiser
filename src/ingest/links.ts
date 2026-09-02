import type { DocumentSet, MarkdownDoc } from '@/types/domain'
import { normaliseAssetPath, resolveRelative } from './assets'

/**
 * Resolution of links between documents in a set.
 *
 * A folder of markdown is written to be read on disk, so its links point at
 * `../guide/setup.md`. In the reader those must become navigation within the
 * set, or every cross-reference is a dead end. Links that point outside the
 * set stay external and open normally.
 */

export type LinkTarget =
  | { readonly kind: 'internal'; readonly docId: string; readonly hash: string | null }
  | { readonly kind: 'external'; readonly href: string }
  | { readonly kind: 'anchor'; readonly hash: string }
  | { readonly kind: 'missing'; readonly href: string }

const EXTERNAL_SCHEME = /^[a-z][a-z0-9+.-]*:/i

/** Index documents by every path a link might plausibly use to reach them. */
export function buildDocIndex(docs: readonly MarkdownDoc[]): Map<string, string> {
  const index = new Map<string, string>()
  const ambiguous = new Set<string>()

  const add = (key: string, docId: string) => {
    const normalised = normaliseAssetPath(key)
    if (normalised === '') return
    const existing = index.get(normalised)
    if (existing !== undefined && existing !== docId) {
      ambiguous.add(normalised)
      return
    }
    index.set(normalised, docId)
  }

  for (const doc of docs) {
    add(doc.path, doc.id)
    // Links are commonly written without the extension, and directory links
    // (`../guide/`) are expected to land on that directory's index file.
    add(doc.path.replace(/\.(md|markdown|mdown|mkd)$/i, ''), doc.id)
  }

  for (const doc of docs) {
    const base = doc.filename.replace(/\.(md|markdown|mdown|mkd)$/i, '')
    if (['readme', 'index'].includes(base.toLowerCase())) {
      add(doc.dir === '' ? '.' : doc.dir, doc.id)
    }
  }

  // A key that matched two different documents cannot be resolved safely.
  for (const key of ambiguous) index.delete(key)

  return index
}

/**
 * Classify a link as written in `fromDoc`.
 *
 * `missing` is deliberately distinct from `external`: a relative path that
 * looks like markdown but resolves to nothing is a broken cross-reference,
 * and the reader marks it rather than rendering a link that goes nowhere.
 */
export function resolveLink(
  href: string,
  fromDoc: MarkdownDoc,
  docIndex: ReadonlyMap<string, string>,
): LinkTarget {
  const trimmed = href.trim()

  if (trimmed === '') return { kind: 'external', href }
  if (trimmed.startsWith('#')) return { kind: 'anchor', hash: trimmed.slice(1) }
  if (EXTERNAL_SCHEME.test(trimmed)) return { kind: 'external', href: trimmed }
  if (trimmed.startsWith('//')) return { kind: 'external', href: trimmed }

  const hashAt = trimmed.indexOf('#')
  const pathPart = hashAt === -1 ? trimmed : trimmed.slice(0, hashAt)
  const hash = hashAt === -1 ? null : trimmed.slice(hashAt + 1)

  if (pathPart === '') {
    return hash === null ? { kind: 'external', href } : { kind: 'anchor', hash }
  }

  const resolved = resolveRelative(fromDoc.path, pathPart)

  const direct = docIndex.get(resolved)
  if (direct !== undefined) return { kind: 'internal', docId: direct, hash }

  const withoutExt = docIndex.get(resolved.replace(/\.(md|markdown|mdown|mkd)$/i, ''))
  if (withoutExt !== undefined) return { kind: 'internal', docId: withoutExt, hash }

  const asDir = docIndex.get(resolved.replace(/\/$/, ''))
  if (asDir !== undefined) return { kind: 'internal', docId: asDir, hash }

  // Looks like a document reference but resolves to nothing in this set.
  if (/\.(md|markdown|mdown|mkd)$/i.test(pathPart)) {
    return { kind: 'missing', href: trimmed }
  }

  return { kind: 'external', href: trimmed }
}

/** Convenience wrapper for a whole set. */
export function makeLinkResolver(set: DocumentSet) {
  const index = buildDocIndex(set.docs)
  return (href: string, fromDoc: MarkdownDoc): LinkTarget =>
    resolveLink(href, fromDoc, index)
}

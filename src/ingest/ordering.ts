/**
 * Reading order for a document set.
 *
 * Rather than a cascade of comparator functions, every document is reduced to
 * one composite string key and the set is sorted with a plain string compare.
 * That makes ordering deterministic, trivially testable, and stable under
 * equal keys - and it means a bug is visible by printing the key rather than
 * by stepping through comparator branches.
 *
 * Key shape, dot-joined, most significant first:
 *
 *   <dirRank>.<explicitOrder>.<indexRank>.<numericPrefix>.<naturalName>
 */

/** Filenames that conventionally open a directory. */
const INDEX_NAMES = new Set([
  'readme', 'index', 'introduction', 'intro', 'overview', 'start',
  'getting-started', 'home', '00', '_index', 'summary',
])

/** Pad a number so string comparison matches numeric comparison. */
const pad = (n: number, width = 8) =>
  Math.max(0, Math.floor(n)).toString().padStart(width, '0')

/** Extract a leading number from `01-intro`, `2_setup`, `003.overview`. */
export function numericPrefix(filename: string): number | null {
  const match = /^(\d{1,6})[\s._-]/.exec(filename)
  if (!match?.[1]) return null
  return Number.parseInt(match[1], 10)
}

/** Filename without its extension, lowercased. */
export function stem(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return (dot > 0 ? filename.slice(0, dot) : filename).toLowerCase()
}

/**
 * Natural-order key: digit runs are zero-padded so `file2` sorts before
 * `file10`, which plain lexicographic compare gets backwards.
 */
export function naturalKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\d+/g, (digits) => pad(Number.parseInt(digits, 10)))
}

/**
 * Directory rank. Files at the root sort before files in subdirectories, and
 * subdirectories stay grouped, so a nested section reads as a unit rather
 * than being interleaved with its siblings.
 */
function directoryKey(dir: string): string {
  if (dir === '') return `${pad(0, 3)}.`
  const segments = dir.split('/')
  return `${pad(segments.length, 3)}.${segments.map(naturalKey).join('/')}`
}

export interface OrderableDoc {
  /** POSIX relative path from the drop root. */
  readonly path: string
  /** Explicit `order` from YAML frontmatter, when present and numeric. */
  readonly order: number | null
}

/**
 * Compute the composite sort key for one document.
 *
 * Precedence, highest first:
 *   1. Directory grouping (root before nested; nested stay together)
 *   2. Explicit frontmatter `order`
 *   3. Conventional index names (README, index, overview, ...) open a folder
 *   4. Numeric filename prefix
 *   5. Natural alphabetical on the filename stem
 *
 * Index rank outranks the numeric prefix deliberately: a folder containing
 * README.md alongside 01-basics.md should open on the README. Ranking the
 * prefix first buries the folder's own introduction below its chapters.
 */
export function computeSortKey(doc: OrderableDoc): string {
  const slash = doc.path.lastIndexOf('/')
  const dir = slash === -1 ? '' : doc.path.slice(0, slash)
  const filename = slash === -1 ? doc.path : doc.path.slice(slash + 1)
  const base = stem(filename)

  // Absent values sort last within their rank, never first.
  const explicit = doc.order === null ? pad(Number.MAX_SAFE_INTEGER) : pad(doc.order)
  const prefix = numericPrefix(filename)
  const numeric = prefix === null ? pad(Number.MAX_SAFE_INTEGER) : pad(prefix)
  const indexRank = INDEX_NAMES.has(base) ? '0' : '1'

  return [directoryKey(dir), explicit, indexRank, numeric, naturalKey(base)].join('.')
}

/** Sort a set of documents into reading order. Does not mutate the input. */
export function sortByReadingOrder<T extends { sortKey: string; path: string }>(
  docs: readonly T[],
): T[] {
  return [...docs].sort(
    (a, b) => a.sortKey.localeCompare(b.sortKey) || a.path.localeCompare(b.path),
  )
}

/** Turn `02-getting-started.md` into `Getting Started` for a fallback title. */
export function prettifyFilename(filename: string): string {
  const base = stem(filename).replace(/^\d{1,6}[\s._-]+/, '')
  const words = base.replace(/[-_.]+/g, ' ').trim()
  if (words === '') return stem(filename)
  return words.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

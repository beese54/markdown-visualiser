/**
 * Recursive walk of a dropped folder.
 *
 * Uses `DataTransferItem.webkitGetAsEntry()` rather than the newer
 * `getAsFileSystemHandle()`: despite the vendor prefix, the entry API is the
 * only one implemented across Chrome, Firefox and Safari. The File System
 * Access API remains Chromium-only, and a reader that silently refuses to
 * accept folders in Safari is not a reader.
 */

export interface WalkedFile {
  /** POSIX relative path from the drop root, e.g. `guide/img/diagram.png`. */
  readonly path: string
  readonly file: File
}

export interface WalkOptions {
  /** Abort once this many files have been collected. */
  readonly maxFiles: number
  /** Called as entries are discovered, for progress reporting. */
  readonly onProgress?: (count: number) => void
}

/** Directories that never contain anything a reader wants. */
const IGNORED_DIRS = new Set([
  '.git', '.svn', '.hg', 'node_modules', '.next', '.nuxt', 'dist', 'build',
  '.cache', '.idea', '.vscode', '__pycache__', '.venv', 'venv', '.DS_Store',
])

const isIgnoredName = (name: string) =>
  IGNORED_DIRS.has(name) || name === '.DS_Store' || name === 'Thumbs.db'

/**
 * `readEntries` does NOT return a directory's full contents in one call.
 * Chromium caps each batch at around 100 entries and signals completion by
 * returning an empty array. Calling it once - the obvious implementation -
 * silently truncates large folders, which presents as files "randomly"
 * missing from the import. It must be drained in a loop.
 */
function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = []

    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all)
          return
        }
        all.push(...batch)
        readBatch()
      }, reject)
    }

    readBatch()
  })
}

const entryToFile = (entry: FileSystemFileEntry): Promise<File> =>
  new Promise((resolve, reject) => entry.file(resolve, reject))

async function walkEntry(
  entry: FileSystemEntry,
  prefix: string,
  out: WalkedFile[],
  opts: WalkOptions,
): Promise<void> {
  if (out.length >= opts.maxFiles) return
  if (isIgnoredName(entry.name)) return

  const path = prefix ? `${prefix}/${entry.name}` : entry.name

  if (entry.isFile) {
    try {
      out.push({ path, file: await entryToFile(entry as FileSystemFileEntry) })
      opts.onProgress?.(out.length)
    } catch {
      // A single unreadable file must not abort the whole import. It is
      // simply absent; docset.ts reports what it expected but did not get.
    }
    return
  }

  if (entry.isDirectory) {
    const dir = entry as FileSystemDirectoryEntry
    const children = await readAllEntries(dir.createReader())
    for (const child of children) {
      await walkEntry(child, path, out, opts)
      if (out.length >= opts.maxFiles) return
    }
  }
}

/**
 * Collect every file from a drop, whether the user dropped folders, loose
 * files, or a mixture of both.
 */
export async function walkDataTransfer(
  dt: DataTransfer,
  opts: WalkOptions,
): Promise<WalkedFile[]> {
  const out: WalkedFile[] = []

  // The DataTransferItemList is emptied when the drop event handler returns,
  // so entries must be captured synchronously before the first await.
  const entries: (FileSystemEntry | null)[] = []
  const looseFiles: File[] = []

  for (const item of Array.from(dt.items)) {
    if (item.kind !== 'file') continue
    const entry = item.webkitGetAsEntry?.() ?? null
    if (entry) {
      entries.push(entry)
    } else {
      // Browsers without the entry API still give us flat files.
      const file = item.getAsFile()
      if (file) looseFiles.push(file)
    }
  }

  for (const entry of entries) {
    if (entry) await walkEntry(entry, '', out, opts)
  }

  for (const file of looseFiles) {
    if (out.length >= opts.maxFiles) break
    if (isIgnoredName(file.name)) continue
    out.push({ path: file.name, file })
    opts.onProgress?.(out.length)
  }

  return out
}

/** Collect files from an `<input type="file" webkitdirectory>` fallback. */
export function walkFileList(files: FileList, opts: WalkOptions): WalkedFile[] {
  const out: WalkedFile[] = []
  for (const file of Array.from(files)) {
    if (out.length >= opts.maxFiles) break
    // webkitRelativePath is populated for directory pickers, empty otherwise.
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath
    const path = rel && rel.length > 0 ? rel : file.name
    if (path.split('/').some(isIgnoredName)) continue
    out.push({ path, file })
    opts.onProgress?.(out.length)
  }
  return out
}

/**
 * Determine the common root folder name and strip it from every path, so a
 * drop of `handbook/` yields paths relative to the handbook, not to the
 * desktop it happened to be sitting on.
 */
export function stripCommonRoot(files: readonly WalkedFile[]): {
  rootName: string
  files: WalkedFile[]
} {
  if (files.length === 0) return { rootName: 'Documents', files: [] }

  const firstSegments = new Set(
    files.map((f) => (f.path.includes('/') ? f.path.slice(0, f.path.indexOf('/')) : null)),
  )

  // Only strip when every file shares one real directory prefix.
  if (firstSegments.size === 1) {
    const root = [...firstSegments][0]
    if (root) {
      return {
        rootName: root,
        files: files.map((f) => ({ ...f, path: f.path.slice(root.length + 1) })),
      }
    }
  }

  return { rootName: 'Documents', files: [...files] }
}

import type { AssetRef } from '@/types/domain'
import { IMAGE_EXTENSIONS } from '@/types/domain'

/**
 * Asset registry for a dropped set.
 *
 * Images are held as object URLs rather than data URIs: a folder of
 * screenshots is easily tens of megabytes, and base64 inflates that by a
 * third while blocking the main thread to encode. The export path converts
 * to data URIs at the point of export, where paying that cost is warranted.
 */

/**
 * Normalise a path for lookup. Markdown authors are inconsistent about
 * `./`, backslashes, and case - especially across Windows and macOS - so the
 * key is aggressively canonicalised while `originalPath` keeps the truth.
 */
export function normaliseAssetPath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/')
    .replace(/^\//, '')
    .toLowerCase()
}

/** Resolve a link relative to the document that contains it. */
export function resolveRelative(fromDocPath: string, target: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return target // absolute URL scheme
  if (target.startsWith('/')) return normaliseAssetPath(target)

  const slash = fromDocPath.lastIndexOf('/')
  const baseDir = slash === -1 ? '' : fromDocPath.slice(0, slash)

  const segments = baseDir === '' ? [] : baseDir.split('/')
  for (const part of target.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') segments.pop()
    else segments.push(part)
  }
  return normaliseAssetPath(segments.join('/'))
}

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
}

export function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot === -1 ? '' : path.slice(dot).toLowerCase()
}

export const isImagePath = (path: string): boolean =>
  (IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(path))

export function mimeFor(path: string, fallback: string): string {
  return MIME_BY_EXT[extensionOf(path)] ?? (fallback !== '' ? fallback : 'application/octet-stream')
}

/**
 * Build the asset map. Object URLs are owned by the returned map; call
 * `revokeAssets` when the set is discarded or the browser leaks them for the
 * lifetime of the document.
 */
export function buildAssetMap(
  files: readonly { path: string; file: File }[],
): Map<string, AssetRef> {
  const map = new Map<string, AssetRef>()

  for (const { path, file } of files) {
    if (!isImagePath(path)) continue
    const key = normaliseAssetPath(path)
    if (map.has(key)) continue // first wins; a duplicate key is a collision, not an update

    // The blob is retyped from the file extension rather than trusting
    // `file.type`. A File produced by a directory drop often carries an empty
    // type, and an untyped blob becomes `data:text/plain` when the exporter
    // reads it back - which no browser will render as an image.
    const mime = mimeFor(path, file.type)
    const typed = file.type === mime ? file : new Blob([file], { type: mime })

    map.set(key, {
      path: key,
      originalPath: path,
      url: URL.createObjectURL(typed),
      mime,
      bytes: file.size,
    })
  }

  return map
}

/**
 * Look up an asset by a link as written in a document, resolved against that
 * document's location. Also tries a basename match, because authors move
 * files and leave stale relative paths behind more often than not.
 */
export function lookupAsset(
  assets: ReadonlyMap<string, AssetRef>,
  fromDocPath: string,
  target: string,
): AssetRef | null {
  const resolved = resolveRelative(fromDocPath, target)
  const direct = assets.get(resolved)
  if (direct) return direct

  const bare = resolved.slice(resolved.lastIndexOf('/') + 1)
  if (bare === '') return null

  let match: AssetRef | null = null
  for (const asset of assets.values()) {
    if (asset.path.endsWith(`/${bare}`) || asset.path === bare) {
      // Ambiguous basename: refuse rather than guess at the wrong image.
      if (match) return null
      match = asset
    }
  }
  return match
}

export function revokeAssets(assets: ReadonlyMap<string, AssetRef>): void {
  for (const asset of assets.values()) URL.revokeObjectURL(asset.url)
}

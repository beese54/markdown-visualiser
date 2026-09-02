import type { DocumentSet, RenderResult } from '@/types/domain'
import { drawDiagramsIn, whenDiagramsSettled } from '@/reader/Mermaid'

/**
 * Build one self-contained HTML file from a document set.
 *
 * Everything is inlined - stylesheets, fonts, images - so the result opens
 * correctly with the network disabled. That matters twice over: it is the
 * portable artefact a reader keeps, and it is the exact string posted to the
 * print service, whose browser is forbidden from making any request at all.
 */

/** Fetch a same-origin asset and return it as a data URI. */
async function toDataUri(url: string): Promise<string | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/**
 * Collect every stylesheet the page is using, with url() references inlined.
 *
 * Read from `document.styleSheets` rather than by re-fetching the bundle: that
 * way the export carries exactly the CSS that produced what the reader saw,
 * including the print rules, without needing to know the build's filenames.
 */
async function collectCss(): Promise<string> {
  const parts: string[] = []

  for (const sheet of Array.from(document.styleSheets)) {
    let text = ''
    try {
      text = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n')
    } catch {
      // A cross-origin sheet cannot be read. There should be none - the app
      // makes no third-party requests - so this is a safety net, not a path.
      continue
    }

    // Resolve relative url() references against the sheet, then inline them.
    const base = sheet.href ?? document.baseURI
    const urls = new Set(
      [...text.matchAll(/url\((['"]?)([^'")]+)\1\)/g)]
        .map((m) => m[2])
        .filter((u): u is string => u !== undefined && !u.startsWith('data:')),
    )

    for (const url of urls) {
      const absolute = new URL(url, base).href
      const dataUri = await toDataUri(absolute)
      if (dataUri !== null) text = text.split(url).join(dataUri)
    }

    parts.push(text)
  }

  return parts.join('\n')
}

/** Inline every image in a cloned subtree. */
async function inlineImages(root: HTMLElement): Promise<void> {
  const images = [...root.querySelectorAll('img')]
  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute('src')
      if (src === null || src.startsWith('data:')) return
      const dataUri = await toDataUri(src)
      if (dataUri !== null) img.setAttribute('src', dataUri)
      else img.removeAttribute('src')
      // Lazy loading is meaningless in a static file and blocks printing.
      img.removeAttribute('loading')
      img.removeAttribute('decoding')
    }),
  )
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export interface StandaloneOptions {
  readonly set: DocumentSet
  /** Rendered results, in reading order. */
  readonly results: readonly RenderResult[]
}

/**
 * Serialise the whole set into one HTML document.
 *
 * The documents are rendered off-screen rather than read from the reader's
 * DOM, because the reader shows one document at a time and an export should
 * contain all of them.
 */
export async function buildStandalone({ set, results }: StandaloneOptions): Promise<string> {
  const byId = new Map(results.map((r) => [r.docId, r]))

  // A detached host, so building the export never disturbs what is on screen.
  const host = document.createElement('div')
  host.className = 'export-root'

  for (const doc of set.docs) {
    const result = byId.get(doc.id)
    if (!result || doc.error !== null) continue

    const article = document.createElement('article')
    article.className = 'doc'

    const header = document.createElement('header')
    header.className = 'doc-head'
    const title = document.createElement('h1')
    title.className = 'doc-title'
    title.id = `doc-${doc.id}`
    title.textContent = doc.title
    header.append(title)

    const body = document.createElement('div')
    body.className = 'prose'
    // Pipeline output, already past the trust boundary.
    body.innerHTML = result.html

    article.append(header, body)
    host.append(article)
  }

  // Diagrams must be static SVG before serialising: the print context runs
  // with JavaScript disabled, so a placeholder left here never becomes a
  // diagram. Anything already drawn on screen is copied; the rest - every
  // document the reader never opened - is drawn here.
  await whenDiagramsSettled()
  copyRenderedDiagrams(host)

  // mermaid measures text, so the host must be laid out. Attached off-screen
  // rather than detached, then removed once the SVG is in hand.
  host.style.position = 'fixed'
  host.style.left = '-10000px'
  host.style.top = '0'
  host.style.width = '820px'
  document.body.append(host)
  try {
    await drawDiagramsIn(host, allMermaidBlocks(results))
  } finally {
    host.remove()
    host.removeAttribute('style')
  }

  await inlineImages(host)
  const css = await collectCss()

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(set.rootName)}</title>`,
    `<style>\n${css}\n</style>`,
    '</head>',
    '<body>',
    host.outerHTML,
    '</body>',
    '</html>',
  ].join('\n')
}

/** Every diagram in the set, across all documents. */
function allMermaidBlocks(results: readonly RenderResult[]) {
  return results.flatMap((r) => [...r.mermaidBlocks])
}

/**
 * Copy each diagram's drawn SVG from the live document into the export.
 *
 * Re-rendering them here is not an option: mermaid needs a laid-out DOM to
 * measure text, and the export host is detached.
 */
function copyRenderedDiagrams(host: HTMLElement): void {
  for (const figure of host.querySelectorAll<HTMLElement>('[data-mermaid]')) {
    const id = figure.getAttribute('data-mermaid')
    if (id === null) continue

    const drawn = document.querySelector(`[data-mermaid="${CSS.escape(id)}"] .mermaid-slot svg`)
    const slot = figure.querySelector<HTMLElement>('.mermaid-slot')
    if (!drawn || !slot) continue

    slot.replaceChildren(drawn.cloneNode(true))
    slot.classList.add('is-drawn')
  }
}

/** Hand the finished file to the browser as a download. */
export function downloadStandalone(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const safeFilename = (name: string, extension: string): string => {
  const base = name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
  return `${base === '' ? 'documents' : base}.${extension}`
}

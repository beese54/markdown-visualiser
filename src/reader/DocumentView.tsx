import { useEffect, useMemo, useRef } from 'react'

import type { MarkdownDoc, RenderResult } from '@/types/domain'
import { useMermaid } from './Mermaid'
import { Prose } from './Prose'
import { RepairNotice } from './RepairNotice'

/**
 * One typeset document on the paper sheet.
 *
 * The rendered HTML is injected as a string rather than converted to React
 * elements. That is deliberate: the pipeline already sanitised it (see
 * pipeline/sanitize.ts), a full hast-to-React conversion would double the
 * work on every document, and the export path needs the DOM to match the
 * string it will serialise. Mermaid placeholders inside it are drawn
 * imperatively by useMermaid, for the reasons set out in Mermaid.tsx.
 */

interface DocumentViewProps {
  readonly doc: MarkdownDoc
  readonly result: RenderResult
  readonly index: number
  readonly total: number
  readonly onNavigate: (docId: string, hash: string | null) => void
  readonly onImageOpen: (src: string, alt: string) => void
}

export function DocumentView({
  doc,
  result,
  index,
  total,
  onNavigate,
  onImageOpen,
}: DocumentViewProps) {
  const root = useRef<HTMLDivElement>(null)

  useMermaid(root, result.mermaidBlocks, result.html)

  /**
   * Replace an image that fails to decode with the same styled placeholder a
   * missing path gets.
   *
   * The pipeline can only check that a path *resolves*; a file that resolves
   * but is truncated, or is not really an image, still fails at decode time
   * and the browser draws its own broken-image icon. Listening in the capture
   * phase is required because `error` does not bubble.
   */
  useEffect(() => {
    const node = root.current
    if (!node) return

    const onError = (event: Event) => {
      const img = event.target
      if (!(img instanceof HTMLImageElement)) return

      const figure = img.closest('figure')
      const replacement = document.createElement('div')
      replacement.className = 'asset-missing'
      const label = document.createElement('span')
      label.textContent = 'Image could not be displayed'
      const path = document.createElement('code')
      path.textContent = img.getAttribute('alt') || 'unnamed image'
      replacement.append(label, path)
      ;(figure ?? img).replaceWith(replacement)
    }

    node.addEventListener('error', onError, true)
    return () => node.removeEventListener('error', onError, true)
  }, [result.html])

  // Intercept in-document clicks: cross-document links become navigation,
  // and images open in the lightbox.
  useEffect(() => {
    const node = root.current
    if (!node) return

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return

      const link = target.closest('a[data-doc]')
      if (link) {
        event.preventDefault()
        onNavigate(
          link.getAttribute('data-doc') ?? '',
          link.getAttribute('data-hash'),
        )
        return
      }

      const img = target.closest('figure img')
      if (img instanceof HTMLImageElement) {
        event.preventDefault()
        onImageOpen(img.src, img.alt)
      }
    }

    node.addEventListener('click', onClick)
    return () => node.removeEventListener('click', onClick)
  }, [onNavigate, onImageOpen])

  const frontmatterEntries = useMemo(
    () =>
      Object.entries(doc.frontmatter)
        .filter(([key]) => !['title', 'order'].includes(key))
        .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
        .slice(0, 6),
    [doc.frontmatter],
  )

  return (
    <article className="doc" aria-labelledby={`doc-title-${doc.id}`}>
      <header className="doc-head">
        <p className="doc-eyebrow">
          <span>{doc.path}</span>
          <span aria-hidden="true">·</span>
          <span>
            {result.readingMinutes} min · {result.wordCount.toLocaleString()} words
          </span>
        </p>
        <h1 className="doc-title" id={`doc-title-${doc.id}`}>
          {doc.title}
        </h1>

        {frontmatterEntries.length > 0 && (
          <dl className="doc-frontmatter">
            {frontmatterEntries.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </header>

      {result.repairs.length > 0 && <RepairNotice repairs={result.repairs} />}

      {doc.error !== null ? (
        <p className="doc-failed" role="alert">
          This file could not be read: {doc.error}
        </p>
      ) : (
        <Prose html={result.html} rootRef={root} />
      )}

      <footer className="doc-folio" aria-hidden="true">
        <span>{doc.title}</span>
        <span className="doc-folio-rule" />
        <span>
          {index + 1} / {total}
        </span>
      </footer>
    </article>
  )
}

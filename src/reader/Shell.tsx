import { useCallback, useEffect, useRef, useState } from 'react'

import { useReader } from '@/state/store'
import { useRenderedDoc } from '@/state/render'
import { DocumentView } from './DocumentView'
import { ExportBar } from './ExportBar'
import { IndexSidebar } from './IndexSidebar'
import { Lightbox } from './Lightbox'
import { ProgressRail } from './ProgressRail'
import './Shell.css'

/**
 * The reader.
 *
 * Two-zone composition: a dark frame carrying the index, wrapping the
 * parchment sheet that holds one document at a time. One document per view
 * rather than an endless scroll of the whole set - a reading edition has
 * pages, and it keeps the folio marker and the progress rail meaningful.
 */

export function Shell() {
  const set = useReader((s) => s.set)
  const activeDocId = useReader((s) => s.activeDocId)
  const openDoc = useReader((s) => s.openDoc)
  const reset = useReader((s) => s.reset)

  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const [navOpen, setNavOpen] = useState(false)
  const stage = useRef<HTMLDivElement>(null)

  const docs = set?.docs ?? []
  const index = Math.max(0, docs.findIndex((d) => d.id === activeDocId))
  const activeDoc = docs[index]
  const state = useRenderedDoc(set, activeDoc)

  /** Open a document, optionally scrolling to a heading within it. */
  const navigate = useCallback(
    (docId: string, hash: string | null) => {
      openDoc(docId)
      setNavOpen(false)
      // The target document has to render before its heading exists.
      requestAnimationFrame(() => {
        if (hash === null) {
          stage.current?.scrollTo({ top: 0, behavior: 'instant' })
          return
        }
        document.getElementById(hash)?.scrollIntoView({ block: 'start' })
      })
    },
    [openDoc],
  )

  const step = useCallback(
    (delta: number) => {
      const next = docs[index + delta]
      if (next) navigate(next.id, null)
    },
    [docs, index, navigate],
  )

  // Keyboard navigation. Arrows move between documents; the reader should
  // never need the mouse to get through a set.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      // Never hijack keys inside a control.
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return

      switch (event.key) {
        case 'ArrowRight':
        case 'j':
          event.preventDefault()
          step(1)
          break
        case 'ArrowLeft':
        case 'k':
          event.preventDefault()
          step(-1)
          break
        case 'Home':
          if (docs[0]) {
            event.preventDefault()
            navigate(docs[0].id, null)
          }
          break
        case 'End': {
          const last = docs[docs.length - 1]
          if (last) {
            event.preventDefault()
            navigate(last.id, null)
          }
          break
        }
        case 'Escape':
          setNavOpen(false)
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [step, navigate, docs])

  // Scroll to the top of the sheet whenever the document changes, or the
  // reader lands mid-way down a document they have not read yet.
  useEffect(() => {
    stage.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [activeDocId])

  if (!set || !activeDoc) return null

  const headings = state.kind === 'ready' ? state.result.headings : []

  return (
    <div className={`shell reader${navOpen ? ' nav-open' : ''}`}>
      <a href="#reader-main" className="skip-link">
        Skip to the document
      </a>

      <header className="reader-bar">
        <button
          type="button"
          className="reader-nav-toggle"
          aria-expanded={navOpen}
          aria-controls="reader-index"
          onClick={() => setNavOpen((v) => !v)}
        >
          <span aria-hidden="true">☰</span> Contents
        </button>

        <span className="reader-mark">{set.rootName}</span>
        <span className="reader-rule" aria-hidden="true" />

        <span className="reader-position">
          {index + 1} / {docs.length}
        </span>

        <div className="reader-steps">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={index === 0}
            aria-label="Previous document"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={index === docs.length - 1}
            aria-label="Next document"
          >
            →
          </button>
        </div>

        <ExportBar set={set} />

        <button type="button" className="reader-close" onClick={reset}>
          Close
        </button>
      </header>

      <div className="reader-body">
        <aside className="reader-index" id="reader-index">
          <IndexSidebar
            set={set}
            activeDoc={activeDoc}
            headings={headings}
            onOpenDoc={(id) => navigate(id, null)}
          />
        </aside>

        {/* Dismisses the index when it is an overlay on narrow screens. */}
        <button
          type="button"
          className="reader-scrim"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setNavOpen(false)}
        />

        <main className="reader-stage" id="reader-main" ref={stage} tabIndex={-1}>
          <ProgressRail scrollHost={stage} />

          <div className="sheet reader-sheet">
            {state.kind === 'pending' && (
              <p className="reader-status" role="status">
                Typesetting {activeDoc.title}…
              </p>
            )}

            {state.kind === 'failed' && (
              <p className="reader-status is-error" role="alert">
                {state.message}
              </p>
            )}

            {state.kind === 'ready' && (
              <DocumentView
                doc={activeDoc}
                result={state.result}
                index={index}
                total={docs.length}
                onNavigate={navigate}
                onImageOpen={(src, alt) => setLightbox({ src, alt })}
              />
            )}
          </div>
        </main>
      </div>

      {lightbox && (
        <Lightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />
      )}
    </div>
  )
}

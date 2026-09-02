import { Dropzone } from '@/ingest/Dropzone'
import { useReader } from '@/state/store'

import './App.css'

/**
 * Two states: the empty drop plate, or the reader.
 *
 * The reader itself arrives at L3.1; L1 shows the ingested set as a plain
 * manifest so the ingest layer can be verified end-to-end on its own.
 */
export function App() {
  const set = useReader((s) => s.set)
  const activeDocId = useReader((s) => s.activeDocId)
  const openDoc = useReader((s) => s.openDoc)
  const reset = useReader((s) => s.reset)

  if (!set) {
    return (
      <div className="shell">
        <Dropzone />
      </div>
    )
  }

  const active = set.docs.find((d) => d.id === activeDocId) ?? set.docs[0]

  return (
    <div className="shell app-shell">
      <header className="app-masthead">
        <span className="app-mark">{set.rootName}</span>
        <span className="app-rule" aria-hidden="true" />
        <span className="app-meta">
          {set.docs.length} {set.docs.length === 1 ? 'document' : 'documents'}
          {set.assets.size > 0 && ` · ${set.assets.size} images`}
          {set.skipped.length > 0 && ` · ${set.skipped.length} skipped`}
        </span>
        <button type="button" className="app-reset" onClick={reset}>
          Close
        </button>
      </header>

      <main className="app-stage">
        <div className="sheet app-sheet">
          <div className="prose">
            <h1>{set.rootName}</h1>

            <p className="opening">
              Ingest complete. {set.docs.length} documents in reading order. The
              typeset reader arrives with the rendering pipeline.
            </p>

            <h2>Contents</h2>
            <ol>
              {set.docs.map((doc) => (
                <li key={doc.id}>
                  <a
                    href={`#${doc.id}`}
                    onClick={(e) => {
                      e.preventDefault()
                      openDoc(doc.id)
                    }}
                    aria-current={doc.id === active?.id ? 'true' : undefined}
                  >
                    {doc.title}
                  </a>
                  <code style={{ marginInlineStart: '0.5rem' }}>{doc.path}</code>
                  {doc.error && <strong> — {doc.error}</strong>}
                </li>
              ))}
            </ol>

            {set.skipped.length > 0 && (
              <>
                <h2>Skipped</h2>
                <ul>
                  {set.skipped.map((s) => (
                    <li key={s.path}>
                      <code>{s.path}</code> — {s.reason}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="app-folio" aria-hidden="true">
            <span>{set.rootName}</span>
          </div>
        </div>
      </main>
    </div>
  )
}

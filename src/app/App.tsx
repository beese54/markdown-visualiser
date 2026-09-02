import './App.css'

/**
 * L0 placeholder shell. Establishes the two-zone composition (dark frame,
 * parchment sheet) that L1-L3 build the real reader inside. Replaced by the
 * Dropzone and reader at L1.6 / L3.1.
 */
export function App() {
  return (
    <div className="shell app-shell">
      <header className="app-masthead">
        <span className="app-mark">Markdown Visualiser</span>
        <span className="app-rule" aria-hidden="true" />
        <span className="app-meta">Archival Reading Edition</span>
      </header>

      <main className="app-stage">
        <div className="sheet app-sheet">
          <div className="prose">
            <h1>An archival reader for markdown.</h1>
            <p className="opening">
              Drop a folder of markdown files onto this page and they are typeset
              into a single, coherent reading edition: ordered, cross-linked, and
              set in a measure built for reading rather than for scanning.
            </p>
            <p>
              Nothing is uploaded. Parsing, repair and typesetting all happen in
              this browser.
            </p>
          </div>
          <div className="app-folio" aria-hidden="true">
            <span>fol. i</span>
          </div>
        </div>
      </main>
    </div>
  )
}

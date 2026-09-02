import { useCallback, useState } from 'react'

import type { DocumentSet, RenderResult } from '@/types/domain'
import { render as renderDoc } from '@/state/render'
import { buildStandalone, downloadStandalone, safeFilename } from '@/export/standalone'
import { downloadBlob, requestPdf } from '@/export/pdf'

/**
 * Export controls.
 *
 * Both formats come from the same source: every document is rendered, the set
 * is serialised into one self-contained HTML file, and that exact string is
 * either handed to the user or posted to the print service. Producing the PDF
 * from anything else would let the two drift apart.
 */

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'working'; readonly what: string }
  | { readonly kind: 'error'; readonly message: string }

export function ExportBar({ set }: { readonly set: DocumentSet }) {
  const [state, setState] = useState<State>({ kind: 'idle' })

  /** Render every document, so the export contains the whole set. */
  const renderAll = useCallback(async (): Promise<RenderResult[]> => {
    const results: RenderResult[] = []
    for (const doc of set.docs) {
      if (doc.error !== null) continue
      results.push(await renderDoc(set, doc))
    }
    return results
  }, [set])

  const exportHtml = useCallback(async () => {
    setState({ kind: 'working', what: 'Building a self-contained file' })
    try {
      const results = await renderAll()
      const html = await buildStandalone({ set, results })
      downloadStandalone(html, safeFilename(set.rootName, 'html'))
      setState({ kind: 'idle' })
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'The export failed.',
      })
    }
  }, [set, renderAll])

  const exportPdf = useCallback(async () => {
    setState({ kind: 'working', what: 'Typesetting for print' })
    try {
      const results = await renderAll()
      const html = await buildStandalone({ set, results })
      const blob = await requestPdf({ html, title: set.rootName })
      downloadBlob(blob, safeFilename(set.rootName, 'pdf'))
      setState({ kind: 'idle' })
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'The export failed.',
      })
    }
  }, [set, renderAll])

  const busy = state.kind === 'working'

  return (
    <div className="export-bar">
      <button type="button" onClick={() => void exportPdf()} disabled={busy}>
        PDF
      </button>
      <button type="button" onClick={() => void exportHtml()} disabled={busy}>
        HTML
      </button>

      <span className="export-status" role="status" aria-live="polite">
        {busy && `${state.what}…`}
      </span>

      {state.kind === 'error' && (
        <span className="export-error" role="alert">
          {state.message}
        </span>
      )}
    </div>
  )
}

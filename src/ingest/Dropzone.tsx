import { useCallback, useEffect, useRef, useState } from 'react'

import { useReader } from '@/state/store'
import './Dropzone.css'

/**
 * Full-window drop target.
 *
 * The whole viewport accepts the drop rather than a small dashed rectangle:
 * the app does exactly one thing, so aiming should not be part of it. The
 * visible plate is an invitation, not the only valid target.
 */
export function Dropzone() {
  const phase = useReader((s) => s.phase)
  const ingestDataTransfer = useReader((s) => s.ingestDataTransfer)
  const ingestFileList = useReader((s) => s.ingestFileList)

  const [dragging, setDragging] = useState(false)
  // Drag events fire for every child element, so a plain boolean flickers.
  const depth = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      depth.current += 1
      setDragging(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = () => {
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer) return
      e.preventDefault()
      depth.current = 0
      setDragging(false)
      void ingestDataTransfer(e.dataTransfer)
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [ingestDataTransfer])

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) void ingestFileList(e.target.files)
      e.target.value = ''
    },
    [ingestFileList],
  )

  const busy = phase.kind === 'reading' || phase.kind === 'building'

  return (
    <div className={`dz${dragging ? ' is-dragging' : ''}`}>
      <div className="dz-plate sheet">
        <p className="dz-eyebrow">Markdown Visualiser</p>
        <h1 className="dz-title">Drop a folder of markdown.</h1>
        <p className="dz-lede">
          It is ordered, cross-linked and typeset into a single reading edition.
          Nothing is uploaded — every file stays in this browser.
        </p>

        <div className="dz-actions">
          <button
            type="button"
            className="dz-button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? 'Reading…' : 'Choose a folder'}
          </button>
          <span className="dz-hint">or drop it anywhere on this page</span>
        </div>

        <input
          ref={inputRef}
          type="file"
          className="visually-hidden"
          multiple
          accept=".md,.markdown,.mdown,.mkd,image/*"
          // Non-standard attributes; the only way to offer a folder picker.
          {...{ webkitdirectory: '', directory: '' }}
          onChange={onPick}
          tabIndex={-1}
          aria-hidden="true"
        />

        <p className="dz-status" role="status" aria-live="polite">
          {phase.kind === 'reading' && `Reading ${phase.count} files…`}
          {phase.kind === 'building' && 'Building the index…'}
        </p>

        {phase.kind === 'error' && (
          <p className="dz-error" role="alert">
            {phase.message}
          </p>
        )}

        <dl className="dz-supports">
          <div><dt>Structure</dt><dd>Nested folders, frontmatter order, cross-links</dd></div>
          <div><dt>Content</dt><dd>GFM, callouts, math, diagrams, code</dd></div>
          <div><dt>Repair</dt><dd>Heading levels and list nesting, reported not silent</dd></div>
          <div><dt>Export</dt><dd>Print-quality PDF, or one portable HTML file</dd></div>
        </dl>
      </div>

      <div className="dz-veil" aria-hidden="true">
        <span>Release to open</span>
      </div>
    </div>
  )
}

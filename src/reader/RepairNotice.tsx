import { useId, useState } from 'react'

import type { RepairNote, RepairRule } from '@/types/domain'

/**
 * The record of what repair changed.
 *
 * This component is the reason the repair pass is acceptable at all. Silently
 * rewriting someone's headings would make the reader untrustworthy for
 * anything that matters; showing exactly what moved, and why, makes it a
 * service instead. Collapsed by default so it never competes with the prose.
 */

const RULE_LABELS: Record<RepairRule, string> = {
  'heading-skip': 'Heading levels',
  'duplicate-h1': 'Duplicate titles',
  'list-nesting': 'List nesting',
  'mixed-markers': 'List spacing',
  'unbalanced-emphasis': 'Unclosed emphasis',
}

export function RepairNotice({ repairs }: { readonly repairs: readonly RepairNote[] }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  const byRule = new Map<RepairRule, RepairNote[]>()
  for (const note of repairs) {
    const list = byRule.get(note.rule) ?? []
    list.push(note)
    byRule.set(note.rule, list)
  }

  return (
    <aside className="repairs">
      <button
        type="button"
        className="repairs-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="repairs-count">{repairs.length}</span>
        <span>
          {repairs.length === 1 ? 'formatting fix applied' : 'formatting fixes applied'}
        </span>
        <span className="repairs-chevron" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>

      <div id={panelId} className="repairs-panel" hidden={!open}>
        <p className="repairs-lede">
          The source file was not changed. These adjustments were made only for
          this rendering.
        </p>

        {[...byRule].map(([rule, notes]) => (
          <section key={rule} className="repairs-group">
            <h2 className="repairs-group-title">
              {RULE_LABELS[rule]}
              <span className="repairs-group-count">{notes.length}</span>
            </h2>
            <ul className="repairs-list">
              {notes.slice(0, 8).map((note, i) => (
                <li key={`${rule}-${i}`}>
                  <span className="repairs-line">
                    {note.line === null ? '—' : `line ${note.line}`}
                  </span>
                  <span className="repairs-change">
                    <code>{note.before}</code>
                    <span aria-hidden="true"> → </span>
                    <code>{note.after}</code>
                  </span>
                  <span className="repairs-detail">{note.detail}</span>
                </li>
              ))}
              {notes.length > 8 && (
                <li className="repairs-more">and {notes.length - 8} more</li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'

import type { DocumentSet, Heading, MarkdownDoc } from '@/types/domain'

/**
 * The index.
 *
 * `book-serif-index` calls for index-like navigation with active states and
 * markers, which here means two levels at once: the documents in the set, and
 * the heading tree of whichever one is open. Both are visible together so the
 * reader always knows where they are in the whole rather than just in the page.
 */

interface IndexSidebarProps {
  readonly set: DocumentSet
  readonly activeDoc: MarkdownDoc
  readonly headings: readonly Heading[]
  readonly onOpenDoc: (docId: string) => void
}

export function IndexSidebar({ set, activeDoc, headings, onOpenDoc }: IndexSidebarProps) {
  const activeHeading = useActiveHeading(headings)

  // Group documents by directory so nested sections read as sections.
  const groups = useMemo(() => {
    const out: { dir: string; docs: MarkdownDoc[] }[] = []
    for (const doc of set.docs) {
      const last = out[out.length - 1]
      if (last && last.dir === doc.dir) last.docs.push(doc)
      else out.push({ dir: doc.dir, docs: [doc] })
    }
    return out
  }, [set.docs])

  return (
    <nav className="index" aria-label="Contents">
      <div className="index-head">
        <p className="index-eyebrow">Contents</p>
        <p className="index-root">{set.rootName}</p>
      </div>

      <ol className="index-docs">
        {groups.map((group) => (
          <li key={group.dir || '.'} className="index-group">
            {group.dir !== '' && <p className="index-dir">{group.dir}</p>}
            <ol className="index-group-docs">
              {group.docs.map((doc) => {
                const isActive = doc.id === activeDoc.id
                return (
                  <li key={doc.id}>
                    <a
                      href={`#${doc.id}`}
                      className={`index-doc${isActive ? ' is-active' : ''}${
                        doc.error ? ' is-failed' : ''
                      }`}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={(e) => {
                        e.preventDefault()
                        onOpenDoc(doc.id)
                      }}
                    >
                      <span className="index-marker" aria-hidden="true">
                        {isActive ? '●' : '○'}
                      </span>
                      <span className="index-doc-title">{doc.title}</span>
                    </a>

                    {/* The open document expands into its own heading tree. */}
                    {isActive && headings.length > 0 && (
                      <HeadingTree
                        headings={headings}
                        activeId={activeHeading}
                        depth={0}
                      />
                    )}
                  </li>
                )
              })}
            </ol>
          </li>
        ))}
      </ol>

      {set.skipped.length > 0 && (
        <details className="index-skipped">
          <summary>{set.skipped.length} files skipped</summary>
          <ul>
            {set.skipped.slice(0, 20).map((s) => (
              <li key={s.path}>
                <code>{s.path}</code>
                <span>{s.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </nav>
  )
}

function HeadingTree({
  headings,
  activeId,
  depth,
}: {
  readonly headings: readonly Heading[]
  readonly activeId: string | null
  readonly depth: number
}) {
  // Beyond three levels the sidebar becomes a wall of text rather than a map.
  if (depth > 2) return null

  return (
    <ul className="index-headings" data-depth={depth}>
      {headings.map((heading) => (
        <li key={heading.id}>
          <a
            href={`#${heading.id}`}
            className={`index-heading${heading.id === activeId ? ' is-active' : ''}`}
            aria-current={heading.id === activeId ? 'true' : undefined}
          >
            {heading.text}
          </a>
          {heading.children.length > 0 && (
            <HeadingTree
              headings={heading.children}
              activeId={activeId}
              depth={depth + 1}
            />
          )}
        </li>
      ))}
    </ul>
  )
}

/** Flatten the tree so the observer can watch every heading at once. */
function flatten(headings: readonly Heading[]): Heading[] {
  return headings.flatMap((h) => [h, ...flatten(h.children)])
}

/**
 * Track which heading the reader is currently under.
 *
 * IntersectionObserver rather than a scroll listener: it reports only when
 * something crosses the threshold, so it does no work while the reader is
 * simply reading. The top margin biases the trigger line to roughly a
 * quarter down the viewport, which is where a reader's eye actually sits -
 * using the very top makes the active entry change a beat too late.
 */
function useActiveHeading(headings: readonly Heading[]): string | null {
  const [active, setActive] = useState<string | null>(null)
  const visible = useRef(new Set<string>())

  useEffect(() => {
    const flat = flatten(headings)
    if (flat.length === 0) {
      setActive(null)
      return
    }

    visible.current.clear()
    const order = new Map(flat.map((h, i) => [h.id, i]))

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id
          if (entry.isIntersecting) visible.current.add(id)
          else visible.current.delete(id)
        }

        // The topmost visible heading in document order is the current one.
        let best: string | null = null
        let bestIndex = Number.POSITIVE_INFINITY
        for (const id of visible.current) {
          const index = order.get(id) ?? Number.POSITIVE_INFINITY
          if (index < bestIndex) {
            bestIndex = index
            best = id
          }
        }

        // Nothing intersecting means the reader is mid-section, between two
        // headings: keep the last one rather than clearing the highlight.
        if (best !== null) setActive(best)
      },
      { rootMargin: '-25% 0px -65% 0px', threshold: 0 },
    )

    const targets = flat
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null)

    for (const el of targets) observer.observe(el)
    setActive(flat[0]?.id ?? null)

    return () => observer.disconnect()
  }, [headings])

  return active
}

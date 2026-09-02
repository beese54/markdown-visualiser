import { useEffect, useState } from 'react'

import type { DocumentSet, MarkdownDoc, RenderResult } from '@/types/domain'
import { makeLinkResolver } from '@/ingest/links'
import { renderDocument } from '@/pipeline/render'

/**
 * Render results, cached per document.
 *
 * Rendering is not cheap - KaTeX and Shiki both do real work - and a reader
 * moves back and forth between documents constantly. Results are immutable
 * for the lifetime of a set, so a plain map keyed by document id is the whole
 * cache: no invalidation logic, because nothing can change underneath it.
 */

const cache = new WeakMap<DocumentSet, Map<string, RenderResult>>()
const inflight = new WeakMap<DocumentSet, Map<string, Promise<RenderResult>>>()

function mapFor<T>(store: WeakMap<DocumentSet, Map<string, T>>, set: DocumentSet) {
  let map = store.get(set)
  if (!map) {
    map = new Map<string, T>()
    store.set(set, map)
  }
  return map
}

export function getCached(set: DocumentSet, docId: string): RenderResult | undefined {
  return cache.get(set)?.get(docId)
}

/**
 * Render one document, de-duplicating concurrent requests.
 *
 * Without the in-flight map, mounting the reader and prefetching the next
 * document can both start the same render, and the expensive work happens
 * twice for one result.
 */
export function render(set: DocumentSet, doc: MarkdownDoc): Promise<RenderResult> {
  const done = mapFor(cache, set)
  const existing = done.get(doc.id)
  if (existing) return Promise.resolve(existing)

  const pending = mapFor(inflight, set)
  const running = pending.get(doc.id)
  if (running) return running

  const resolveLink = makeLinkResolver(set)
  const promise = renderDocument(doc, { assets: set.assets, resolveLink })
    .then((result) => {
      done.set(doc.id, result)
      pending.delete(doc.id)
      return result
    })
    .catch((err: unknown) => {
      pending.delete(doc.id)
      throw err
    })

  pending.set(doc.id, promise)
  return promise
}

export type RenderState =
  | { readonly kind: 'pending' }
  | { readonly kind: 'ready'; readonly result: RenderResult }
  | { readonly kind: 'failed'; readonly message: string }

/**
 * Render the given document, and quietly warm the next one.
 *
 * Prefetching the next document is what makes moving through a set feel
 * instant rather than showing a spinner on every click.
 */
export function useRenderedDoc(
  set: DocumentSet | null,
  doc: MarkdownDoc | undefined,
): RenderState {
  // The state carries the id it belongs to. Without that, navigating paints
  // the new document's title beside the *previous* document's body for one
  // frame - React re-renders as soon as the id prop changes, but state only
  // catches up in the effect below. Deriving the mismatch during render
  // closes the gap instead of letting the reader see a mismatched page.
  const [state, setState] = useState<{ docId: string; state: RenderState }>(() => ({
    docId: doc?.id ?? '',
    state: set && doc ? cachedOrPending(set, doc) : { kind: 'pending' },
  }))

  useEffect(() => {
    if (!set || !doc) return

    const cached = getCached(set, doc.id)
    if (cached) {
      setState({ docId: doc.id, state: { kind: 'ready', result: cached } })
      return
    }

    let live = true
    setState({ docId: doc.id, state: { kind: 'pending' } })

    render(set, doc)
      .then((result) => {
        if (live) setState({ docId: doc.id, state: { kind: 'ready', result } })
      })
      .catch((err: unknown) => {
        if (live) {
          setState({
            docId: doc.id,
            state: {
              kind: 'failed',
              message: err instanceof Error ? err.message : 'Could not typeset this document.',
            },
          })
        }
      })

    return () => {
      live = false
    }
  }, [set, doc])

  // Warm the neighbours once the current document is on screen.
  useEffect(() => {
    if (!set || !doc || state.state.kind !== 'ready') return

    const index = set.docs.findIndex((d) => d.id === doc.id)
    const neighbours = [set.docs[index + 1], set.docs[index - 1]].filter(
      (d): d is MarkdownDoc => d !== undefined && d.error === null,
    )

    const idle = requestIdleCallbackShim(() => {
      for (const next of neighbours) void render(set, next).catch(() => undefined)
    })
    return () => cancelIdleCallbackShim(idle)
  }, [set, doc, state.state.kind])

  // A result belonging to a different document is not this document's result.
  // Fall back to the cache for the current id, and to 'pending' otherwise, so
  // the reader never sees one document's body under another's title.
  if (doc && state.docId !== doc.id) {
    const cached = set ? getCached(set, doc.id) : undefined
    return cached ? { kind: 'ready', result: cached } : { kind: 'pending' }
  }

  return state.state
}

function cachedOrPending(set: DocumentSet, doc: MarkdownDoc): RenderState {
  const cached = getCached(set, doc.id)
  return cached ? { kind: 'ready', result: cached } : { kind: 'pending' }
}

/** Safari still lacks requestIdleCallback. */
type IdleHandle = { readonly kind: 'idle'; readonly id: number } | { readonly kind: 'timeout'; readonly id: number }

function requestIdleCallbackShim(fn: () => void): IdleHandle {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  }
  if (typeof w.requestIdleCallback === 'function') {
    return { kind: 'idle', id: w.requestIdleCallback(fn, { timeout: 2000 }) }
  }
  return { kind: 'timeout', id: window.setTimeout(fn, 300) }
}

function cancelIdleCallbackShim(handle: IdleHandle): void {
  const w = window as Window & { cancelIdleCallback?: (id: number) => void }
  if (handle.kind === 'idle' && typeof w.cancelIdleCallback === 'function') {
    w.cancelIdleCallback(handle.id)
  } else if (handle.kind === 'timeout') {
    window.clearTimeout(handle.id)
  }
}

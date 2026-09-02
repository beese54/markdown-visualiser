import { useEffect, type RefObject } from 'react'
import type mermaidModule from 'mermaid'

import type { MermaidBlock } from '@/types/domain'

/**
 * Mermaid diagram rendering.
 *
 * Two decisions worth stating, because the obvious approaches both fail:
 *
 * 1. `mermaid.render()`, never `mermaid.run()`. `run()` scans the DOM and
 *    mutates whatever it finds in place, racing React for the same nodes -
 *    the familiar symptom being diagrams that flicker, duplicate or vanish.
 *    `render()` returns an SVG string and leaves placement to the caller.
 *
 * 2. The SVG is placed imperatively, not through a React portal. The
 *    placeholders live inside the `dangerouslySetInnerHTML` subtree of the
 *    prose, and portalling into a node in that subtree does not survive the
 *    re-render that mounting the portal itself triggers - the container gets
 *    replaced and the diagram is left in a detached node. React already
 *    treats that subtree as opaque, so writing into it directly is both
 *    simpler and consistent with how the rest of the prose is handled.
 *
 * The library is ~3MB, and most documents contain no diagram at all, so it is
 * imported dynamically and only when a diagram is actually present.
 */

type MermaidApi = typeof mermaidModule

let mermaidReady: Promise<MermaidApi> | null = null

function loadMermaid(): Promise<MermaidApi> {
  // Caching the promise is what makes initialize() run exactly once. Caching a
  // *rejected* one would be permanent, though: the chunk is ~3MB, so a reader
  // who navigates away mid-download aborts the fetch, and every later document
  // would then reuse that failure and silently show diagram source forever.
  // On failure the slot is cleared so the next attempt genuinely retries.
  mermaidReady ??= import('mermaid')
    .catch((err: unknown) => {
      mermaidReady = null
      throw err instanceof Error ? err : new Error(String(err))
    })
    .then(({ default: mermaid }) => {
      mermaid.initialize({
        // We call render() explicitly, so the library must not also scan the
        // document on load and race us for the same elements.
        startOnLoad: false,
        // Diagram source comes from arbitrary dropped files. 'strict' encodes
        // HTML in labels and disables click bindings; 'loose' allows both.
        securityLevel: 'strict',
        theme: 'base',
        fontFamily: "'Newsreader', Georgia, serif",
        themeVariables: {
          // Matched to the paper surface, so a diagram sits on the page rather
          // than looking like something pasted onto it.
          background: '#f5efe1',
          primaryColor: '#eee6d4',
          primaryTextColor: '#2a241d',
          primaryBorderColor: '#6d6154',
          lineColor: '#6d6154',
          secondaryColor: '#e6dcc6',
          tertiaryColor: '#faf6ec',
          mainBkg: '#faf6ec',
          nodeBorder: '#6d6154',
          clusterBkg: '#eee6d4',
          clusterBorder: '#ddd2ba',
          titleColor: '#17120d',
          edgeLabelBackground: '#f5efe1',
          fontSize: '15px',
        },
      })
      return mermaid
    })

  return mermaidReady
}

/**
 * In-flight renders, so the export path can wait for every diagram to become
 * static SVG before serialising the DOM.
 */
const inflight = new Set<Promise<unknown>>()

export function whenDiagramsSettled(): Promise<void> {
  return Promise.allSettled([...inflight]).then(() => undefined)
}

/** The slot for a placeholder id, as it exists in the document right now. */
function currentSlot(host: HTMLElement, id: string): HTMLElement | null {
  return host.querySelector<HTMLElement>(
    `[data-mermaid="${CSS.escape(id)}"] .mermaid-slot`,
  )
}

/** Parse mermaid's SVG string into nodes, so no HTML string is re-injected. */
function svgFragment(svg: string): DocumentFragment {
  return document.createRange().createContextualFragment(svg)
}

/** A render that never settles must not leave the slot blank forever. */
const RENDER_TIMEOUT_MS = 15_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('mermaid render timed out')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err: unknown) => {
        clearTimeout(timer)
        reject(err instanceof Error ? err : new Error(String(err)))
      },
    )
  })
}

/**
 * Draw every not-yet-drawn diagram inside `root`.
 *
 * Exported because the export path needs it too: it builds documents the
 * reader never displayed, and a placeholder that reaches the print service
 * stays a placeholder forever, since that context has JavaScript disabled.
 *
 * `root` must be laid out - mermaid measures text - so a caller working with
 * a detached element has to attach it off-screen first.
 */
export async function drawDiagramsIn(
  root: HTMLElement,
  blocks: readonly MermaidBlock[],
): Promise<void> {
  if (blocks.length === 0) return

  const byId = new Map(blocks.map((b) => [b.id, b.code]))
  const targets = [...root.querySelectorAll<HTMLElement>('[data-mermaid]')].flatMap((figure) => {
    const id = figure.getAttribute('data-mermaid')
    const code = id === null ? undefined : byId.get(id)
    const slot = figure.querySelector<HTMLElement>('.mermaid-slot')
    // A slot already carrying a diagram was drawn by an earlier pass.
    if (!id || !code || !slot || slot.classList.contains('is-drawn')) return []
    return [{ id, code, slot }]
  })
  if (targets.length === 0) return

  let mermaid: MermaidApi
  try {
    mermaid = await withTimeout(loadMermaid(), RENDER_TIMEOUT_MS)
  } catch {
    // Mark the slots so the failure is visible rather than looking like a
    // diagram that simply never arrived. The source stays readable.
    for (const { slot } of targets) slot.classList.add('is-failed')
    return
  }

  for (const { id, code, slot } of targets) {
    // A fresh id per call. Mermaid caches SVG defs by id, so reusing one
    // across changed source yields a stale or broken diagram.
    const renderId = `${id}-${Math.random().toString(36).slice(2, 8)}`
    try {
      const { svg } = await withTimeout(mermaid.render(renderId, code), RENDER_TIMEOUT_MS)
      // Re-query rather than reusing the node captured before the await: a
      // node reference held across an await may no longer be in the document,
      // and writing into a detached one fails silently.
      const current = currentSlot(root, id) ?? slot
      current.replaceChildren(svgFragment(svg))
      current.classList.add('is-drawn')
    } catch {
      const current = currentSlot(root, id) ?? slot
      // Mark it, so a later pass does not retry indefinitely and the reader
      // is left with the source rather than an empty frame.
      current.classList.add('is-failed')
    }
  }
}

/**
 * Draw every diagram inside `root`, as a React effect.
 *
 * Placeholders carry their own source as a fallback, so a diagram that cannot
 * be drawn - invalid syntax, or mermaid failing to load - leaves the reader
 * looking at the source rather than at an empty gap.
 */
export function useMermaid(
  root: RefObject<HTMLElement | null>,
  blocks: readonly MermaidBlock[],
  /**
   * The rendered HTML currently injected into `root`.
   *
   * Required as a dependency, not a convenience: navigating away and back to
   * the same document replaces the DOM with a fresh copy of this string while
   * `blocks` keeps its cached identity. Without it the effect does not re-run,
   * the freshly injected placeholders are never drawn, and the reader sees the
   * diagram source instead of the diagram.
   */
  htmlKey: string,
): void {
  useEffect(() => {
    const host = root.current
    if (!host || blocks.length === 0) return

    // No cancellation flag: the draw re-queries its target before every write
    // and skips slots already marked, so an unmounted effect writes into a
    // node that is no longer in the document and is harmlessly inert.
    const job = drawDiagramsIn(host, blocks)
    inflight.add(job)
    void job.finally(() => inflight.delete(job))
  }, [root, blocks, htmlKey])
}

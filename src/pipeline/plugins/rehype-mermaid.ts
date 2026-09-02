import { visit } from 'unist-util-visit'
import { toString as hastToString } from 'hast-util-to-string'
import type { Element, Root } from 'hast'
import type { Plugin } from 'unified'

import type { MermaidBlock } from '@/types/domain'

/**
 * Mermaid extraction.
 *
 * The pipeline does not render diagrams - it cannot, because Mermaid needs a
 * live DOM to measure text. Instead each ```mermaid fence becomes a
 * placeholder carrying its source, and the React layer renders into it after
 * mount (see reader/Mermaid.tsx).
 *
 * Ids are content-hashed rather than sequential. Mermaid caches SVG defs by
 * id, so a sequential id that gets reused for different source produces a
 * stale or broken diagram - the classic symptom being a diagram that renders
 * correctly once and then wrongly after an edit.
 */

interface MermaidOptions {
  /** Extracted blocks are pushed here; the caller owns the array. */
  readonly sink: MermaidBlock[]
}

/** FNV-1a over the diagram source. Same source, same id, always. */
function hashSource(source: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}

const isMermaidCode = (node: Element): boolean => {
  const classes = node.properties?.['className']
  return (
    Array.isArray(classes) &&
    classes.some((cls) => typeof cls === 'string' && cls === 'language-mermaid')
  )
}

export const rehypeMermaid: Plugin<[MermaidOptions], Root> = ({ sink }) =>
  (tree: Root) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'pre' || index === undefined || !parent) return

      const code = node.children.find(
        (child): child is Element => child.type === 'element' && child.tagName === 'code',
      )
      if (!code || !isMermaidCode(code)) return

      const source = hastToString(code).trim()
      if (source === '') return

      // Two identical diagrams in one document share an id, which is correct:
      // identical source produces identical output and Mermaid's cache is a
      // help rather than a hazard in that case.
      const id = `mmd-${hashSource(source)}`
      if (!sink.some((block) => block.id === id)) sink.push({ id, code: source })

      const placeholder: Element = {
        type: 'element',
        tagName: 'figure',
        properties: {
          className: ['mermaid-figure'],
          id,
          // The source travels with the element so the export path can
          // recover it without consulting the render result.
          'data-mermaid': id,
        },
        children: [
          {
            type: 'element',
            tagName: 'div',
            properties: { className: ['mermaid-slot'] },
            children: [
              // Fallback content: if the diagram never renders - Mermaid failed
              // to load, or the syntax is invalid - the reader still sees the
              // source rather than an empty gap.
              {
                type: 'element',
                tagName: 'pre',
                properties: { className: ['mermaid-source'] },
                children: [{ type: 'text', value: source }],
              },
            ],
          },
        ],
      }

      parent.children[index] = placeholder
    })
  }

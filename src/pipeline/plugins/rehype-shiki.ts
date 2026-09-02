import { visit } from 'unist-util-visit'
import { toString as hastToString } from 'hast-util-to-string'
import type { Element, Root } from 'hast'
import type { Plugin } from 'unified'
import type { HighlighterCore } from 'shiki/core'

import { EAGER_LANGUAGES, LANG_LOADERS, resolveLanguage } from './shiki-langs'

/**
 * Syntax highlighting.
 *
 * Driven by our own highlighter instance rather than `@shikijs/rehype`, whose
 * defaults reach for `getSingletonHighlighter()` from the full `shiki` bundle
 * - every theme and 200+ grammars, around 700KB gzipped. A reader does not
 * need that.
 *
 * Runs downstream of `rehype-sanitize` (see pipeline/sanitize.ts), so the
 * inline `style` attributes and nested spans Shiki emits are never subject to
 * the sanitizer and need no whitelisting.
 */

export const THEMES = { light: 'github-light', dark: 'github-dark' } as const

let highlighterPromise: Promise<HighlighterCore> | null = null

/**
 * Lazily construct the highlighter.
 *
 * Uses the JavaScript regex engine rather than Oniguruma: the WASM binary is
 * 500KB-1MB on its own, and for the mainstream grammars a reader encounters
 * the JS engine is equivalent. It also removes a WASM fetch from startup.
 */
export function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
    ])

    return createHighlighterCore({
      themes: [
        import('shiki/themes/github-light.mjs'),
        import('shiki/themes/github-dark.mjs'),
      ],
      langs: EAGER_LANGUAGES.map((lang) => LANG_LOADERS[lang]!()),
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    })
  })()

  return highlighterPromise
}

/** The fence label on a `<code>` element, lowercased. */
function fenceLabel(node: Element): string | null {
  const classes = node.properties?.['className']
  if (!Array.isArray(classes)) return null
  for (const cls of classes) {
    if (typeof cls !== 'string') continue
    if (cls.startsWith('language-')) return cls.slice('language-'.length).toLowerCase()
  }
  return null
}

/** Fence labels present in a tree, as canonical grammar names. */
export function collectLanguages(tree: Root): string[] {
  const found = new Set<string>()
  visit(tree, 'element', (node: Element, _i, parent) => {
    if (node.tagName !== 'code') return
    if ((parent as Element | undefined)?.tagName !== 'pre') return
    const label = fenceLabel(node)
    if (label === null || label === 'mermaid') return
    const canonical = resolveLanguage(label)
    if (canonical !== null) found.add(canonical)
  })
  return [...found]
}

/**
 * Load any grammars this document needs that are not loaded yet.
 *
 * An unknown language is not an error - plenty of documents fence output,
 * pseudocode or invented labels - so anything unresolvable is simply skipped
 * and its block renders as plain text.
 */
export async function ensureLanguages(
  highlighter: HighlighterCore,
  languages: readonly string[],
): Promise<void> {
  const loaded = new Set(highlighter.getLoadedLanguages())
  const missing = languages.filter((lang) => !loaded.has(lang) && lang in LANG_LOADERS)

  await Promise.all(
    missing.map(async (lang) => {
      try {
        await highlighter.loadLanguage((await LANG_LOADERS[lang]!()) as never)
      } catch {
        // A grammar that fails to load leaves its block unhighlighted, which
        // is a cosmetic loss rather than a broken document.
      }
    }),
  )
}

interface ShikiOptions {
  readonly highlighter: HighlighterCore
}

/**
 * Replace `<pre><code class="language-x">` with Shiki's own output.
 *
 * Mermaid fences are left alone - rehype-mermaid claims those downstream.
 */
export const rehypeShiki: Plugin<[ShikiOptions], Root> = ({ highlighter }) =>
  (tree: Root) => {
    const loaded = new Set(highlighter.getLoadedLanguages())

    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'pre') return
      const code = node.children.find(
        (child): child is Element => child.type === 'element' && child.tagName === 'code',
      )
      if (!code || index === undefined || !parent) return

      const label = fenceLabel(code)
      if (label === null || label === 'mermaid') return

      const lang = resolveLanguage(label)
      if (lang === null || !loaded.has(lang)) return

      try {
        const html = highlighter.codeToHtml(hastToString(code), {
          lang,
          themes: THEMES,
          // CSS variables rather than two full colour sets, so the
          // stylesheet decides which theme applies.
          defaultColor: false,
          cssVariablePrefix: '--shiki-',
        })

        // codeToHtml returns a complete <pre>; splice it in as raw HTML. This
        // is past the trust boundary and is our own generated output.
        parent.children[index] = { type: 'raw', value: html } as unknown as Element
      } catch {
        // Highlighting is decoration. A grammar that throws leaves the
        // original block in place rather than losing the code.
      }
    })
  }

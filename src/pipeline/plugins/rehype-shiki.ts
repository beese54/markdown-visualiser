import { visit } from 'unist-util-visit'
import { toString as hastToString } from 'hast-util-to-string'
import type { Element, Root } from 'hast'
import type { Plugin } from 'unified'
import type { HighlighterCore } from 'shiki/core'

/**
 * Syntax highlighting.
 *
 * Driven by our own highlighter instance rather than `@shikijs/rehype`, whose
 * defaults reach for `getSingletonHighlighter()` from the full `shiki` bundle
 * - all themes and every grammar, around 700KB gzipped. A reader does not
 * need 200 languages.
 *
 * Runs downstream of `rehype-sanitize` (see pipeline/sanitize.ts), so the
 * inline `style` attributes and nested spans Shiki emits are never subject to
 * the sanitizer and need no whitelisting.
 */

/** Languages worth shipping eagerly. Anything else loads on demand. */
export const CORE_LANGUAGES = [
  'bash', 'c', 'cpp', 'css', 'diff', 'go', 'html', 'java', 'javascript',
  'json', 'jsx', 'markdown', 'python', 'rust', 'sql', 'toml', 'tsx',
  'typescript', 'yaml',
] as const

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
      langs: CORE_LANGUAGES.map((lang) => import(`shiki/langs/${lang}.mjs`)),
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    })
  })()

  return highlighterPromise
}

const languageOf = (node: Element): string | null => {
  const classes = node.properties?.['className']
  if (!Array.isArray(classes)) return null
  for (const cls of classes) {
    if (typeof cls !== 'string') continue
    if (cls.startsWith('language-')) return cls.slice('language-'.length).toLowerCase()
  }
  return null
}

/** Code blocks needing a grammar we have not loaded yet. */
export function collectLanguages(tree: Root): string[] {
  const found = new Set<string>()
  visit(tree, 'element', (node: Element, _i, parent) => {
    if (node.tagName !== 'code') return
    if ((parent as Element | undefined)?.tagName !== 'pre') return
    const lang = languageOf(node)
    if (lang) found.add(lang)
  })
  return [...found]
}

/**
 * Load any grammars a document needs that are not in the core set.
 *
 * An unknown language is not an error - plenty of documents fence output,
 * pseudocode or invented labels - so a failed import degrades to plain text.
 */
export async function ensureLanguages(
  highlighter: HighlighterCore,
  languages: readonly string[],
): Promise<void> {
  const loaded = new Set(highlighter.getLoadedLanguages())
  const missing = languages.filter(
    (lang) => !loaded.has(lang) && lang !== 'mermaid' && lang !== 'math',
  )

  await Promise.all(
    missing.map(async (lang) => {
      try {
        await highlighter.loadLanguage(
          (await import(`shiki/langs/${lang}.mjs`)) as never,
        )
      } catch {
        // No such grammar. The block renders unhighlighted, which is fine.
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

      const lang = languageOf(code)
      if (!lang || lang === 'mermaid' || !loaded.has(lang)) return

      try {
        const html = highlighter.codeToHtml(hastToString(code), {
          lang,
          themes: THEMES,
          // Emit CSS variables rather than two full colour sets, so the
          // stylesheet controls which theme applies.
          defaultColor: false,
          cssVariablePrefix: '--shiki-',
        })

        // codeToHtml returns a complete <pre>; splice it in as raw HTML.
        // This is downstream of the sanitizer and is our own output.
        parent.children[index] = {
          type: 'raw',
          value: html,
        } as unknown as Element
      } catch {
        // Highlighting is decoration. A grammar that throws leaves the
        // original block in place rather than losing the code.
      }
    })
  }

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeKatex from 'rehype-katex'
import rehypeStringify from 'rehype-stringify'
import { remarkAlert } from 'remark-github-blockquote-alert'
import { visit } from 'unist-util-visit'
import { toString as hastToString } from 'hast-util-to-string'
import GithubSlugger from 'github-slugger'
import type { Element, Root as HastRoot } from 'hast'
import type { Root as MdastRoot } from 'mdast'

import type {
  AssetRef,
  Heading,
  MarkdownDoc,
  MermaidBlock,
  RenderResult,
  RepairNote,
} from '@/types/domain'
import type { LinkTarget } from '@/ingest/links'

import { sanitizeSchema } from './sanitize'
import { remarkRepair } from './plugins/remark-repair'
import { rehypeAssets } from './plugins/rehype-assets'
import { rehypeMermaid } from './plugins/rehype-mermaid'
import {
  collectLanguages,
  ensureLanguages,
  getHighlighter,
  rehypeShiki,
} from './plugins/rehype-shiki'

/**
 * The single markdown rendering pipeline.
 *
 * Plugin order is the load-bearing decision in this file, specifically the
 * position of `rehype-sanitize`:
 *
 *   parse -> frontmatter -> gfm -> math -> repair -> callouts
 *     -> remark-rehype {allowDangerousHtml} -> rehype-raw
 *     -> rehype-sanitize            <-- TRUST BOUNDARY
 *     -> katex -> shiki -> mermaid -> assets -> stringify
 *
 * `rehype-raw` parses embedded HTML from the markdown into real elements,
 * which is the genuinely dangerous step; the sanitizer must run immediately
 * after it. Everything downstream of the boundary is markup we generate from
 * an already-clean tree, so it is trusted by construction and does not need
 * to be whitelisted in the schema. See pipeline/sanitize.ts.
 */

export interface RenderContext {
  readonly assets: ReadonlyMap<string, AssetRef>
  readonly resolveLink: (href: string, doc: MarkdownDoc) => LinkTarget
}

/** Slug ids on headings, and build the tree the index sidebar reads. */
function headingPlugin(sink: Heading[]) {
  return () => (tree: HastRoot) => {
    const slugger = new GithubSlugger()
    const flat: Heading[] = []

    visit(tree, 'element', (node: Element) => {
      const match = /^h([1-6])$/.exec(node.tagName)
      if (!match?.[1]) return

      const text = hastToString(node).trim()
      if (text === '') return

      const existing = node.properties?.['id']
      const id = typeof existing === 'string' && existing !== '' ? existing : slugger.slug(text)
      node.properties = { ...node.properties, id }

      flat.push({ id, depth: Number(match[1]), text, children: [] })
    })

    // Nest by depth. The repair pass has already guaranteed no level is
    // skipped, so a simple stack is sufficient and cannot mis-nest.
    const stack: Heading[] = []
    for (const heading of flat) {
      while (stack.length > 0 && stack[stack.length - 1]!.depth >= heading.depth) stack.pop()
      const parent = stack[stack.length - 1]
      if (parent) parent.children.push(heading)
      else sink.push(heading)
      stack.push(heading)
    }
  }
}

/** Wrap tables so they can scroll without the page scrolling. */
function tableWrapPlugin() {
  return () => (tree: HastRoot) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'table' || index === undefined || !parent) return
      if ((parent as Element).properties?.['className']?.toString().includes('table-wrap')) return

      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['table-wrap'], tabIndex: 0, role: 'region' },
        children: [node],
      }
    })
  }
}

/** Mark the first paragraph so it can take a drop cap. */
function openingParagraphPlugin() {
  return () => (tree: HastRoot) => {
    for (const node of tree.children) {
      if (node.type !== 'element') continue
      if (node.tagName === 'p') {
        node.properties = {
          ...node.properties,
          className: [
            ...(Array.isArray(node.properties?.['className'])
              ? (node.properties['className'] as string[])
              : []),
            'opening',
          ],
        }
        return
      }
      // A heading before the first paragraph is fine; anything else means
      // the document does not open on prose and gets no drop cap.
      if (!/^h[1-6]$/.test(node.tagName)) return
    }
  }
}

const WORDS_PER_MINUTE = 220

export async function renderDocument(
  doc: MarkdownDoc,
  ctx: RenderContext,
): Promise<RenderResult> {
  if (doc.error !== null) {
    return {
      docId: doc.id,
      html: '',
      headings: [],
      repairs: [],
      mermaidBlocks: [],
      wordCount: 0,
      readingMinutes: 0,
    }
  }

  const repairs: RepairNote[] = []
  const headings: Heading[] = []
  const mermaidBlocks: MermaidBlock[] = []

  // Shiki needs its grammars before the synchronous visitor runs, so the
  // document is parsed once up front purely to discover which languages it
  // uses. Cheaper than shipping every grammar.
  const highlighter = await getHighlighter()
  const discovery = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .runSync(unified().use(remarkParse).parse(doc.raw) as MdastRoot) as HastRoot
  await ensureLanguages(highlighter, collectLanguages(discovery))

  const file = await unified()
    .use(remarkParse)
    // Frontmatter first: it must be recognised before any other plugin can
    // mistake the --- fence for a thematic break.
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRepair, { sink: repairs, title: doc.title })
    .use(remarkAlert)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    // ---- TRUST BOUNDARY. Nothing user-controlled may be added below. ----
    .use(rehypeSanitize, sanitizeSchema)
    // rehype-katex omits throwOnError from its options deliberately: it
    // always renders a parse error inline rather than throwing, which is
    // the behaviour we want for arbitrary dropped documents.
    .use(rehypeKatex)
    .use(rehypeShiki, { highlighter })
    .use(rehypeMermaid, { sink: mermaidBlocks })
    .use(rehypeAssets, { doc, assets: ctx.assets, resolveLink: ctx.resolveLink })
    .use(headingPlugin(headings))
    .use(tableWrapPlugin())
    .use(openingParagraphPlugin())
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(doc.raw)

  const wordCount = doc.raw.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length

  return {
    docId: doc.id,
    html: String(file),
    headings,
    repairs,
    mermaidBlocks,
    wordCount,
    readingMinutes: Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE)),
  }
}

import { visit } from 'unist-util-visit'
import type { Element, Root } from 'hast'
import type { Plugin } from 'unified'

import type { AssetRef, MarkdownDoc } from '@/types/domain'
import { lookupAsset } from '@/ingest/assets'
import type { LinkTarget } from '@/ingest/links'

/**
 * Rewrite relative paths to something the browser can actually load.
 *
 * Markdown in a folder refers to `./img/diagram.png` and `../guide/setup.md`,
 * neither of which means anything to a page served from a bundle. Images
 * become object URLs from the asset map; document links become in-app
 * navigation; anything unresolvable is marked rather than left dangling.
 */

/** Raster image data URIs only. SVG can carry script and is not needed inline. */
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpeg|jpg|gif|webp|avif|bmp);/i

interface AssetOptions {
  readonly doc: MarkdownDoc
  readonly assets: ReadonlyMap<string, AssetRef>
  readonly resolveLink: (href: string, doc: MarkdownDoc) => LinkTarget
}

/** Wrap an image in a figure, using its alt text as the caption. */
function figureFor(img: Element, caption: string): Element {
  return {
    type: 'element',
    tagName: 'figure',
    properties: { className: ['figure'] },
    children: [
      img,
      ...(caption === ''
        ? []
        : [
            {
              type: 'element' as const,
              tagName: 'figcaption',
              properties: {},
              children: [{ type: 'text' as const, value: caption }],
            },
          ]),
    ],
  }
}

/** A named absence. Never a broken-image icon. */
function missingAsset(path: string): Element {
  return {
    type: 'element',
    tagName: 'div',
    properties: { className: ['asset-missing'] },
    children: [
      { type: 'element', tagName: 'span', properties: {}, children: [{ type: 'text', value: 'Image not found' }] },
      { type: 'element', tagName: 'code', properties: {}, children: [{ type: 'text', value: path }] },
    ],
  }
}

export const rehypeAssets: Plugin<[AssetOptions], Root> = (opts) => (tree: Root) => {
  // Images -----------------------------------------------------------------
  visit(tree, 'element', (node: Element, index, parent) => {
    if (node.tagName !== 'img' || index === undefined || !parent) return

    const src = node.properties?.['src']
    if (typeof src !== 'string' || src === '') return

    const alt = typeof node.properties?.['alt'] === 'string' ? node.properties['alt'] : ''

    // Absolute URLs are the author's choice; leave them alone. Data URIs are
    // narrowed to raster image types here as well as in the sanitize schema -
    // this plugin runs past the trust boundary, so it must not be capable of
    // reintroducing something the sanitizer would have rejected.
    if (/^(?:https?:|blob:)/i.test(src) || SAFE_DATA_IMAGE.test(src)) {
      parent.children[index] = figureFor(node, alt)
      return
    }

    if (/^data:/i.test(src)) {
      // A data URI that is not a raster image has no business in an <img>.
      parent.children[index] = missingAsset('unsupported inline image')
      return
    }

    const asset = lookupAsset(opts.assets, opts.doc.path, src)
    if (!asset) {
      parent.children[index] = missingAsset(src)
      return
    }

    node.properties = {
      ...node.properties,
      src: asset.url,
      loading: 'lazy',
      decoding: 'async',
    }
    parent.children[index] = figureFor(node, alt)
  })

  // Links ------------------------------------------------------------------
  visit(tree, 'element', (node: Element) => {
    if (node.tagName !== 'a') return

    const href = node.properties?.['href']
    if (typeof href !== 'string' || href === '') return

    const target = opts.resolveLink(href, opts.doc)

    switch (target.kind) {
      case 'internal':
        node.properties = {
          ...node.properties,
          href: `#${target.docId}${target.hash ? `-${target.hash}` : ''}`,
          'data-doc': target.docId,
          ...(target.hash ? { 'data-hash': target.hash } : {}),
        }
        break

      case 'anchor':
        node.properties = { ...node.properties, href: `#${target.hash}` }
        break

      case 'missing':
        node.properties = {
          ...node.properties,
          href: undefined,
          className: ['link-missing'],
          title: `Not found in this set: ${String(target.href)}`,
          'aria-disabled': 'true',
        }
        break

      case 'external':
        // Opening in a new tab needs noopener, or the target page gets a
        // handle on this window.
        node.properties = {
          ...node.properties,
          target: '_blank',
          rel: ['noopener', 'noreferrer'],
        }
        break
    }
  })
}

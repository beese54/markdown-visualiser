import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { AssetRef, MarkdownDoc } from '@/types/domain'
import { renderDocument } from '@/pipeline/render'
import type { LinkTarget } from '@/ingest/links'

/** Minimal doc so tests can focus on the markdown rather than on ingest. */
const doc = (raw: string, path = 'doc.md'): MarkdownDoc => ({
  id: 'd1',
  path,
  dir: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
  filename: path.slice(path.lastIndexOf('/') + 1),
  title: 'Test',
  frontmatter: {},
  raw,
  order: null,
  sortKey: '0',
  error: null,
})

const noLinks = (): LinkTarget => ({ kind: 'external', href: '#' })

const render = (raw: string, opts?: {
  assets?: Map<string, AssetRef>
  resolveLink?: (href: string, d: MarkdownDoc) => LinkTarget
  path?: string
}) =>
  renderDocument(doc(raw, opts?.path), {
    assets: opts?.assets ?? new Map(),
    resolveLink: opts?.resolveLink ?? noLinks,
  })

describe('GFM (DoD 2.1)', () => {
  it('renders tables inside a scrollable wrapper', async () => {
    const { html } = await render('| A | B |\n| --- | --- |\n| 1 | 2 |\n')
    expect(html).toContain('<table>')
    expect(html).toContain('table-wrap')
    expect(html).toContain('<th>A</th>')
  })

  it('renders footnotes', async () => {
    const { html } = await render('Text[^1]\n\n[^1]: The note.\n')
    expect(html).toContain('footnotes')
    expect(html).toContain('The note.')
  })

  it('renders task lists with disabled checkboxes', async () => {
    const { html } = await render('- [x] done\n- [ ] todo\n')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('checked')
    expect(html).toContain('disabled')
  })

  it('renders strikethrough', async () => {
    const { html } = await render('~~gone~~\n')
    expect(html).toContain('<del>gone</del>')
  })
})

describe('callouts (DoD 2.2)', () => {
  it('renders GitHub blockquote alerts, not literal blockquotes', async () => {
    const { html } = await render('> [!NOTE]\n> Something worth knowing.\n')
    expect(html).toContain('markdown-alert')
    expect(html).toContain('markdown-alert-note')
    expect(html).toContain('Something worth knowing.')
  })

  it('supports each alert kind', async () => {
    for (const kind of ['TIP', 'IMPORTANT', 'WARNING', 'CAUTION']) {
      const { html } = await render(`> [!${kind}]\n> Body.\n`)
      expect(html, kind).toContain(`markdown-alert-${kind.toLowerCase()}`)
    }
  })

  it('leaves an ordinary blockquote alone', async () => {
    const { html } = await render('> Just a quote.\n')
    expect(html).toContain('<blockquote>')
    expect(html).not.toContain('markdown-alert')
  })
})

describe('math (DoD 2.3)', () => {
  it('renders inline and display math through KaTeX', async () => {
    const { html } = await render('Inline $E = mc^2$ and\n\n$$\na^2 + b^2 = c^2\n$$\n')
    expect(html).toContain('katex')
    // KaTeX emits its own markup, which proves it ran after the sanitizer.
    expect(html).toMatch(/<span class="katex/)
  })

  it('does not throw on malformed math', async () => {
    const { html } = await render('$\\frac{unclosed$\n')
    expect(typeof html).toBe('string')
  })
})

describe('syntax highlighting (DoD 2.4)', () => {
  it('highlights a known language with CSS-variable output', async () => {
    const { html } = await render('```python\ndef f(x):\n    return x\n```\n')
    expect(html).toContain('shiki')
    expect(html).toContain('--shiki-')
  })

  it('leaves an unknown language as a plain code block', async () => {
    const { html } = await render('```notalanguage\nsome text\n```\n')
    expect(html).toContain('<code')
    expect(html).toContain('some text')
  })
})

describe('sanitization — the trust boundary (DoD 2.5)', () => {
  const hostile = [
    ['script tag', '<script>alert(1)</script>', '<script'],
    ['img onerror', '<img src=x onerror="alert(1)">', 'onerror'],
    ['iframe', '<iframe src="https://evil.test"></iframe>', '<iframe'],
    ['object', '<object data="x.swf"></object>', '<object'],
    ['embed', '<embed src="x">', '<embed'],
    ['form', '<form action="https://evil.test"><input name="a"></form>', '<form'],
    ['style tag', '<style>body{display:none}</style>', '<style'],
    ['svg onload', '<svg onload="alert(1)"></svg>', 'onload'],
    ['body onload', '<body onload="alert(1)">', 'onload'],
    ['meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.test">', '<meta'],
    ['base tag', '<base href="https://evil.test/">', '<base'],
  ] as const

  for (const [name, payload, forbidden] of hostile) {
    it(`strips ${name}`, async () => {
      const { html } = await render(`Before\n\n${payload}\n\nAfter\n`)
      expect(html.toLowerCase()).not.toContain(forbidden.toLowerCase())
      // The surrounding document must survive; sanitizing is not truncating.
      expect(html).toContain('Before')
      expect(html).toContain('After')
    })
  }

  it('strips javascript: and vbscript: hrefs', async () => {
    const { html } = await render(
      '[a](javascript:alert(1)) [b](vbscript:msgbox(1)) [c](https://ok.test)\n',
      { resolveLink: (href) => ({ kind: 'external', href }) },
    )
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('vbscript:')
    expect(html).toContain('https://ok.test')
  })

  it('strips a data:text/html image source', async () => {
    const { html } = await render(
      '![x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)\n',
    )
    expect(html).not.toContain('text/html')
  })

  it('prefixes ids so markdown cannot clobber DOM properties', async () => {
    const { html } = await render('<div id="documentElement">x</div>\n')
    if (html.includes('id=')) expect(html).toContain('user-content-')
  })

  it('keeps event handlers out even when nested deep in valid markup', async () => {
    const { html } = await render(
      '| A |\n| --- |\n| <span onmouseover="alert(1)">hover</span> |\n',
    )
    expect(html).not.toContain('onmouseover')
    expect(html).toContain('hover')
  })
})

describe('trusted output survives the sanitizer (DoD 2.6)', () => {
  it('keeps KaTeX markup, which proves katex runs after sanitize', async () => {
    const { html } = await render('$x^2$\n')
    // KaTeX output uses inline styles and spans the schema does not permit.
    // Their presence is only possible downstream of the boundary.
    expect(html).toContain('class="katex')
    expect(html).toMatch(/style="/)
  })

  it('keeps Shiki markup, likewise', async () => {
    const { html } = await render('```json\n{"a":1}\n```\n')
    expect(html).toContain('--shiki-')
    expect(html).toMatch(/style="/)
  })

  it('keeps mermaid placeholders', async () => {
    const { html, mermaidBlocks } = await render('```mermaid\ngraph LR\n A-->B\n```\n')
    expect(html).toContain('mermaid-figure')
    expect(mermaidBlocks).toHaveLength(1)
    expect(mermaidBlocks[0]?.code).toContain('graph LR')
  })
})

describe('repair (DoD 2.7, 2.8)', () => {
  it('collapses a skipped heading level and reports it', async () => {
    const { html, repairs } = await render('# One\n\n##### Five\n')
    expect(html).toContain('<h1')
    expect(html).toContain('<h2')
    expect(html).not.toContain('<h5')

    const note = repairs.find((r) => r.rule === 'heading-skip')
    expect(note).toBeDefined()
    expect(note?.before).toContain('h5')
    expect(note?.after).toContain('h2')
  })

  it('demotes a duplicate h1 and reports it', async () => {
    const { html, repairs } = await render('# First\n\n# Second\n')
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(repairs.some((r) => r.rule === 'duplicate-h1')).toBe(true)
  })

  it('preserves relative structure when demoting', async () => {
    const { html } = await render('# A\n\n## A1\n\n# B\n\n## B1\n')
    // B becomes h2; B1 must follow it down rather than staying at h2.
    const depths = [...html.matchAll(/<h([1-6])/g)].map((m) => Number(m[1]))
    expect(depths).toEqual([1, 2, 2, 3])
  })

  it('promotes a document that opens on a deep heading', async () => {
    const { html, repairs } = await render('### Opens deep\n\n#### Child\n')
    const depths = [...html.matchAll(/<h([1-6])/g)].map((m) => Number(m[1]))
    expect(depths).toEqual([1, 2])
    expect(repairs.some((r) => r.rule === 'heading-skip')).toBe(true)
  })

  it('reports an unclosed bold marker', async () => {
    const { repairs } = await render('This **never closes\n')
    expect(repairs.some((r) => r.rule === 'unbalanced-emphasis')).toBe(true)
  })

  it('reports nothing for a well-formed document', async () => {
    const { repairs } = await render('# Title\n\n## Section\n\nA paragraph.\n\n- a\n- b\n')
    expect(repairs).toEqual([])
  })

  it('records a note for every change it makes', async () => {
    const { repairs } = await render('# A\n\n##### B\n\n# C\n\n##### D\n')
    // Two skips and one duplicate h1 - each must be individually reported.
    expect(repairs.filter((r) => r.rule === 'heading-skip').length).toBeGreaterThanOrEqual(2)
    expect(repairs.filter((r) => r.rule === 'duplicate-h1')).toHaveLength(1)
    for (const note of repairs) {
      expect(note.detail.length).toBeGreaterThan(10)
      expect(note.before).not.toBe('')
      expect(note.after).not.toBe('')
    }
  })
})

describe('structure extraction', () => {
  it('builds a nested heading tree with slugged ids', async () => {
    const { headings, html } = await render('# Top\n\n## One\n\n### Deep\n\n## Two\n')
    expect(html).toContain('id="top"')
    expect(headings).toHaveLength(1)
    expect(headings[0]?.text).toBe('Top')
    expect(headings[0]?.children.map((h) => h.text)).toEqual(['One', 'Two'])
    expect(headings[0]?.children[0]?.children[0]?.text).toBe('Deep')
  })

  it('marks the opening paragraph for a drop cap', async () => {
    const { html } = await render('# Title\n\nFirst paragraph.\n\nSecond.\n')
    expect(html).toContain('class="opening"')
    expect(html.match(/class="opening"/g)).toHaveLength(1)
  })

  it('computes a reading estimate', async () => {
    const { wordCount, readingMinutes } = await render(`# T\n\n${'word '.repeat(440)}\n`)
    expect(wordCount).toBeGreaterThan(400)
    expect(readingMinutes).toBe(2)
  })

  it('returns an empty result for a document that failed to read', async () => {
    const failed = { ...doc(''), error: 'permission denied' }
    const result = await renderDocument(failed, { assets: new Map(), resolveLink: noLinks })
    expect(result.html).toBe('')
    expect(result.headings).toEqual([])
  })
})

describe('assets and links', () => {
  const asset: AssetRef = {
    path: 'img/a.png',
    originalPath: 'img/a.png',
    url: 'blob:test/1',
    mime: 'image/png',
    bytes: 10,
  }

  it('rewrites a relative image to its object URL and wraps it in a figure', async () => {
    const { html } = await render('![A caption](./img/a.png)\n', {
      assets: new Map([['img/a.png', asset]]),
    })
    expect(html).toContain('blob:test/1')
    expect(html).toContain('<figure')
    expect(html).toContain('<figcaption>A caption</figcaption>')
  })

  it('renders a named placeholder for a missing image', async () => {
    const { html } = await render('![x](./img/gone.png)\n')
    expect(html).toContain('asset-missing')
    expect(html).toContain('./img/gone.png')
    expect(html).not.toContain('<img')
  })

  it('turns an internal link into in-app navigation', async () => {
    const { html } = await render('[go](./other.md)\n', {
      resolveLink: () => ({ kind: 'internal', docId: 'abc', hash: null }),
    })
    expect(html).toContain('data-doc="abc"')
  })

  it('marks a broken cross-reference instead of linking nowhere', async () => {
    const { html } = await render('[gone](./gone.md)\n', {
      resolveLink: (href) => ({ kind: 'missing', href }),
    })
    expect(html).toContain('link-missing')
    expect(html).toContain('aria-disabled')
  })

  it('adds noopener to external links', async () => {
    const { html } = await render('[out](https://example.test)\n', {
      resolveLink: (href) => ({ kind: 'external', href }),
    })
    expect(html).toContain('noopener')
    expect(html).toContain('noreferrer')
  })
})

/**
 * Regressions found by looking at a screenshot rather than by reading code.
 * Each of these produced correct-looking HTML that read wrongly on the page.
 */
describe('layout and whitespace regressions', () => {
  it('keeps the space before an inline link', async () => {
    // The trailing-whitespace repair used a $-anchored strip, which removed
    // the space belonging to the text node before a link and ran the words
    // together: "See thesetup guide".
    const { html } = await render('See the [setup guide](https://x.test) now.\n', {
      resolveLink: (href) => ({ kind: 'external', href }),
    })
    expect(html).toContain('See the <a')
    expect(html).not.toContain('thesetup')
    expect(html).not.toContain('the<a')
  })

  it('keeps the space before emphasis and code spans', async () => {
    const { html } = await render('A **bold** and `code` and *italic* word.\n')
    expect(html).toContain('A <strong>')
    expect(html).toContain('and <code>')
    expect(html).toContain('and <em>')
  })

  it('drops a leading h1 that repeats the document title', async () => {
    // The reader prints the title in its own header, so leaving the heading
    // in the prose showed the same words twice, stacked.
    const doc: MarkdownDoc = {
      id: 'd1', path: 'a.md', dir: '', filename: 'a.md',
      title: 'The Handbook',
      frontmatter: {},
      raw: '# The Handbook\n\nBody text.\n',
      order: null, sortKey: '0', error: null,
    }
    const { html, repairs } = await renderDocument(doc, {
      assets: new Map(),
      resolveLink: noLinks,
    })
    expect(html).not.toContain('<h1')
    expect(html).toContain('Body text.')
    expect(repairs.some((r) => r.rule === 'duplicate-h1')).toBe(true)
  })

  it('keeps a leading h1 that says something different', async () => {
    const doc: MarkdownDoc = {
      id: 'd1', path: 'a.md', dir: '', filename: 'a.md',
      title: 'From Frontmatter',
      frontmatter: { title: 'From Frontmatter' },
      raw: '# A Different Heading\n\nBody.\n',
      order: null, sortKey: '0', error: null,
    }
    const { html } = await renderDocument(doc, { assets: new Map(), resolveLink: noLinks })
    expect(html).toContain('<h1')
    expect(html).toContain('A Different Heading')
  })

  it('matches the title loosely, ignoring case and punctuation', async () => {
    const doc: MarkdownDoc = {
      id: 'd1', path: 'a.md', dir: '', filename: 'a.md',
      title: 'API Reference',
      frontmatter: {},
      raw: '# api reference!\n\nBody.\n',
      order: null, sortKey: '0', error: null,
    }
    const { html } = await renderDocument(doc, { assets: new Map(), resolveLink: noLinks })
    expect(html).not.toContain('<h1')
  })

  it('does not treat a deeper opening heading as the title', async () => {
    const doc: MarkdownDoc = {
      id: 'd1', path: 'a.md', dir: '', filename: 'a.md',
      title: 'Section',
      frontmatter: {},
      raw: '## Section\n\nBody.\n',
      order: null, sortKey: '0', error: null,
    }
    const { html } = await renderDocument(doc, { assets: new Map(), resolveLink: noLinks })
    // Promoted to h1 by the hierarchy repair, but not removed.
    expect(html).toContain('Section')
  })
})

describe('heading promotion interacts with duplicate detection', () => {
  it('demotes a later h1 when an earlier heading was promoted into h1', async () => {
    // Found by screenshot: with the title heading removed, the h5 was promoted
    // to h1 but not recorded as the title, so the real h1 below it stayed an
    // h1 too and the page showed two competing titles.
    const { html, repairs } = await render('##### Promoted\n\n# Later Title\n')
    const depths = [...html.matchAll(/<h([1-6])/g)].map((m) => Number(m[1]))
    expect(depths).toEqual([1, 2])
    expect(repairs.some((r) => r.rule === 'duplicate-h1')).toBe(true)
  })

  it('keeps a single h1 when the title heading is removed as redundant', async () => {
    const doc: MarkdownDoc = {
      id: 'd1', path: 'a.md', dir: '', filename: 'a.md',
      title: 'Broken On Purpose',
      frontmatter: {},
      raw: '# Broken On Purpose\n\n##### Jumped\n\n# A Second Title\n',
      order: null, sortKey: '0', error: null,
    }
    const { html } = await renderDocument(doc, { assets: new Map(), resolveLink: noLinks })
    const depths = [...html.matchAll(/<h([1-6])/g)].map((m) => Number(m[1]))
    expect(depths.filter((d) => d === 1)).toHaveLength(1)
  })
})

describe('rendering prerequisites present in the bundle', () => {
  it("imports KaTeX's stylesheet, which hides the duplicate MathML", () => {
    // KaTeX emits both an HTML rendering and a MathML copy of every formula.
    // Without its stylesheet the MathML is visible too, so each equation is
    // printed twice: once typeset, once as raw fallback text.
    const main = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8')
    expect(main).toContain('katex/dist/katex.min.css')
  })

  it('maps Shiki CSS variables onto colour', () => {
    // Shiki runs with defaultColor:false and emits --shiki-* variables rather
    // than committing to a theme. Nothing is coloured until CSS maps them.
    const css = readFileSync(resolve(process.cwd(), 'src/styles/paper.css'), 'utf8')
    expect(css).toMatch(/color:\s*var\(--shiki-light\)/)
  })
})

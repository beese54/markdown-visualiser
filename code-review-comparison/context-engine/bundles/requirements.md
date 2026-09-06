# Selective context bundle — requirements agent

Retrieved 30 of 199 chunks (25,430 of 118,192 chars — 78.5% reduction vs full context)

## interface: `MarkdownDoc` — `src/types/domain.ts:52-69` (cos 0.601)
```ts
export interface MarkdownDoc {
  /** Stable hash of the relative path. */
  readonly id: string
  /** Normalised POSIX relative path from the drop root. */
  readonly path: string
  readonly dir: string
  readonly filename: string
  /** frontmatter.title, else the first H1, else a prettified filename. */
  readonly title: string
  readonly frontmatter: Readonly<Record<string, unknown>>
  readonly raw: string
  /** Explicit frontmatter `order`, when present. */
  readonly order: number | null
  /** Composite key computed by ordering.ts; sorting is a plain string compare. */
  readonly sortKey: string
  /** Per-file failure. A failed document never fails the whole set. */
  readonly error: string | null
}
```

## interface: `IndexSidebarProps` — `src/reader/IndexSidebar.tsx:14-19` (cos 0.557)
```ts
interface IndexSidebarProps {
  readonly set: DocumentSet
  readonly activeDoc: MarkdownDoc
  readonly headings: readonly Heading[]
  readonly onOpenDoc: (docId: string) => void
}
```

## interface: `ShikiOptions` — `src/pipeline/plugins/rehype-shiki.ts:104-106` (cos 0.535)
```ts
interface ShikiOptions {
  readonly highlighter: HighlighterCore
}
```

## function: `getHighlighter` — `src/pipeline/plugins/rehype-shiki.ts:33-51` (cos 0.499)
```ts
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
```

## function: `rehypeShiki` — `src/pipeline/plugins/rehype-shiki.ts:113-148` (cos 0.496)
```ts
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
```

## function: `renderDocument` — `src/pipeline/render.ts:138-207` (cos 0.492)
```ts
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
```

## const: `highlighterPromise` — `src/pipeline/plugins/rehype-shiki.ts:24-24` (cos 0.484)
```ts
let highlighterPromise: Promise<HighlighterCore> | null = null
```

## const: `THEMES` — `src/pipeline/plugins/rehype-shiki.ts:22-22` (cos 0.462)
```ts
export const THEMES = { light: 'github-light', dark: 'github-dark' } as const
```

## function: `IndexSidebar` — `src/reader/IndexSidebar.tsx:21-99` (cos 0.459)
```ts
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
```

## function: `rehypeMermaid` — `src/pipeline/plugins/rehype-mermaid.ts:45-96` (cos 0.451)
```ts
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
```

## function: `readDoc` — `src/ingest/docset.ts:178-201` (cos 0.446)
```ts
async function readDoc(entry: WalkedFile): Promise<MarkdownDoc> {
  const raw = await entry.file.text()
  const { data, body } = extractFrontmatter(raw)

  const path = normaliseAssetPath(entry.path)
  const slash = path.lastIndexOf('/')
  const filename = slash === -1 ? path : path.slice(slash + 1)
  const dir = slash === -1 ? '' : path.slice(0, slash)
  const order = coerceOrder(data['order'])

  return {
    id: hashPath(path),
    path,
    dir,
    filename,
    title:
      coerceTitle(data['title']) ?? firstHeading(body) ?? prettifyFilename(filename),
    frontmatter: data,
    raw,
    order,
    sortKey: computeSortKey({ path, order }),
    error: null,
  }
}
```

## function: `failedDoc` — `src/ingest/docset.ts:208-225` (cos 0.443)
```ts
function failedDoc(entry: WalkedFile, err: unknown): MarkdownDoc {
  const path = normaliseAssetPath(entry.path)
  const slash = path.lastIndexOf('/')
  const filename = slash === -1 ? path : path.slice(slash + 1)

  return {
    id: hashPath(path),
    path,
    dir: slash === -1 ? '' : path.slice(0, slash),
    filename,
    title: prettifyFilename(filename),
    frontmatter: {},
    raw: '',
    order: null,
    sortKey: computeSortKey({ path, order: null }),
    error: err instanceof Error ? err.message : 'Could not read this file',
  }
}
```

## interface: `DocumentViewProps` — `src/reader/DocumentView.tsx:19-26` (cos 0.443)
```ts
interface DocumentViewProps {
  readonly doc: MarkdownDoc
  readonly result: RenderResult
  readonly index: number
  readonly total: number
  readonly onNavigate: (docId: string, hash: string | null) => void
  readonly onImageOpen: (src: string, alt: string) => void
}
```

## function: `collectLanguages` — `src/pipeline/plugins/rehype-shiki.ts:65-76` (cos 0.435)
```ts
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
```

## function: `isMarkdownPath` — `src/ingest/docset.ts:18-19` (cos 0.435)
```ts
const isMarkdownPath = (path: string): boolean =>
  (MARKDOWN_EXTENSIONS as readonly string[]).includes(extensionOf(path))
```

## const: `ALIASES` — `src/pipeline/plugins/shiki-langs.ts:62-83` (cos 0.425)
```ts
const ALIASES: Readonly<Record<string, string>> = {
  sh: 'bash',
  zsh: 'bash',
  shell: 'shellscript',
  console: 'shellscript',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  yml: 'yaml',
  md: 'markdown',
  'c++': 'cpp',
  cs: 'csharp',
  'c#': 'csharp',
  dockerfile: 'docker',
  htm: 'html',
  ps1: 'powershell',
  kt: 'kotlin',
  conf: 'ini',
  make: 'makefile',
}
```

## interface: `DocumentSet` — `src/types/domain.ts:76-86` (cos 0.425)
```ts
export interface DocumentSet {
  readonly id: string
  /** The dropped folder's name, or 'Documents' for loose files. */
  readonly rootName: string
  /** In resolved reading order. */
  readonly docs: readonly MarkdownDoc[]
  readonly assets: ReadonlyMap<string, AssetRef>
  readonly skipped: readonly SkippedFile[]
  readonly totalBytes: number
  readonly createdAt: number
}
```

## function: `buildStandalone` — `src/export/standalone.ts:105-174` (cos 0.419)
```ts
export async function buildStandalone({ set, results }: StandaloneOptions): Promise<string> {
  const byId = new Map(results.map((r) => [r.docId, r]))

  // A detached host, so building the export never disturbs what is on screen.
  const host = document.createElement('div')
  host.className = 'export-root'

  for (const doc of set.docs) {
    const result = byId.get(doc.id)
    if (!result || doc.error !== null) continue

    const article = document.createElement('article')
    article.className = 'doc'

    const header = document.createElement('header')
    header.className = 'doc-head'
    const title = document.createElement('h1')
    title.className = 'doc-title'
    title.id = `doc-${doc.id}`
    title.textContent = doc.title
    header.append(title)

    const body = document.createElement('div')
    body.className = 'prose'
    // Pipeline output, already past the trust boundary.
    body.innerHTML = result.html

    article.append(header, body)
    host.append(article)
  }

  // Diagrams must be static SVG before serialising: the print context runs
  // with JavaScript disabled, so a placeholder left here never becomes a
  // diagram. Anything already drawn on screen is copied; the rest - every
  // document the reader never opened - is drawn here.
  await whenDiagramsSettled()
  copyRenderedDiagrams(host)

  // mermaid measures text, so the host must be laid out. Attached off-screen
  // rather than detached, then removed once the SVG is in hand.
  host.style.position = 'fixed'
  host.style.left = '-10000px'
  host.style.top = '0'
  host.style.width = '820px'
  document.body.append(host)
  try {
    await drawDiagramsIn(host, allMermaidBlocks(results))
  } finally {
    host.remove()
    host.removeAttribute('style')
  }

  await inlineImages(host)
  const css = await collectCss()

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(set.rootName)}</title>`,
    `<style>\n${css}\n</style>`,
    '</head>',
    '<body>',
    host.outerHTML,
    '</body>',
    '</html>',
  ].join('\n')
}
```

## function: `ensureLanguages` — `src/pipeline/plugins/rehype-shiki.ts:85-102` (cos 0.416)
```ts
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
```

## function: `remarkRepair` — `src/pipeline/plugins/remark-repair.ts:270-280` (cos 0.415)
```ts
export const remarkRepair: Plugin<[RepairOptions], Root> = (opts) => (tree: Root) => {
  // Order matters: emphasis is reported against the original text, while
  // headings and lists rewrite structure.
  reportUnbalancedEmphasis(tree, opts)
  // Before repairHeadings, so the hierarchy is normalised against what will
  // actually be rendered rather than against a heading about to be removed.
  dropRedundantTitle(tree, opts)
  repairHeadings(tree, opts)
  repairListNesting(tree, opts)
  repairLists(tree, opts)
}
```

## function: `renderPdf` — `server/pdf.ts:134-198` (cos 0.409)
```ts
export async function renderPdf(request: PdfRequest): Promise<Buffer> {
  // Reject rather than queue without bound.
  if (limit.pendingCount > limit.concurrency * 4) throw new BusyError()

  return limit(async () => {
    const browser = await getBrowser()

    const context = await browser.newContext({
      // The single highest-value control. This endpoint prints HTML that has
      // already been rendered, so script execution has no legitimate purpose
      // and its absence removes an entire class of vector.
      javaScriptEnabled: false,
      // storageState is deliberately omitted rather than set to undefined: a
      // fresh context starts with no cookies or storage anyway, and that is
      // the isolation we want between untrusted documents.
      bypassCSP: false,
      // Deterministic output regardless of the host's locale or timezone.
      locale: 'en-GB',
      timezoneId: 'UTC',
      colorScheme: 'light',
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    })

    try {
      await harden(context)
      context.setDefaultTimeout(PAGE_DEFAULT_TIMEOUT_MS)
      const page = await context.newPage()

      const work = (async () => {
        await page.setContent(request.html, {
          // Deliberately not 'networkidle': with every request aborted, the
          // network never becomes idle in the way Playwright waits for, and
          // the call would sit until it timed out on every single render.
          waitUntil: 'load',
          timeout: SETCONTENT_TIMEOUT_MS,
        })

        // Fonts are inlined as data URIs, but layout still needs them ready
        // or the first page can be typeset with fallback metrics.
        await page
          .evaluate(() => document.fonts.ready.then(() => undefined))
          .catch(() => undefined)

        await page.emulateMedia({ media: 'print' })

        return page.pdf({
          format: request.format ?? 'A4',
          landscape: request.landscape ?? false,
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: true,
          headerTemplate: headerTemplate(request.title ?? ''),
          footerTemplate: FOOTER_TEMPLATE,
          margin: { top: '22mm', right: '18mm', bottom: '20mm', left: '22mm' },
        })
      })()

      return await withDeadline(work, RENDER_DEADLINE_MS)
    } finally {
      // Always, even on timeout: a leaked context is a leaked browser process.
      await context.close().catch(() => undefined)
    }
  })
}
```

## const: `LANG_LOADERS` — `src/pipeline/plugins/shiki-langs.ts:23-59` (cos 0.402)
```ts
export const LANG_LOADERS: Readonly<Record<string, LangLoader>> = {
  bash: () => import('shiki/langs/bash.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  csharp: () => import('shiki/langs/csharp.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
  docker: () => import('shiki/langs/docker.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  graphql: () => import('shiki/langs/graphql.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  ini: () => import('shiki/langs/ini.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  kotlin: () => import('shiki/langs/kotlin.mjs'),
  lua: () => import('shiki/langs/lua.mjs'),
  makefile: () => import('shiki/langs/makefile.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  nginx: () => import('shiki/langs/nginx.mjs'),
  php: () => import('shiki/langs/php.mjs'),
  powershell: () => import('shiki/langs/powershell.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  ruby: () => import('shiki/langs/ruby.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  scala: () => import('shiki/langs/scala.mjs'),
  shellscript: () => import('shiki/langs/shellscript.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  swift: () => import('shiki/langs/swift.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  vue: () => import('shiki/langs/vue.mjs'),
  xml: () => import('shiki/langs/xml.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
}
```

## interface: `PdfOptions` — `src/export/pdf.ts:22-26` (cos 0.402)
```ts
export interface PdfOptions {
  readonly html: string
  readonly title: string
  readonly format?: 'A4' | 'Letter'
}
```

## class: `ExportTooLargeError` — `src/export/pdf.ts:11-20` (cos 0.402)
```ts
export class ExportTooLargeError extends Error {
  constructor(bytes: number) {
    super(
      `This export is ${(bytes / 1024 / 1024).toFixed(1)} MB, over the ` +
        `${LIMITS.pdfBodyLimitBytes / 1024 / 1024} MB limit. Try the ` +
        'self-contained HTML export instead.',
    )
    this.name = 'ExportTooLargeError'
  }
}
```

## interface: `StandaloneOptions` — `src/export/standalone.ts:92-96` (cos 0.400)
```ts
export interface StandaloneOptions {
  readonly set: DocumentSet
  /** Rendered results, in reading order. */
  readonly results: readonly RenderResult[]
}
```

## function: `requestPdf` — `src/export/pdf.ts:28-58` (cos 0.399)
```ts
export async function requestPdf({ html, title, format = 'A4' }: PdfOptions): Promise<Blob> {
  // Checked here as well as on the server: a clear message beats a 413.
  const bytes = new Blob([html]).size
  if (bytes > LIMITS.pdfBodyLimitBytes) throw new ExportTooLargeError(bytes)

  const response = await fetch('/api/export/pdf', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ html, title, format }),
  })

  if (!response.ok) {
    const message = await response
      .json()
      .then((body: unknown) =>
        typeof body === 'object' && body !== null && 'error' in body
          ? String((body as { error: unknown }).error)
          : null,
      )
      .catch(() => null)

    throw new Error(
      message ??
        (response.status === 413
          ? 'This export is too large for the print service.'
          : `The print service returned ${response.status}.`),
    )
  }

  return response.blob()
}
```

## function: `HeadingTree` — `src/reader/IndexSidebar.tsx:101-135` (cos 0.396)
```ts
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
```

## interface: `Frontmatter` — `src/ingest/docset.ts:36-40` (cos 0.392)
```ts
export interface Frontmatter {
  readonly data: Record<string, unknown>
  /** The document body with the frontmatter block removed. */
  readonly body: string
}
```

## interface: `RepairOptions` — `src/pipeline/plugins/remark-repair.ts:27-35` (cos 0.390)
```ts
interface RepairOptions {
  /** Collected notes are pushed here; the caller owns the array. */
  readonly sink: RepairNote[]
  /**
   * The document title as resolved by ingest, which the reader already shows
   * in its own title block. A leading H1 repeating it is printed twice.
   */
  readonly title?: string
}
```

## type: `RepairRule` — `src/types/domain.ts:30-35` (cos 0.386)
```ts
export type RepairRule =
  | 'heading-skip'
  | 'duplicate-h1'
  | 'list-nesting'
  | 'mixed-markers'
  | 'unbalanced-emphasis'
```

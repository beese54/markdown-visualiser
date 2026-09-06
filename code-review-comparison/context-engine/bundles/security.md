# Selective context bundle — security agent

Retrieved 30 of 199 chunks (20,842 of 118,192 chars — 82.4% reduction vs full context)

## function: `resolveLink` — `src/ingest/links.ts:64-101` (sim -0.052)
```ts
export function resolveLink(
  href: string,
  fromDoc: MarkdownDoc,
  docIndex: ReadonlyMap<string, string>,
): LinkTarget {
  const trimmed = href.trim()

  if (trimmed === '') return { kind: 'external', href }
  if (trimmed.startsWith('#')) return { kind: 'anchor', hash: trimmed.slice(1) }
  if (EXTERNAL_SCHEME.test(trimmed)) return { kind: 'external', href: trimmed }
  if (trimmed.startsWith('//')) return { kind: 'external', href: trimmed }

  const hashAt = trimmed.indexOf('#')
  const pathPart = hashAt === -1 ? trimmed : trimmed.slice(0, hashAt)
  const hash = hashAt === -1 ? null : trimmed.slice(hashAt + 1)

  if (pathPart === '') {
    return hash === null ? { kind: 'external', href } : { kind: 'anchor', hash }
  }

  const resolved = resolveRelative(fromDoc.path, pathPart)

  const direct = docIndex.get(resolved)
  if (direct !== undefined) return { kind: 'internal', docId: direct, hash }

  const withoutExt = docIndex.get(resolved.replace(/\.(md|markdown|mdown|mkd)$/i, ''))
  if (withoutExt !== undefined) return { kind: 'internal', docId: withoutExt, hash }

  const asDir = docIndex.get(resolved.replace(/\/$/, ''))
  if (asDir !== undefined) return { kind: 'internal', docId: asDir, hash }

  // Looks like a document reference but resolves to nothing in this set.
  if (/\.(md|markdown|mdown|mkd)$/i.test(pathPart)) {
    return { kind: 'missing', href: trimmed }
  }

  return { kind: 'external', href: trimmed }
}
```

## const: `printSchema` — `src/pipeline/sanitize.ts:172-180` (sim -0.063)
```ts
export const printSchema: SanitizeSchema = {
  ...sanitizeSchema,
  // The print context loads no subresources at all, so remote URLs have no
  // legitimate purpose. Only inlined data and blob URLs remain.
  protocols: {
    href: ['http', 'https', 'mailto'],
    src: ['data', 'blob'],
  },
}
```

## function: `resolveRelative` — `src/ingest/assets.ts:28-42` (sim -0.136)
```ts
export function resolveRelative(fromDocPath: string, target: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return target // absolute URL scheme
  if (target.startsWith('/')) return normaliseAssetPath(target)

  const slash = fromDocPath.lastIndexOf('/')
  const baseDir = slash === -1 ? '' : fromDocPath.slice(0, slash)

  const segments = baseDir === '' ? [] : baseDir.split('/')
  for (const part of target.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') segments.pop()
    else segments.push(part)
  }
  return normaliseAssetPath(segments.join('/'))
}
```

## function: `escapeHtml` — `server/pdf.ts:217-218` (sim -0.152)
```ts
const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
```

## function: `stripCommonRoot` — `src/ingest/walker.ts:155-177` (sim -0.218)
```ts
export function stripCommonRoot(files: readonly WalkedFile[]): {
  rootName: string
  files: WalkedFile[]
} {
  if (files.length === 0) return { rootName: 'Documents', files: [] }

  const firstSegments = new Set(
    files.map((f) => (f.path.includes('/') ? f.path.slice(0, f.path.indexOf('/')) : null)),
  )

  // Only strip when every file shares one real directory prefix.
  if (firstSegments.size === 1) {
    const root = [...firstSegments][0]
    if (root) {
      return {
        rootName: root,
        files: files.map((f) => ({ ...f, path: f.path.slice(root.length + 1) })),
      }
    }
  }

  return { rootName: 'Documents', files: [...files] }
}
```

## function: `escapeHtml` — `src/export/standalone.ts:89-90` (sim -0.230)
```ts
const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
```

## function: `buildDocIndex` — `src/ingest/links.ts:22-55` (sim -0.238)
```ts
export function buildDocIndex(docs: readonly MarkdownDoc[]): Map<string, string> {
  const index = new Map<string, string>()
  const ambiguous = new Set<string>()

  const add = (key: string, docId: string) => {
    const normalised = normaliseAssetPath(key)
    if (normalised === '') return
    const existing = index.get(normalised)
    if (existing !== undefined && existing !== docId) {
      ambiguous.add(normalised)
      return
    }
    index.set(normalised, docId)
  }

  for (const doc of docs) {
    add(doc.path, doc.id)
    // Links are commonly written without the extension, and directory links
    // (`../guide/`) are expected to land on that directory's index file.
    add(doc.path.replace(/\.(md|markdown|mdown|mkd)$/i, ''), doc.id)
  }

  for (const doc of docs) {
    const base = doc.filename.replace(/\.(md|markdown|mdown|mkd)$/i, '')
    if (['readme', 'index'].includes(base.toLowerCase())) {
      add(doc.dir === '' ? '.' : doc.dir, doc.id)
    }
  }

  // A key that matched two different documents cannot be resolved safely.
  for (const key of ambiguous) index.delete(key)

  return index
}
```

## function: `walkEntry` — `src/ingest/walker.ts:62-92` (sim -0.247)
```ts
async function walkEntry(
  entry: FileSystemEntry,
  prefix: string,
  out: WalkedFile[],
  opts: WalkOptions,
): Promise<void> {
  if (out.length >= opts.maxFiles) return
  if (isIgnoredName(entry.name)) return

  const path = prefix ? `${prefix}/${entry.name}` : entry.name

  if (entry.isFile) {
    try {
      out.push({ path, file: await entryToFile(entry as FileSystemFileEntry) })
      opts.onProgress?.(out.length)
    } catch {
      // A single unreadable file must not abort the whole import. It is
      // simply absent; docset.ts reports what it expected but did not get.
    }
    return
  }

  if (entry.isDirectory) {
    const dir = entry as FileSystemDirectoryEntry
    const children = await readAllEntries(dir.createReader())
    for (const child of children) {
      await walkEntry(child, path, out, opts)
      if (out.length >= opts.maxFiles) return
    }
  }
}
```

## type: `LinkTarget` — `src/ingest/links.ts:13-17` (sim -0.247)
```ts
export type LinkTarget =
  | { readonly kind: 'internal'; readonly docId: string; readonly hash: string | null }
  | { readonly kind: 'external'; readonly href: string }
  | { readonly kind: 'anchor'; readonly hash: string }
  | { readonly kind: 'missing'; readonly href: string }
```

## interface: `RenderResult` — `src/types/domain.ts:95-104` (sim -0.248)
```ts
export interface RenderResult {
  readonly docId: string
  /** Sanitised, then KaTeX- and Shiki-processed. Safe to inject. */
  readonly html: string
  readonly headings: readonly Heading[]
  readonly repairs: readonly RepairNote[]
  readonly mermaidBlocks: readonly MermaidBlock[]
  readonly wordCount: number
  readonly readingMinutes: number
}
```

## function: `launch` — `server/pdf.ts:38-52` (sim -0.251)
```ts
async function launch(): Promise<Browser> {
  return chromium.launch({
    args: [
      // Without this Chromium uses /dev/shm, which is small in a container.
      '--disable-dev-shm-usage',
      // No extensions, no first-run UI, no background networking.
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-default-apps',
    ],
  })
}
```

## interface: `AssetOptions` — `src/pipeline/plugins/rehype-assets.ts:21-25` (sim -0.282)
```ts
interface AssetOptions {
  readonly doc: MarkdownDoc
  readonly assets: ReadonlyMap<string, AssetRef>
  readonly resolveLink: (href: string, doc: MarkdownDoc) => LinkTarget
}
```

## const: `ALLOWED_SCHEMES` — `server/pdf.ts:118-118` (sim -0.299)
```ts
const ALLOWED_SCHEMES = /^(?:data:|blob:|about:)/i
```

## interface: `WalkedFile` — `src/ingest/walker.ts:11-15` (sim -0.303)
```ts
export interface WalkedFile {
  /** POSIX relative path from the drop root, e.g. `guide/img/diagram.png`. */
  readonly path: string
  readonly file: File
}
```

## const: `sanitizeSchema` — `src/pipeline/sanitize.ts:82-160` (sim -0.314)
```ts
export const sanitizeSchema: SanitizeSchema = {
  ...base,

  tagNames: [
    ...(base.tagNames ?? []),
    // GFM tables and footnotes need the full table set plus <section>.
    'section',
    // Figures are how images are presented; the default schema omits them.
    'figure',
    'figcaption',
  ],

  attributes: {
    ...base.attributes,

    // Heading anchors, footnote targets and callout wrappers all need ids.
    '*': [...inherited('*'), 'id', 'className'],

    code: [...inherited('code'), classes(CODE_LANGUAGE_PATTERN, ...MATH_CLASSES)],
    pre: [...inherited('pre'), classes(CODE_LANGUAGE_PATTERN, 'mermaid')],
    span: [...inherited('span'), classes(...MATH_CLASSES)],
    div: [...inherited('div'), classes(...MATH_CLASSES, ...ALERT_CLASSES)],
    p: [...inherited('p'), classes(...ALERT_CLASSES)],
    blockquote: [...inherited('blockquote'), classes(...ALERT_CLASSES)],

    // Relative image paths are rewritten to blob URLs after sanitization, so
    // src must survive - but as an explicit value allowlist, not a bare
    // 'src'. A scheme-only check passes `data:text/html;base64,<script>`,
    // because the sanitizer validates the scheme and not the media type.
    // Listing the permitted shapes is what actually closes that.
    img: [
      ...inheritedExcept('img', ['src', 'srcSet', 'srcset']),
      [
        'src',
        /^https?:\/\//i,
        /^blob:/i,
        // Raster data URIs only. SVG is excluded: it is a document format
        // that can carry script, and nothing needs it inlined here.
        /^data:image\/(?:png|jpeg|jpg|gif|webp|avif|bmp);/i,
        // Relative paths, resolved against the asset map downstream.
        /^(?!\w+:)[^\s]+$/,
      ] as PropertyDefinition,
      'alt',
      'title',
      'width',
      'height',
      'loading',
    ],
    a: [...inherited('a'), 'href', 'title', 'id', 'dataFootnoteRef', 'ariaDescribedby'],

    // Task list checkboxes. Values are pinned, so nothing else gets through.
    input: [
      ['type', 'checkbox'] as PropertyDefinition,
      ['disabled', true] as PropertyDefinition,
      ['checked', true] as PropertyDefinition,
    ],

    th: [...inherited('th'), 'colSpan', 'rowSpan'],
    td: [...inherited('td'), 'colSpan', 'rowSpan'],
  },

  // Only these schemes may appear in a URL attribute. This is what stops
  // `javascript:`, `vbscript:` and `data:text/html` payloads.
  protocols: {
    ...base.protocols,
    href: ['http', 'https', 'mailto', 'tel', 'irc', 'ircs', 'xmpp'],
    // Belt and braces with the img value allowlist above: this rejects the
    // scheme, that rejects the media type.
    src: ['http', 'https', 'blob', 'data'],
  },

  // Never allowed, whatever the markdown says. Listing them explicitly rather
  // than relying on the default is deliberate: it documents the intent and
  // survives a future change to the upstream default schema.
  strip: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form'],

  clobberPrefix: 'user-content-',
  clobber: ['name', 'id'],
}
```

## function: `makeLinkResolver` — `src/ingest/links.ts:104-108` (sim -0.318)
```ts
export function makeLinkResolver(set: DocumentSet) {
  const index = buildDocIndex(set.docs)
  return (href: string, fromDoc: MarkdownDoc): LinkTarget =>
    resolveLink(href, fromDoc, index)
}
```

## function: `collectCss` — `src/export/standalone.ts:37-70` (sim -0.318)
```ts
async function collectCss(): Promise<string> {
  const parts: string[] = []

  for (const sheet of Array.from(document.styleSheets)) {
    let text = ''
    try {
      text = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n')
    } catch {
      // A cross-origin sheet cannot be read. There should be none - the app
      // makes no third-party requests - so this is a safety net, not a path.
      continue
    }

    // Resolve relative url() references against the sheet, then inline them.
    const base = sheet.href ?? document.baseURI
    const urls = new Set(
      [...text.matchAll(/url\((['"]?)([^'")]+)\1\)/g)]
        .map((m) => m[2])
        .filter((u): u is string => u !== undefined && !u.startsWith('data:')),
    )

    for (const url of urls) {
      const absolute = new URL(url, base).href
      const dataUri = await toDataUri(absolute)
      if (dataUri !== null) text = text.split(url).join(dataUri)
    }

    parts.push(text)
  }

  return parts.join('\n')
}
```

## const: `useReader` — `src/state/store.ts:28-95` (sim -0.324)
```ts
export const useReader = create<ReaderState>((set, get) => {
  /** Object URLs are owned by the set; discarding one without revoking them
   *  leaks every image for the lifetime of the page. */
  const disposeCurrent = () => {
    const current = get().set
    if (current) revokeAssets(current.assets)
  }

  const ingest = async (
    collect: () => Promise<{ path: string; file: File }[]>,
  ): Promise<void> => {
    try {
      set({ phase: { kind: 'reading', count: 0 } })
      const walked = await collect()

      set({ phase: { kind: 'building' } })
      const { rootName, files } = stripCommonRoot(walked)
      const built = await buildDocumentSet(files, { rootName })

      disposeCurrent()
      set({
        set: built,
        activeDocId: built.docs[0]?.id ?? null,
        phase: { kind: 'ready' },
      })
    } catch (err) {
      set({
        phase: {
          kind: 'error',
          message:
            err instanceof IngestError || err instanceof Error
              ? err.message
              : 'Something went wrong reading those files.',
          code: err instanceof IngestError ? err.code : 'read-failed',
        },
      })
    }
  }

  return {
    phase: { kind: 'idle' },
    set: null,
    activeDocId: null,

    ingestDataTransfer: (dt) =>
      ingest(() =>
        walkDataTransfer(dt, {
          maxFiles: LIMITS.maxFiles,
          onProgress: (count) => set({ phase: { kind: 'reading', count } }),
        }),
      ),

    ingestFileList: (files) =>
      ingest(async () =>
        walkFileList(files, {
          maxFiles: LIMITS.maxFiles,
          onProgress: (count) => set({ phase: { kind: 'reading', count } }),
        }),
      ),

    openDoc: (docId) => set({ activeDocId: docId }),

    reset: () => {
      disposeCurrent()
      set({ phase: { kind: 'idle' }, set: null, activeDocId: null })
    },
  }
})
```

## const: `Prose` — `src/reader/Prose.tsx:16-31` (sim -0.326)
```ts
export const Prose = memo(function Prose({
  html,
  rootRef,
}: {
  readonly html: string
  readonly rootRef: Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={rootRef}
      className="prose"
      // Sanitised upstream at the pipeline's trust boundary.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
```

## function: `harden` — `server/pdf.ts:120-132` (sim -0.329)
```ts
async function harden(context: BrowserContext): Promise<void> {
  // Registered on the context, not the page, so it covers every frame.
  await context.route('**/*', (route) => {
    const url = route.request().url()
    if (ALLOWED_SCHEMES.test(url)) {
      void route.continue()
      return
    }
    // Everything else: http(s) to any host, file://, ws://. A legitimate
    // export has no remote references, so this only ever blocks an attack.
    void route.abort('blockedbyclient')
  })
}
```

## const: `PDF_BODY_LIMIT` — `server/index.ts:20-20` (sim -0.336)
```ts
const PDF_BODY_LIMIT = 20 * 1024 * 1024
```

## interface: `AssetRef` — `src/types/domain.ts:10-19` (sim -0.338)
```ts
export interface AssetRef {
  /** Normalised POSIX relative path, lowercased — the lookup key. */
  readonly path: string
  /** The path exactly as it appeared in the drop, for display and diagnostics. */
  readonly originalPath: string
  /** Object URL, valid for the lifetime of the session. */
  readonly url: string
  readonly mime: string
  readonly bytes: number
}
```

## interface: `MarkdownDoc` — `src/types/domain.ts:52-69` (sim -0.340)
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

## function: `renderPdf` — `server/pdf.ts:134-198` (sim -0.343)
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

## const: `here` — `server/index.ts:22-22` (sim -0.364)
```ts
const here = dirname(fileURLToPath(import.meta.url))
```

## function: `classes` — `src/pipeline/sanitize.ts:77-80` (sim -0.368)
```ts
const classes = (...allowed: (string | RegExp)[]): PropertyDefinition => [
  'className',
  ...allowed,
]
```

## function: `walkFileList` — `src/ingest/walker.ts:136-148` (sim -0.369)
```ts
export function walkFileList(files: FileList, opts: WalkOptions): WalkedFile[] {
  const out: WalkedFile[] = []
  for (const file of Array.from(files)) {
    if (out.length >= opts.maxFiles) break
    // webkitRelativePath is populated for directory pickers, empty otherwise.
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath
    const path = rel && rel.length > 0 ? rel : file.name
    if (path.split('/').some(isIgnoredName)) continue
    out.push({ path, file })
    opts.onProgress?.(out.length)
  }
  return out
}
```

## function: `buildAssetMap` — `src/ingest/assets.ts:73-100` (sim -0.390)
```ts
export function buildAssetMap(
  files: readonly { path: string; file: File }[],
): Map<string, AssetRef> {
  const map = new Map<string, AssetRef>()

  for (const { path, file } of files) {
    if (!isImagePath(path)) continue
    const key = normaliseAssetPath(path)
    if (map.has(key)) continue // first wins; a duplicate key is a collision, not an update

    // The blob is retyped from the file extension rather than trusting
    // `file.type`. A File produced by a directory drop often carries an empty
    // type, and an untyped blob becomes `data:text/plain` when the exporter
    // reads it back - which no browser will render as an image.
    const mime = mimeFor(path, file.type)
    const typed = file.type === mime ? file : new Blob([file], { type: mime })

    map.set(key, {
      path: key,
      originalPath: path,
      url: URL.createObjectURL(typed),
      mime,
      bytes: file.size,
    })
  }

  return map
}
```

## type: `PropertyDefinition` — `src/pipeline/sanitize.ts:9-11` (sim -0.419)
```ts
type PropertyDefinition = NonNullable<
  NonNullable<SanitizeSchema['attributes']>[string]
>[number]
```

## function: `inheritedExcept` — `src/pipeline/sanitize.ts:65-69` (sim -0.433)
```ts
const inheritedExcept = (tag: string, drop: readonly string[]): PropertyDefinition[] =>
  inherited(tag).filter((def) => {
    const name = typeof def === 'string' ? def : def[0]
    return !drop.includes(name)
  })
```

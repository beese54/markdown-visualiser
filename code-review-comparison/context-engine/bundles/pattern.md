# Selective context bundle — pattern agent

Retrieved 30 of 199 chunks (29,039 of 118,192 chars — 75.4% reduction vs full context)

## function: `RepairNotice` — `src/reader/RepairNotice.tsx:22-86` (cos 0.385)
```ts
export function RepairNotice({ repairs }: { readonly repairs: readonly RepairNote[] }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  const byRule = new Map<RepairRule, RepairNote[]>()
  for (const note of repairs) {
    const list = byRule.get(note.rule) ?? []
    list.push(note)
    byRule.set(note.rule, list)
  }

  return (
    <aside className="repairs">
      <button
        type="button"
        className="repairs-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="repairs-count">{repairs.length}</span>
        <span>
          {repairs.length === 1 ? 'formatting fix applied' : 'formatting fixes applied'}
        </span>
        <span className="repairs-chevron" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>

      <div id={panelId} className="repairs-panel" hidden={!open}>
        <p className="repairs-lede">
          The source file was not changed. These adjustments were made only for
          this rendering.
        </p>

        {[...byRule].map(([rule, notes]) => (
          <section key={rule} className="repairs-group">
            <h2 className="repairs-group-title">
              {RULE_LABELS[rule]}
              <span className="repairs-group-count">{notes.length}</span>
            </h2>
            <ul className="repairs-list">
              {notes.slice(0, 8).map((note, i) => (
                <li key={`${rule}-${i}`}>
                  <span className="repairs-line">
                    {note.line === null ? '—' : `line ${note.line}`}
                  </span>
                  <span className="repairs-change">
                    <code>{note.before}</code>
                    <span aria-hidden="true"> → </span>
                    <code>{note.after}</code>
                  </span>
                  <span className="repairs-detail">{note.detail}</span>
                </li>
              ))}
              {notes.length > 8 && (
                <li className="repairs-more">and {notes.length - 8} more</li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  )
}
```

## function: `withTimeout` — `src/reader/Mermaid.tsx:103-117` (cos 0.381)
```ts
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
```

## function: `closeBrowser` — `server/pdf.ts:65-72` (cos 0.378)
```ts
export async function closeBrowser(): Promise<void> {
  const pending = browserPromise
  browserPromise = null
  if (pending) {
    const browser = await pending.catch(() => null)
    await browser?.close().catch(() => undefined)
  }
}
```

## function: `withDeadline` — `server/pdf.ts:200-214` (cos 0.369)
```ts
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RenderTimeoutError()), ms)
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
```

## function: `useRenderedDoc` — `src/state/render.ts:75-146` (cos 0.369)
```ts
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
```

## function: `renderPdf` — `server/pdf.ts:134-198` (cos 0.368)
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

## function: `ProgressRail` — `src/reader/ProgressRail.tsx:13-62` (cos 0.354)
```ts
export function ProgressRail({
  scrollHost,
}: {
  readonly scrollHost: RefObject<HTMLElement | null>
}) {
  const [progress, setProgress] = useState(0)
  const frame = useRef(0)

  useEffect(() => {
    const host = scrollHost.current
    if (!host) return

    const measure = () => {
      const scrollable = host.scrollHeight - host.clientHeight
      // A document shorter than the viewport is fully read by definition.
      setProgress(scrollable <= 0 ? 1 : Math.min(1, host.scrollTop / scrollable))
    }

    // Scroll fires far more often than a frame can paint, so the read of
    // layout properties is coalesced into one per frame. Reading scrollTop
    // synchronously on every event is what makes naive scroll handlers janky.
    const onScroll = () => {
      if (frame.current !== 0) return
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        measure()
      })
    }

    measure()
    host.addEventListener('scroll', onScroll, { passive: true })

    const observer = new ResizeObserver(measure)
    observer.observe(host)

    return () => {
      host.removeEventListener('scroll', onScroll)
      observer.disconnect()
      if (frame.current !== 0) cancelAnimationFrame(frame.current)
    }
  }, [scrollHost])

  return (
    <div className="rail" aria-hidden="true">
      <div className="rail-base" />
      <div className="rail-fill" style={{ transform: `scaleY(${progress})` }} />
      <div className="rail-thumb" style={{ top: `${progress * 100}%` }} />
    </div>
  )
}
```

## function: `useMermaid` — `src/reader/Mermaid.tsx:184-209` (cos 0.353)
```ts
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
```

## function: `cancelIdleCallbackShim` — `src/state/render.ts:166-173` (cos 0.352)
```ts
function cancelIdleCallbackShim(handle: IdleHandle): void {
  const w = window as Window & { cancelIdleCallback?: (id: number) => void }
  if (handle.kind === 'idle' && typeof w.cancelIdleCallback === 'function') {
    w.cancelIdleCallback(handle.id)
  } else if (handle.kind === 'timeout') {
    window.clearTimeout(handle.id)
  }
}
```

## function: `harden` — `server/pdf.ts:120-132` (cos 0.335)
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

## const: `Prose` — `src/reader/Prose.tsx:16-31` (cos 0.328)
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

## function: `toDataUri` — `src/export/standalone.ts:14-28` (cos 0.325)
```ts
async function toDataUri(url: string): Promise<string | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
```

## function: `readAllEntries` — `src/ingest/walker.ts:40-57` (cos 0.324)
```ts
function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = []

    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all)
          return
        }
        all.push(...batch)
        readBatch()
      }, reject)
    }

    readBatch()
  })
}
```

## function: `launch` — `server/pdf.ts:38-52` (cos 0.322)
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

## function: `render` — `src/state/render.ts:39-62` (cos 0.321)
```ts
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
```

## const: `sanitizeSchema` — `src/pipeline/sanitize.ts:82-160` (cos 0.318)
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

## const: `useReader` — `src/state/store.ts:28-95` (cos 0.315)
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

## function: `cachedOrPending` — `src/state/render.ts:148-151` (cos 0.307)
```ts
function cachedOrPending(set: DocumentSet, doc: MarkdownDoc): RenderState {
  const cached = getCached(set, doc.id)
  return cached ? { kind: 'ready', result: cached } : { kind: 'pending' }
}
```

## function: `renderDocument` — `src/pipeline/render.ts:138-207` (cos 0.302)
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

## function: `loadMermaid` — `src/reader/Mermaid.tsx:32-76` (cos 0.302)
```ts
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
```

## function: `remarkRepair` — `src/pipeline/plugins/remark-repair.ts:270-280` (cos 0.296)
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

## function: `getBrowser` — `server/pdf.ts:54-63` (cos 0.291)
```ts
export function getBrowser(): Promise<Browser> {
  browserPromise ??= launch().then((browser) => {
    // A crashed browser must not be handed out again.
    browser.on('disconnected', () => {
      browserPromise = null
    })
    return browser
  })
  return browserPromise
}
```

## interface: `RepairResult` — `src/pipeline/plugins/remark-repair.ts:23-25` (cos 0.287)
```ts
export interface RepairResult {
  readonly notes: RepairNote[]
}
```

## function: `useActiveHeading` — `src/reader/IndexSidebar.tsx:151-202` (cos 0.286)
```ts
function useActiveHeading(headings: readonly Heading[]): string | null {
  const [active, setActive] = useState<string | null>(null)
  const visible = useRef(new Set<string>())

  useEffect(() => {
    const flat = flatten(headings)
    if (flat.length === 0) {
      setActive(null)
      return
    }

    visible.current.clear()
    const order = new Map(flat.map((h, i) => [h.id, i]))

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id
          if (entry.isIntersecting) visible.current.add(id)
          else visible.current.delete(id)
        }

        // The topmost visible heading in document order is the current one.
        let best: string | null = null
        let bestIndex = Number.POSITIVE_INFINITY
        for (const id of visible.current) {
          const index = order.get(id) ?? Number.POSITIVE_INFINITY
          if (index < bestIndex) {
            bestIndex = index
            best = id
          }
        }

        // Nothing intersecting means the reader is mid-section, between two
        // headings: keep the last one rather than clearing the highlight.
        if (best !== null) setActive(best)
      },
      { rootMargin: '-25% 0px -65% 0px', threshold: 0 },
    )

    const targets = flat
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null)

    for (const el of targets) observer.observe(el)
    setActive(flat[0]?.id ?? null)

    return () => observer.disconnect()
  }, [headings])

  return active
}
```

## function: `requestIdleCallbackShim` — `src/state/render.ts:156-164` (cos 0.286)
```ts
function requestIdleCallbackShim(fn: () => void): IdleHandle {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  }
  if (typeof w.requestIdleCallback === 'function') {
    return { kind: 'idle', id: w.requestIdleCallback(fn, { timeout: 2000 }) }
  }
  return { kind: 'timeout', id: window.setTimeout(fn, 300) }
}
```

## class: `IngestError` — `src/types/domain.ts:121-133` (cos 0.283)
```ts
export class IngestError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'too-large'
      | 'too-many-files'
      | 'no-markdown'
      | 'read-failed',
  ) {
    super(message)
    this.name = 'IngestError'
  }
}
```

## interface: `Heading` — `src/types/domain.ts:21-28` (cos 0.283)
```ts
export interface Heading {
  /** Slug, unique within its document. */
  readonly id: string
  /** 1..6, after the repair pass has normalised the hierarchy. */
  readonly depth: number
  readonly text: string
  readonly children: Heading[]
}
```

## function: `collectLanguages` — `src/pipeline/plugins/rehype-shiki.ts:65-76` (cos 0.276)
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

## interface: `BuildOptions` — `src/ingest/docset.ts:120-122` (cos 0.271)
```ts
export interface BuildOptions {
  readonly rootName: string
}
```

## interface: `RepairNote` — `src/types/domain.ts:44-50` (cos 0.268)
```ts
export interface RepairNote {
  readonly rule: RepairRule
  readonly line: number | null
  readonly before: string
  readonly after: string
  readonly detail: string
}
```

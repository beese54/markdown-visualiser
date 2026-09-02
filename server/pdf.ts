import { chromium, type Browser, type BrowserContext } from 'playwright-core'
import pLimit from 'p-limit'
import { cpus } from 'node:os'

/**
 * The print service.
 *
 * This endpoint renders client-supplied HTML in a real browser, which is a
 * well-known SSRF and resource-exhaustion vector - it is the only meaningful
 * attack surface in the whole application. Every control below exists for a
 * named threat, and they are layered so that no single one is load-bearing:
 *
 *  - JavaScript disabled          -> kills script-driven fetch, exfiltration
 *                                    and infinite loops outright.
 *  - default-deny request routing -> kills the vectors that need no JavaScript
 *                                    at all: <img>, <link>, CSS @import and
 *                                    url(), reaching internal services, the
 *                                    cloud metadata endpoint, or file://.
 *  - fresh context per request    -> no cookie, storage or service-worker
 *                                    state carries between untrusted docs.
 *  - concurrency limit            -> a browser page is expensive; unbounded
 *                                    requests would be a trivial DoS.
 *  - timeouts at every level      -> a document that never settles cannot
 *                                    hold a page open indefinitely.
 *
 * The client is expected to inline every asset before posting, so blocking
 * all network access costs nothing legitimate.
 */

const RENDER_DEADLINE_MS = 30_000
const SETCONTENT_TIMEOUT_MS = 20_000
/** page.pdf() takes no timeout of its own, so it is bounded by the page default. */
const PAGE_DEFAULT_TIMEOUT_MS = 20_000

/** Chromium itself is expensive to launch, so one instance is shared. */
let browserPromise: Promise<Browser> | null = null

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

export async function closeBrowser(): Promise<void> {
  const pending = browserPromise
  browserPromise = null
  if (pending) {
    const browser = await pending.catch(() => null)
    await browser?.close().catch(() => undefined)
  }
}

export async function browserHealthy(): Promise<boolean> {
  if (browserPromise === null) return false
  try {
    const browser = await browserPromise
    return browser.isConnected()
  } catch {
    return false
  }
}

/**
 * One render at a time per core. Chromium pages are heavy, and the point is
 * to return 429 rather than to fall over.
 */
const limit = pLimit(Math.max(1, Math.min(4, cpus().length)))

export const queueDepth = (): { active: number; pending: number } => ({
  active: limit.activeCount,
  pending: limit.pendingCount,
})

/** Rejected when the queue is already saturated. */
export class BusyError extends Error {
  constructor() {
    super('The print service is busy.')
    this.name = 'BusyError'
  }
}

export class RenderTimeoutError extends Error {
  constructor() {
    super('Rendering took too long.')
    this.name = 'RenderTimeoutError'
  }
}

export interface PdfRequest {
  readonly html: string
  readonly format?: 'A4' | 'Letter'
  readonly landscape?: boolean
  readonly title?: string
}

/** Only these two schemes may load. Everything else is aborted. */
const ALLOWED_SCHEMES = /^(?:data:|blob:|about:)/i

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

/** Escaped, because the title comes from a document the caller supplied. */
const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const HEAD_FOOT_STYLE =
  'font-family:Georgia,serif;font-size:8pt;color:#777;width:100%;padding:0 22mm;'

const headerTemplate = (title: string): string =>
  `<div style="${HEAD_FOOT_STYLE}display:flex;justify-content:space-between;">
     <span>${escapeHtml(title).slice(0, 120)}</span>
   </div>`

const FOOTER_TEMPLATE =
  `<div style="${HEAD_FOOT_STYLE}text-align:center;">` +
  '<span class="pageNumber"></span> / <span class="totalPages"></span>' +
  '</div>'

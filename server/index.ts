import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'

import {
  BusyError,
  RenderTimeoutError,
  browserHealthy,
  closeBrowser,
  queueDepth,
  renderPdf,
} from './pdf.ts'

const PORT = Number(process.env.PORT ?? 8080)
const HOST = process.env.HOST ?? '0.0.0.0'

/** Mirrors LIMITS.pdfBodyLimitBytes in src/types/domain.ts. */
const PDF_BODY_LIMIT = 20 * 1024 * 1024

const here = dirname(fileURLToPath(import.meta.url))
const staticRoot = process.env.STATIC_ROOT ?? join(here, '..', 'dist')

const app = Fastify({
  // Explicit, not the 1MiB default: an export carries every image inlined as
  // a data URI. Unbounded is not an option - a print request is the one place
  // a caller controls how much memory we allocate.
  bodyLimit: PDF_BODY_LIMIT,
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  trustProxy: false,
})

await app.register(fastifyStatic, {
  root: staticRoot,
  index: ['index.html'],
  setHeaders(res, path) {
    if (path.endsWith('index.html')) {
      res.setHeader('cache-control', 'no-cache')
    } else if (/\.[0-9a-f]{8,}\./i.test(path)) {
      res.setHeader('cache-control', 'public, max-age=31536000, immutable')
    }
  },
})

app.addHook('onSend', async (_req, reply, payload) => {
  reply.header('x-content-type-options', 'nosniff')
  reply.header('referrer-policy', 'no-referrer')
  reply.header('cross-origin-opener-policy', 'same-origin')
  return payload
})

app.get('/healthz', async () => ({
  status: 'ok' as const,
  browser: (await browserHealthy()) ? ('up' as const) : ('idle' as const),
  queue: queueDepth(),
  uptime: Math.round(process.uptime()),
}))

interface PdfBody {
  html?: unknown
  title?: unknown
  format?: unknown
  landscape?: unknown
}

app.post('/api/export/pdf', async (request, reply) => {
  const body = request.body as PdfBody | undefined

  if (!body || typeof body.html !== 'string' || body.html.trim() === '') {
    return reply.code(400).send({ error: 'Expected a JSON body with an "html" string.' })
  }

  const format = body.format === 'Letter' ? 'Letter' : 'A4'
  const title = typeof body.title === 'string' ? body.title : 'Documents'

  try {
    const pdf = await renderPdf({
      html: body.html,
      format,
      landscape: body.landscape === true,
      title,
    })

    return reply
      .code(200)
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="${asciiFilename(title)}.pdf"`)
      .header('content-length', String(pdf.byteLength))
      .send(pdf)
  } catch (err) {
    if (err instanceof BusyError) {
      return reply.code(429).header('retry-after', '5').send({ error: err.message })
    }
    if (err instanceof RenderTimeoutError) {
      return reply.code(504).send({
        error:
          'Rendering took too long. Export the self-contained HTML instead, ' +
          'or print it from your browser.',
      })
    }
    // Log the detail, return none: an error string from a headless browser can
    // disclose paths and internals.
    request.log.error({ err }, 'pdf render failed')
    return reply.code(503).send({ error: 'The print service is unavailable.' })
  }
})

/** Content-Disposition must not carry non-ASCII or quotes. */
const asciiFilename = (value: string): string => {
  const cleaned = value.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
  return cleaned === '' ? 'documents' : cleaned
}

// SPA fallback for client routes; must not swallow API 404s.
app.setNotFoundHandler((req, reply) => {
  if (req.url.startsWith('/api/')) {
    return reply.code(404).send({ error: 'Not found' })
  }
  return reply.sendFile('index.html')
})

const close = async (signal: string) => {
  app.log.info({ signal }, 'shutting down')
  await app.close()
  await closeBrowser()
  process.exit(0)
}
process.on('SIGTERM', () => void close('SIGTERM'))
process.on('SIGINT', () => void close('SIGINT'))

try {
  await app.listen({ port: PORT, host: HOST })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

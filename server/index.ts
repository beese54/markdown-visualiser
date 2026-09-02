import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'

const PORT = Number(process.env.PORT ?? 8080)
const HOST = process.env.HOST ?? '0.0.0.0'

/** Mirrors LIMITS.pdfBodyLimitBytes in src/types/domain.ts. */
const PDF_BODY_LIMIT = 20 * 1024 * 1024

const here = dirname(fileURLToPath(import.meta.url))
const staticRoot = process.env.STATIC_ROOT ?? join(here, '..', 'dist')

const app = Fastify({
  // Explicit, not the 1MiB default: an export carries every image inlined as
  // a data URI. Unbounded is not an option - see the L4 security gate.
  bodyLimit: PDF_BODY_LIMIT,
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  trustProxy: false,
})

// Static SPA. The reader is client-rendered; the server has no view layer.
await app.register(fastifyStatic, {
  root: staticRoot,
  index: ['index.html'],
  // Hashed assets are immutable; index.html must never be cached or a
  // redeploy leaves clients on a stale bundle.
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
  // Wired to the real Playwright pool at L4.3.
  browser: 'down' as const,
  uptime: Math.round(process.uptime()),
}))

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

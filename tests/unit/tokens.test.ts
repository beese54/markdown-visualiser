import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { LIMITS, MARKDOWN_EXTENSIONS, IMAGE_EXTENSIONS } from '@/types/domain'

// Vitest runs with the project root as cwd. import.meta.url is not reliable
// here because the jsdom environment does not populate it.
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

describe('design tokens', () => {
  const css = read('src/styles/tokens.css')

  it('defines every token the stylesheets consume', () => {
    const required = [
      '--shell-900', '--shell-ink', '--paper', '--paper-hi', '--paper-lo',
      '--paper-edge', '--ink', '--ink-strong', '--ink-muted', '--ink-faint',
      '--oxblood', '--gold', '--font-display', '--font-body', '--font-mono',
      '--measure', '--measure-wide', '--leading-body', '--shadow-sheet',
      '--note', '--tip', '--important', '--warning', '--caution',
    ]
    for (const token of required) {
      expect(css, `missing token ${token}`).toContain(`${token}:`)
    }
  })

  it('has no malformed hex colour values', () => {
    // Guards against stray non-ASCII glyphs corrupting a colour, which
    // fails silently in CSS rather than throwing.
    const hexes = css.match(/#[0-9a-zA-Z]+/g) ?? []
    expect(hexes.length).toBeGreaterThan(10)
    for (const hex of hexes) {
      expect(hex, `malformed colour ${hex}`).toMatch(/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)
    }
  })

  it('collapses all motion under prefers-reduced-motion', () => {
    expect(css).toContain('prefers-reduced-motion: reduce')
    const block = css.slice(css.indexOf('prefers-reduced-motion'))
    for (const d of ['--dur-fast', '--dur-base', '--dur-slow', '--dur-reveal']) {
      expect(block, `${d} not zeroed under reduced motion`).toContain(`${d}: 0ms`)
    }
  })

  it('keeps the reading measure at the long-form sweet spot', () => {
    expect(css).toMatch(/--measure:\s*6[4-8]ch/)
  })
})

describe('fonts', () => {
  const css = read('src/styles/fonts.css')

  it('self-hosts every family via @fontsource', () => {
    for (const family of ['fraunces', 'newsreader', 'ibm-plex-mono']) {
      expect(css).toContain(`@fontsource/${family}`)
    }
  })

  it('never references a third-party font host', () => {
    expect(css).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
    expect(css).not.toMatch(/^\s*@import\s+url\(['"]?https?:/m)
  })
})

describe('domain constants', () => {
  it('matches the limits declared in specification.json', () => {
    const spec = JSON.parse(read('specification.json')) as {
      limits: Record<string, number>
    }
    expect(LIMITS.maxTotalBytes).toBe(spec.limits.maxTotalBytes)
    expect(LIMITS.maxFiles).toBe(spec.limits.maxFiles)
    expect(LIMITS.maxSingleFileBytes).toBe(spec.limits.maxSingleFileBytes)
    expect(LIMITS.pdfBodyLimitBytes).toBe(spec.limits.pdfBodyLimitBytes)
    expect(LIMITS.pdfRenderDeadlineMs).toBe(spec.limits.pdfRenderDeadlineMs)
  })

  it('lists extensions in lowercase, dot-prefixed form', () => {
    for (const ext of [...MARKDOWN_EXTENSIONS, ...IMAGE_EXTENSIONS]) {
      expect(ext).toMatch(/^\.[a-z0-9]+$/)
    }
  })
})

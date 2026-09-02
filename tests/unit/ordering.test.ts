import { describe, it, expect } from 'vitest'

import {
  computeSortKey,
  naturalKey,
  numericPrefix,
  prettifyFilename,
  sortByReadingOrder,
  stem,
} from '@/ingest/ordering'

const order = (entries: readonly { path: string; order?: number }[]): string[] =>
  sortByReadingOrder(
    entries.map((e) => ({
      path: e.path,
      sortKey: computeSortKey({ path: e.path, order: e.order ?? null }),
    })),
  ).map((d) => d.path)

describe('numericPrefix', () => {
  it('reads the common prefix conventions', () => {
    expect(numericPrefix('01-intro.md')).toBe(1)
    expect(numericPrefix('2_setup.md')).toBe(2)
    expect(numericPrefix('003.overview.md')).toBe(3)
    expect(numericPrefix('10 deploy.md')).toBe(10)
  })

  it('does not treat a number that is part of the name as a prefix', () => {
    expect(numericPrefix('2024report.md')).toBeNull()
    expect(numericPrefix('intro.md')).toBeNull()
    expect(numericPrefix('h2o.md')).toBeNull()
  })
})

describe('naturalKey', () => {
  it('sorts file2 before file10, which lexicographic compare gets wrong', () => {
    expect('file2' < 'file10').toBe(false)
    expect(naturalKey('file2') < naturalKey('file10')).toBe(true)
  })
})

describe('reading order', () => {
  it('rule 1: explicit frontmatter order wins', () => {
    expect(
      order([
        { path: 'zebra.md', order: 1 },
        { path: 'alpha.md', order: 2 },
      ]),
    ).toEqual(['zebra.md', 'alpha.md'])
  })

  it('rule 2: numeric filename prefixes, numerically not lexically', () => {
    expect(
      order([
        { path: '10-deploy.md' },
        { path: '2-setup.md' },
        { path: '1-intro.md' },
      ]),
    ).toEqual(['1-intro.md', '2-setup.md', '10-deploy.md'])
  })

  it('rule 3: conventional index names open their directory', () => {
    expect(
      order([{ path: 'apples.md' }, { path: 'README.md' }, { path: 'bananas.md' }]),
    ).toEqual(['README.md', 'apples.md', 'bananas.md'])
  })

  it('rule 4: root files precede nested ones, and nested stay grouped', () => {
    expect(
      order([
        { path: 'guide/b.md' },
        { path: 'top.md' },
        { path: 'appendix/a.md' },
        { path: 'guide/a.md' },
      ]),
    ).toEqual(['top.md', 'appendix/a.md', 'guide/a.md', 'guide/b.md'])
  })

  it('rule 5: natural alphabetical is the final tiebreak', () => {
    expect(order([{ path: 'Beta.md' }, { path: 'alpha.md' }])).toEqual([
      'alpha.md',
      'Beta.md',
    ])
  })

  it('ranks explicit order above a numeric prefix', () => {
    expect(
      order([
        { path: '01-first.md' },
        { path: '99-last.md', order: 1 },
      ]),
    ).toEqual(['99-last.md', '01-first.md'])
  })

  it('sorts documents without an explicit order after those with one', () => {
    expect(
      order([{ path: 'unordered.md' }, { path: 'ordered.md', order: 5 }]),
    ).toEqual(['ordered.md', 'unordered.md'])
  })

  it('is stable and total across a realistic mixed set', () => {
    const result = order([
      { path: 'guide/03-advanced.md' },
      { path: 'README.md' },
      { path: 'guide/README.md' },
      { path: 'guide/01-basics.md' },
      { path: 'CHANGELOG.md' },
      { path: 'guide/02-intermediate.md' },
      { path: 'reference/api.md' },
    ])
    expect(result).toEqual([
      'README.md',
      'CHANGELOG.md',
      'guide/README.md',
      'guide/01-basics.md',
      'guide/02-intermediate.md',
      'guide/03-advanced.md',
      'reference/api.md',
    ])
  })

  it('produces identical output regardless of input order', () => {
    const paths = [
      { path: 'b/2.md' }, { path: 'a.md' }, { path: 'b/10.md' },
      { path: 'b/1.md' }, { path: 'c.md' },
    ]
    const forward = order(paths)
    const backward = order([...paths].reverse())
    expect(forward).toEqual(backward)
  })
})

describe('helpers', () => {
  it('stem strips the extension', () => {
    expect(stem('01-Intro.MD')).toBe('01-intro')
    expect(stem('no-extension')).toBe('no-extension')
  })

  it('prettifyFilename produces a human title', () => {
    expect(prettifyFilename('02-getting-started.md')).toBe('Getting Started')
    expect(prettifyFilename('api_reference.md')).toBe('Api Reference')
    expect(prettifyFilename('README.md')).toBe('Readme')
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

import { buildDocumentSet } from '@/ingest/docset'
import { stripCommonRoot } from '@/ingest/walker'
import { makeLinkResolver } from '@/ingest/links'
import { lookupAsset } from '@/ingest/assets'
import type { WalkedFile } from '@/ingest/walker'

/**
 * Exercises ingest against the real fixture tree on disk, rather than against
 * hand-built File objects. This is the closest thing to the browser path that
 * a node test can reach, and it is what catches ordering or resolution bugs
 * that only appear with genuine directory structure.
 */

const FIXTURE_ROOT = resolve(process.cwd(), 'tests/fixtures/handbook')

function loadTree(dir: string, base = dir): WalkedFile[] {
  const out: WalkedFile[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...loadTree(full, base))
    } else {
      const path = relative(base, full).split(sep).join('/')
      out.push({ path: `handbook/${path}`, file: new File([readFileSync(full)], name) })
    }
  }
  return out
}

describe('ingest against the real fixture tree', () => {
  const walked = loadTree(FIXTURE_ROOT)

  it('finds every fixture file', () => {
    expect(walked).toHaveLength(8)
  })

  it('strips the shared root folder', () => {
    const { rootName, files } = stripCommonRoot(walked)
    expect(rootName).toBe('handbook')
    expect(files.every((f) => !f.path.startsWith('handbook/'))).toBe(true)
  })

  it('builds a set in the expected reading order', async () => {
    const { rootName, files } = stripCommonRoot(walked)
    const set = await buildDocumentSet(files, { rootName })

    expect(set.docs.map((d) => d.path)).toEqual([
      'readme.md',
      '99-messy.md',
      'guide/readme.md',
      'guide/01-basics.md',
      'guide/02-advanced.md',
      'reference/api.md',
    ])
  })

  it('titles documents from frontmatter, then headings', async () => {
    const { rootName, files } = stripCommonRoot(walked)
    const set = await buildDocumentSet(files, { rootName })
    const titles = new Map(set.docs.map((d) => [d.path, d.title]))

    expect(titles.get('readme.md')).toBe('The Handbook')
    expect(titles.get('guide/01-basics.md')).toBe('Basics')
    expect(titles.get('reference/api.md')).toBe('API Reference')
  })

  it('registers the image and skips the text file', async () => {
    const { rootName, files } = stripCommonRoot(walked)
    const set = await buildDocumentSet(files, { rootName })

    expect(set.assets.has('guide/img/flow.png')).toBe(true)
    expect(set.skipped.map((s) => s.path)).toEqual(['notes.txt'])
  })

  it('resolves every cross-link in the fixtures to a real document', async () => {
    const { rootName, files } = stripCommonRoot(walked)
    const set = await buildDocumentSet(files, { rootName })
    const resolveIn = makeLinkResolver(set)

    const readme = set.docs.find((d) => d.path === 'readme.md')!
    expect(resolveIn('./guide/01-basics.md', readme)).toMatchObject({ kind: 'internal' })
    expect(resolveIn('reference/api.md', readme)).toMatchObject({ kind: 'internal' })

    const basics = set.docs.find((d) => d.path === 'guide/01-basics.md')!
    const back = resolveIn('../README.md', basics)
    expect(back).toMatchObject({ kind: 'internal' })
    if (back.kind === 'internal') expect(back.docId).toBe(readme.id)
  })

  it('resolves the relative image reference from the document that uses it', async () => {
    const { rootName, files } = stripCommonRoot(walked)
    const set = await buildDocumentSet(files, { rootName })

    const advanced = set.docs.find((d) => d.path === 'guide/02-advanced.md')!
    expect(lookupAsset(set.assets, advanced.path, './img/flow.png')?.path).toBe(
      'guide/img/flow.png',
    )
  })

  it('carries the messy document through intact for the repair pass', async () => {
    const { rootName, files } = stripCommonRoot(walked)
    const set = await buildDocumentSet(files, { rootName })

    const messy = set.docs.find((d) => d.path === '99-messy.md')!
    expect(messy.error).toBeNull()
    expect(messy.raw).toContain('##### Jumped from h1')
    expect(messy.raw).toContain('# A second h1')
  })
})

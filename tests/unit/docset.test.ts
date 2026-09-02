import { describe, it, expect } from 'vitest'

import { LIMITS, IngestError } from '@/types/domain'
import {
  assertWithinLimits,
  buildDocumentSet,
  extractFrontmatter,
  firstHeading,
  formatBytes,
  hashPath,
} from '@/ingest/docset'
import {
  lookupAsset,
  normaliseAssetPath,
  resolveRelative,
  isImagePath,
} from '@/ingest/assets'
import { buildDocIndex, resolveLink } from '@/ingest/links'
import type { WalkedFile } from '@/ingest/walker'

const mk = (path: string, content = '# Hi\n', size?: number): WalkedFile => {
  const file = new File([content], path.split('/').pop() ?? path)
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size })
  return { path, file }
}

describe('frontmatter', () => {
  it('parses a YAML block and strips it from the body', () => {
    const { data, body } = extractFrontmatter('---\ntitle: Setup\norder: 3\n---\n# Heading\n')
    expect(data).toEqual({ title: 'Setup', order: 3 })
    expect(body.trim()).toBe('# Heading')
  })

  it('leaves malformed YAML in place rather than failing the document', () => {
    const raw = '---\ntitle: [unclosed\n---\n# Body\n'
    const { data, body } = extractFrontmatter(raw)
    expect(data).toEqual({})
    expect(body).toBe(raw)
  })

  it('ignores a document with no frontmatter', () => {
    const raw = '# Just a heading\n'
    expect(extractFrontmatter(raw)).toEqual({ data: {}, body: raw })
  })

  it('does not treat a horizontal rule as frontmatter', () => {
    const raw = 'Some text\n\n---\n\nMore text\n'
    expect(extractFrontmatter(raw).data).toEqual({})
  })
})

describe('firstHeading', () => {
  it('finds ATX and setext H1s', () => {
    expect(firstHeading('# Title\nbody')).toBe('Title')
    expect(firstHeading('Title\n=====\nbody')).toBe('Title')
    expect(firstHeading('## Only H2\n')).toBeNull()
  })
})

describe('limits', () => {
  it('rejects too many files, naming the actual count (DoD 1.5)', () => {
    const files = Array.from({ length: LIMITS.maxFiles + 1 }, (_, i) => mk(`f${i}.md`))
    expect(() => assertWithinLimits(files)).toThrowError(IngestError)
    try {
      assertWithinLimits(files)
    } catch (e) {
      expect((e as IngestError).code).toBe('too-many-files')
      expect((e as Error).message).toContain((LIMITS.maxFiles + 1).toLocaleString())
    }
  })

  it('rejects an oversized drop, naming the actual size', () => {
    const files = [mk('big.md', 'x', LIMITS.maxTotalBytes + 1)]
    try {
      assertWithinLimits(files)
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as IngestError).code).toBe('too-large')
      expect((e as Error).message).toContain('200 MB')
    }
  })

  it('formats byte counts readably', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(20 * 1024 * 1024)).toBe('20 MB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('buildDocumentSet', () => {
  it('orders documents, registers assets, and records skips', async () => {
    const set = await buildDocumentSet(
      [
        mk('02-setup.md', '# Setup\n'),
        mk('01-intro.md', '---\ntitle: Introduction\n---\n# Intro\n'),
        mk('img/logo.png', 'binary'),
        mk('notes.txt', 'ignored'),
      ],
      { rootName: 'handbook' },
    )

    expect(set.docs.map((d) => d.path)).toEqual(['01-intro.md', '02-setup.md'])
    expect(set.docs[0]?.title).toBe('Introduction')
    expect(set.docs[1]?.title).toBe('Setup')
    expect(set.assets.has('img/logo.png')).toBe(true)
    expect(set.skipped).toEqual([{ path: 'notes.txt', reason: 'not a markdown or image file' }])
    expect(set.rootName).toBe('handbook')
  })

  it('falls back through title sources in the right order', async () => {
    const set = await buildDocumentSet(
      [
        mk('a.md', '---\ntitle: From Frontmatter\n---\n# From Heading\n'),
        mk('b.md', '# From Heading\n'),
        mk('03-from-filename.md', 'no heading at all\n'),
      ],
      { rootName: 'r' },
    )
    const byPath = new Map(set.docs.map((d) => [d.path, d.title]))
    expect(byPath.get('a.md')).toBe('From Frontmatter')
    expect(byPath.get('b.md')).toBe('From Heading')
    expect(byPath.get('03-from-filename.md')).toBe('From Filename')
  })

  it('skips an oversized single file but keeps the set (DoD 1.6)', async () => {
    const set = await buildDocumentSet(
      [mk('ok.md'), mk('huge.md', 'x', LIMITS.maxSingleFileBytes + 1)],
      { rootName: 'r' },
    )
    expect(set.docs.map((d) => d.path)).toEqual(['ok.md'])
    expect(set.skipped[0]?.path).toBe('huge.md')
    expect(set.skipped[0]?.reason).toContain('single-file limit')
  })

  it('throws a named error when the drop has no markdown', async () => {
    await expect(
      buildDocumentSet([mk('a.png', 'x'), mk('b.txt', 'x')], { rootName: 'r' }),
    ).rejects.toMatchObject({ code: 'no-markdown' })
  })

  it('produces stable ids across rebuilds of the same path', () => {
    expect(hashPath('guide/setup.md')).toBe(hashPath('guide/setup.md'))
    expect(hashPath('guide/setup.md')).not.toBe(hashPath('guide/other.md'))
  })
})

describe('asset paths', () => {
  it('normalises the ways authors write the same path', () => {
    expect(normaliseAssetPath('./IMG/Logo.PNG')).toBe('img/logo.png')
    expect(normaliseAssetPath('img\\logo.png')).toBe('img/logo.png')
    expect(normaliseAssetPath('/img//logo.png')).toBe('img/logo.png')
  })

  it('resolves relative paths against the containing document', () => {
    expect(resolveRelative('guide/setup.md', './img/a.png')).toBe('guide/img/a.png')
    expect(resolveRelative('guide/setup.md', '../shared/b.png')).toBe('shared/b.png')
    expect(resolveRelative('a/b/c.md', '../../top.png')).toBe('top.png')
    expect(resolveRelative('guide/setup.md', 'https://x.test/i.png')).toBe('https://x.test/i.png')
  })

  it('recognises image extensions', () => {
    expect(isImagePath('a/b.PNG')).toBe(true)
    expect(isImagePath('a/b.svg')).toBe(true)
    expect(isImagePath('a/b.md')).toBe(false)
  })

  it('falls back to a unique basename match, but refuses an ambiguous one', async () => {
    const set = await buildDocumentSet(
      [mk('doc.md'), mk('assets/unique.png', 'x'), mk('a/dup.png', 'x'), mk('b/dup.png', 'x')],
      { rootName: 'r' },
    )
    const doc = set.docs[0]!
    // Stale path, unique basename -> resolved.
    expect(lookupAsset(set.assets, doc.path, './old/unique.png')?.path).toBe('assets/unique.png')
    // Ambiguous basename -> refuse rather than show the wrong image.
    expect(lookupAsset(set.assets, doc.path, './nowhere/dup.png')).toBeNull()
  })
})

describe('inter-document links (DoD 1.3)', () => {
  const docs = [
    { id: 'a1', path: 'readme.md', dir: '', filename: 'readme.md' },
    { id: 'b2', path: 'guide/setup.md', dir: 'guide', filename: 'setup.md' },
    { id: 'c3', path: 'guide/readme.md', dir: 'guide', filename: 'readme.md' },
  ] as unknown as Parameters<typeof buildDocIndex>[0]

  const index = buildDocIndex(docs)
  const from = docs[0]!
  const fromGuide = docs[1]!

  it('resolves a relative markdown link to a document id', () => {
    expect(resolveLink('./guide/setup.md', from, index)).toEqual({
      kind: 'internal', docId: 'b2', hash: null,
    })
  })

  it('resolves a parent-relative link', () => {
    expect(resolveLink('../readme.md', fromGuide, index)).toEqual({
      kind: 'internal', docId: 'a1', hash: null,
    })
  })

  it('preserves the fragment', () => {
    expect(resolveLink('./guide/setup.md#install', from, index)).toEqual({
      kind: 'internal', docId: 'b2', hash: 'install',
    })
  })

  it('resolves an extensionless link', () => {
    expect(resolveLink('./guide/setup', from, index)).toMatchObject({ docId: 'b2' })
  })

  it('resolves a directory link to that directory index file', () => {
    expect(resolveLink('./guide/', from, index)).toMatchObject({ docId: 'c3' })
  })

  it('classifies same-page anchors', () => {
    expect(resolveLink('#section', from, index)).toEqual({ kind: 'anchor', hash: 'section' })
  })

  it('leaves absolute URLs external', () => {
    expect(resolveLink('https://example.test/x', from, index)).toEqual({
      kind: 'external', href: 'https://example.test/x',
    })
    expect(resolveLink('mailto:a@b.test', from, index)).toMatchObject({ kind: 'external' })
  })

  it('marks a broken cross-reference as missing, not external', () => {
    expect(resolveLink('./gone.md', from, index)).toEqual({
      kind: 'missing', href: './gone.md',
    })
  })
})

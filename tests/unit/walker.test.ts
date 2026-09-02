import { describe, it, expect } from 'vitest'

import { walkDataTransfer, walkFileList, stripCommonRoot } from '@/ingest/walker'

/**
 * Fake FileSystemEntry tree.
 *
 * The important part is `BATCH`: the fake directory reader hands back at most
 * 100 entries per `readEntries` call, exactly as Chromium does. A walker that
 * calls `readEntries` once instead of draining it in a loop will silently
 * lose everything past the first batch, and these tests are what catch that.
 */
const BATCH = 100

interface FakeNode {
  name: string
  children?: FakeNode[]
  size?: number
}

function makeEntry(node: FakeNode): FileSystemEntry {
  if (node.children) {
    let cursor = 0
    const children = node.children
    const reader = {
      readEntries(ok: (e: FileSystemEntry[]) => void) {
        const slice = children.slice(cursor, cursor + BATCH)
        cursor += slice.length
        // Chromium is asynchronous here; keeping that shape means a walker
        // that assumes synchronous completion fails the test too.
        setTimeout(() => ok(slice.map(makeEntry)), 0)
      },
    }
    return {
      name: node.name,
      isFile: false,
      isDirectory: true,
      createReader: () => reader,
    } as unknown as FileSystemEntry
  }

  return {
    name: node.name,
    isFile: true,
    isDirectory: false,
    file(ok: (f: File) => void) {
      setTimeout(() => ok(new File(['x'.repeat(node.size ?? 1)], node.name)), 0)
    },
  } as unknown as FileSystemEntry
}

function makeDataTransfer(roots: FakeNode[]): DataTransfer {
  return {
    items: roots.map((node) => ({
      kind: 'file' as const,
      webkitGetAsEntry: () => makeEntry(node),
      getAsFile: () => null,
    })),
  } as unknown as DataTransfer
}

const opts = { maxFiles: 5000 }

describe('directory walker', () => {
  it('drains readEntries across batches — 250 files, none lost (DoD 1.2)', async () => {
    const children = Array.from({ length: 250 }, (_, i) => ({
      name: `doc-${String(i).padStart(3, '0')}.md`,
    }))
    const files = await walkDataTransfer(makeDataTransfer([{ name: 'big', children }]), opts)

    expect(files).toHaveLength(250)
    // A single readEntries call would have returned exactly BATCH entries.
    expect(files.length).toBeGreaterThan(BATCH)
    const names = new Set(files.map((f) => f.path))
    expect(names.size).toBe(250)
    expect(names.has('big/doc-000.md')).toBe(true)
    expect(names.has('big/doc-249.md')).toBe(true)
  })

  it('recurses into nested directories and builds POSIX relative paths', async () => {
    const files = await walkDataTransfer(
      makeDataTransfer([
        {
          name: 'handbook',
          children: [
            { name: 'README.md' },
            { name: 'guide', children: [{ name: 'setup.md' }, { name: 'img', children: [{ name: 'a.png' }] }] },
          ],
        },
      ]),
      opts,
    )

    expect(files.map((f) => f.path).sort()).toEqual([
      'handbook/README.md',
      'handbook/guide/img/a.png',
      'handbook/guide/setup.md',
    ])
  })

  it('skips build and VCS directories', async () => {
    const files = await walkDataTransfer(
      makeDataTransfer([
        {
          name: 'proj',
          children: [
            { name: 'ok.md' },
            { name: '.git', children: [{ name: 'HEAD' }] },
            { name: 'node_modules', children: [{ name: 'pkg.md' }] },
            { name: '.DS_Store' },
          ],
        },
      ]),
      opts,
    )
    expect(files.map((f) => f.path)).toEqual(['proj/ok.md'])
  })

  it('honours maxFiles without hanging', async () => {
    const children = Array.from({ length: 400 }, (_, i) => ({ name: `f${i}.md` }))
    const files = await walkDataTransfer(
      makeDataTransfer([{ name: 'r', children }]),
      { maxFiles: 150 },
    )
    expect(files).toHaveLength(150)
  })

  it('survives a file that refuses to be read', async () => {
    const bad = {
      name: 'locked.md',
      isFile: true,
      isDirectory: false,
      file: (_ok: unknown, fail: (e: Error) => void) =>
        setTimeout(() => fail(new Error('permission denied')), 0),
    } as unknown as FileSystemEntry

    const dt = {
      items: [
        {
          kind: 'file' as const,
          webkitGetAsEntry: () =>
            ({
              name: 'r',
              isFile: false,
              isDirectory: true,
              createReader: () => {
                let done = false
                return {
                  readEntries(ok: (e: FileSystemEntry[]) => void) {
                    const out = done ? [] : [bad, makeEntry({ name: 'good.md' })]
                    done = true
                    setTimeout(() => ok(out), 0)
                  },
                }
              },
            }) as unknown as FileSystemEntry,
          getAsFile: () => null,
        },
      ],
    } as unknown as DataTransfer

    const files = await walkDataTransfer(dt, opts)
    expect(files.map((f) => f.path)).toEqual(['r/good.md'])
  })

  it('falls back to flat files when the entry API is unavailable', async () => {
    const dt = {
      items: [
        {
          kind: 'file' as const,
          webkitGetAsEntry: () => null,
          getAsFile: () => new File(['# hi'], 'loose.md'),
        },
      ],
    } as unknown as DataTransfer

    const files = await walkDataTransfer(dt, opts)
    expect(files.map((f) => f.path)).toEqual(['loose.md'])
  })
})

describe('walkFileList', () => {
  it('uses webkitRelativePath when a directory picker supplies it', () => {
    const withPath = (name: string, rel: string) => {
      const f = new File(['x'], name)
      Object.defineProperty(f, 'webkitRelativePath', { value: rel })
      return f
    }
    const list = [
      withPath('a.md', 'book/a.md'),
      withPath('b.md', 'book/sub/b.md'),
    ] as unknown as FileList
    Object.defineProperty(list, 'length', { value: 2 })

    expect(walkFileList(list, opts).map((f) => f.path)).toEqual([
      'book/a.md',
      'book/sub/b.md',
    ])
  })
})

describe('stripCommonRoot', () => {
  const f = (path: string) => ({ path, file: new File(['x'], 'x') })

  it('strips a single shared root folder', () => {
    const { rootName, files } = stripCommonRoot([f('book/a.md'), f('book/sub/b.md')])
    expect(rootName).toBe('book')
    expect(files.map((x) => x.path)).toEqual(['a.md', 'sub/b.md'])
  })

  it('keeps paths intact when roots differ', () => {
    const { rootName, files } = stripCommonRoot([f('one/a.md'), f('two/b.md')])
    expect(rootName).toBe('Documents')
    expect(files.map((x) => x.path)).toEqual(['one/a.md', 'two/b.md'])
  })

  it('handles loose files at the top level', () => {
    const { rootName, files } = stripCommonRoot([f('a.md'), f('b.md')])
    expect(rootName).toBe('Documents')
    expect(files.map((x) => x.path)).toEqual(['a.md', 'b.md'])
  })

  it('returns an empty set unchanged', () => {
    expect(stripCommonRoot([])).toEqual({ rootName: 'Documents', files: [] })
  })
})

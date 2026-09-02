/**
 * End-to-end drive of the real app in Chromium.
 *
 * Runs inside the runtime container, where Chromium and playwright-core
 * already live, and drives the actual served bundle rather than a test
 * harness. Fixtures are injected as a synthetic DataTransfer whose items
 * expose `webkitGetAsEntry`, which is the exact shape a real folder drop
 * hands the app - so this exercises the production walker, not a stub.
 *
 * Covers the ingest layer specifically: the walker, reading order, directory
 * grouping, title resolution and skip reporting, all observed through the
 * index the reader builds from them.
 *
 * Usage:  node drive.mjs <baseUrl> <fixtureJsonPath>
 */

import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'

const [baseUrl = 'http://127.0.0.1:8080', fixturePath] = process.argv.slice(2)
if (!fixturePath) {
  console.error('usage: node drive.mjs <baseUrl> <fixtureJsonPath>')
  process.exit(2)
}

/** @type {{path: string, content: string}[]} */
const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8'))

const results = []
const record = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const browser = await chromium.launch({
  args: [
    '--disable-dev-shm-usage',
    // Chromium silently upgrades http:// to https:// for non-localhost
    // hosts, which fails against a plain-HTTP container on a bridge network.
    '--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable',
  ],
})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => consoleErrors.push(String(e)))

try {
  await page.goto(baseUrl, { waitUntil: 'load', timeout: 20000 })

  // ---- Empty state ----------------------------------------------------
  const title = await page.textContent('.dz-title')
  record('empty state renders the drop plate', title?.includes('Drop a folder') === true, title ?? 'no title')

  const plateBg = await page.evaluate(() => {
    const el = document.querySelector('.dz-plate')
    return el ? getComputedStyle(el).backgroundImage : ''
  })
  record(
    'paper sheet carries its gradient (tokens resolved)',
    plateBg.includes('gradient'),
    plateBg.slice(0, 60),
  )

  const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
  record('body font resolves to Newsreader', /Newsreader/i.test(bodyFont), bodyFont)

  // Fonts must come from this origin only.
  const fontHosts = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((r) => new URL(r.name).host)
      .filter((h) => h !== location.host),
  )
  record('no third-party requests', fontHosts.length === 0, fontHosts.join(', ') || 'none')

  // ---- Synthetic folder drop -------------------------------------------
  await page.evaluate((files) => {
    // Build a FileSystemEntry tree from flat paths, mirroring what Chromium
    // hands us for a real directory drop.
    const root = { name: 'handbook', dir: true, children: new Map() }
  // Binary fixtures arrive base64-encoded; text arrives as-is.
  const bodyOf = (node) =>
    node.base64 === undefined
      ? node.content
      : Uint8Array.from(atob(node.base64), (c) => c.charCodeAt(0))

    for (const f of files) {
      const parts = f.path.split('/')
      let node = root
      for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i]
        if (!node.children.has(seg)) {
          node.children.set(seg, { name: seg, dir: true, children: new Map() })
        }
        node = node.children.get(seg)
      }
      const leaf = parts[parts.length - 1]
      node.children.set(leaf, { name: leaf, dir: false, content: f.content })
    }

    const BATCH = 100
    const toEntry = (node) => {
      if (!node.dir) {
        return {
          name: node.name,
          isFile: true,
          isDirectory: false,
          file: (ok) => ok(new File([bodyOf(node)], node.name)),
        }
      }
      const kids = [...node.children.values()]
      let cursor = 0
      return {
        name: node.name,
        isFile: false,
        isDirectory: true,
        createReader: () => ({
          readEntries: (ok) => {
            const slice = kids.slice(cursor, cursor + BATCH)
            cursor += slice.length
            setTimeout(() => ok(slice.map(toEntry)), 0)
          },
        }),
      }
    }

    const dt = {
      types: ['Files'],
      items: [{ kind: 'file', webkitGetAsEntry: () => toEntry(root), getAsFile: () => null }],
      files: [],
    }

    const ev = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(ev, 'dataTransfer', { value: dt })
    window.dispatchEvent(ev)
  }, fixtures)

  await page.waitForSelector('.reader-bar', { timeout: 15000 })

  // ---- Ingest results ---------------------------------------------------
  const position = await page.textContent('.reader-position')
  record('the reader reports the set size', /\d+\s*\/\s*6/.test(position ?? ''), position ?? '')

  const rootName = await page.textContent('.reader-mark')
  record('common root folder was stripped and named', rootName === 'handbook', rootName ?? '')

  // The index is the ingest layer's visible output: order, grouping, titles.
  const contents = await page.$$eval('.index-doc-title', (els) => els.map((e) => e.textContent))
  // Reading order: root files first, then each directory grouped together,
  // with index files opening their own folder.
  const expected = [
    'The Handbook',
    'Broken On Purpose',
    'Guide',
    'Basics',
    'Advanced',
    'API Reference',
  ]
  record(
    'documents appear in the expected reading order',
    JSON.stringify(contents) === JSON.stringify(expected),
    JSON.stringify(contents),
  )

  record(
    'titles come from frontmatter, then headings, then filename',
    contents[0] === 'The Handbook' && contents.includes('API Reference'),
    JSON.stringify(contents),
  )

  const dirs = await page.$$eval('.index-dir', (els) => els.map((e) => e.textContent))
  record('nested directories are grouped', dirs.includes('guide') && dirs.includes('reference'),
    JSON.stringify(dirs))

  await page.click('.index-skipped summary')
  const skipped = await page.$$eval('.index-skipped code', (els) => els.map((e) => e.textContent))
  record('non-markdown file is reported as skipped', skipped.includes('notes.txt'), JSON.stringify(skipped))

  // ---- Navigation + responsiveness -------------------------------------
  await page.click('.index-doc >> nth=3')
  const current = await page.getAttribute('.index-doc >> nth=3', 'aria-current')
  record('clicking a document marks it current', current === 'page', String(current))

  for (const width of [360, 768, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
    record(`no horizontal overflow at ${width}px`, !overflow)
  }

  record('no console errors during the drive', consoleErrors.length === 0, consoleErrors.join(' | '))
} catch (err) {
  record('drive completed without throwing', false, String(err))
} finally {
  await context.close()
  await browser.close()
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)

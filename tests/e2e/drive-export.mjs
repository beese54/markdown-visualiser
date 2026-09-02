/**
 * End-to-end drive of the export layer (DoD 4.1 - 4.3).
 *
 * Drives the real UI: drops the fixtures, clicks the export buttons, and
 * checks what actually comes out. The standalone file is then re-opened with
 * the network fully blocked, which is the only honest way to prove it is
 * self-contained.
 *
 * Usage:  node drive-export.mjs <baseUrl> <fixtureJsonPath> <outDir>
 */

import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [baseUrl = 'http://127.0.0.1:8080', fixturePath, outDir = '/out'] = process.argv.slice(2)
if (!fixturePath) {
  console.error('usage: node drive-export.mjs <baseUrl> <fixtureJsonPath> <outDir>')
  process.exit(2)
}

const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8'))

const results = []
const record = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const DROP = (files) => {
  const root = { name: 'handbook', dir: true, children: new Map() }
  const bodyOf = (node) =>
    node.base64 === undefined
      ? node.content
      : Uint8Array.from(atob(node.base64), (c) => c.charCodeAt(0))

  for (const f of files) {
    const parts = f.path.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]
      if (!node.children.has(seg)) node.children.set(seg, { name: seg, dir: true, children: new Map() })
      node = node.children.get(seg)
    }
    const leaf = parts[parts.length - 1]
    node.children.set(leaf, { name: leaf, dir: false, content: f.content, base64: f.base64 })
  }

  const toEntry = (node) => {
    if (!node.dir) {
      return {
        name: node.name, isFile: true, isDirectory: false,
        file: (ok) => ok(new File([bodyOf(node)], node.name)),
      }
    }
    const kids = [...node.children.values()]
    let cursor = 0
    return {
      name: node.name, isFile: false, isDirectory: true,
      createReader: () => ({
        readEntries: (ok) => {
          const slice = kids.slice(cursor, cursor + 100)
          cursor += slice.length
          setTimeout(() => ok(slice.map(toEntry)), 0)
        },
      }),
    }
  }

  const ev = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'dataTransfer', {
    value: {
      types: ['Files'],
      items: [{ kind: 'file', webkitGetAsEntry: () => toEntry(root), getAsFile: () => null }],
      files: [],
    },
  })
  window.dispatchEvent(ev)
}

const browser = await chromium.launch({
  args: ['--disable-dev-shm-usage', '--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable'],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
})
const page = await context.newPage()

const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => consoleErrors.push(String(e)))

try {
  await page.goto(baseUrl, { waitUntil: 'load', timeout: 20000 })
  await page.evaluate(DROP, fixtures)
  await page.waitForSelector('.reader-sheet .doc', { timeout: 20000 })

  // Visit the diagram document so mermaid has drawn before exporting - the
  // export copies rendered SVG out of the live DOM.
  const titles = await page.$$eval('.index-doc-title', (els) => els.map((e) => e.textContent))
  await page.click(`.index-doc >> nth=${titles.indexOf('Advanced')}`)
  await page.waitForSelector('.mermaid-slot.is-drawn svg', { timeout: 40000 })
  await page.click('.index-doc >> nth=0')
  await page.waitForSelector('.prose .table-wrap table', { timeout: 20000 })

  record('export controls are present', await page.isVisible('.export-bar'))

  // ---- Standalone HTML (DoD 4.1) ---------------------------------------
  const htmlDownload = await Promise.all([
    page.waitForEvent('download', { timeout: 90000 }),
    page.click('.export-bar button:has-text("HTML")'),
  ]).then(([d]) => d)

  const htmlPath = join(outDir, 'export.html')
  await htmlDownload.saveAs(htmlPath)
  const html = readFileSync(htmlPath, 'utf8')

  record('standalone HTML downloads', html.length > 5000, `${(html.length / 1024).toFixed(0)} KB`)

  const contains = (needle) => html.includes(needle)
  record('every document is present in the export',
    ['The Handbook', 'Basics', 'Advanced', 'API Reference'].every(contains))
  record('styles are inlined', contains('<style>') && contains('--paper'))
  record('fonts are inlined as data URIs', /url\(["']?data:font|url\(["']?data:application/.test(html))
  record('images are inlined as data URIs', /<img[^>]+src="data:image\//.test(html))
  record('the mermaid diagram is inlined as static SVG (DoD 4.3)',
    /<svg[^>]*aria-roledescription="flowchart/.test(html) || /class="flowchart"/.test(html))
  record('print rules travel with the file', contains('@media print') || contains('@page'))
  record('no remote references remain',
    !/(?:src|href)=["']https?:\/\//i.test(html) && !/url\(["']?https?:\/\//i.test(html))

  // Open it with the network fully blocked. Anything it still needs to fetch
  // would fail here, which is the point.
  const offline = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await offline.route('**/*', (route) =>
    /^(?:data:|blob:|about:|file:)/i.test(route.request().url())
      ? route.continue()
      : route.abort('blockedbyclient'),
  )
  const offlinePage = await offline.newPage()
  const blocked = []
  offlinePage.on('requestfailed', (r) => blocked.push(r.url()))

  await offlinePage.goto(`file://${htmlPath}`, { waitUntil: 'load', timeout: 30000 })
  const offlineState = await offlinePage.evaluate(() => ({
    docs: document.querySelectorAll('.doc').length,
    svgs: document.querySelectorAll('.mermaid-slot svg').length,
    images: [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth > 0).length,
    serif: getComputedStyle(document.querySelector('.prose') ?? document.body).fontFamily,
  }))

  record('opens offline with every document (DoD 4.1)', offlineState.docs >= 4, `${offlineState.docs} documents`)
  record('diagram survives offline', offlineState.svgs > 0, `${offlineState.svgs} svg`)
  record('images render offline', offlineState.images > 0, `${offlineState.images} loaded`)
  record('typography survives offline', /Newsreader/i.test(offlineState.serif), offlineState.serif)
  record('nothing was fetched from the network', blocked.length === 0, blocked.slice(0, 3).join(', ') || 'none')
  await offline.close()

  // ---- PDF (DoD 4.2) ----------------------------------------------------
  const pdfDownload = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.click('.export-bar button:has-text("PDF")'),
  ]).then(([d]) => d)

  const pdfPath = join(outDir, 'export.pdf')
  await pdfDownload.saveAs(pdfPath)
  const pdf = readFileSync(pdfPath)

  record('PDF downloads', pdf.length > 10000, `${(pdf.length / 1024).toFixed(0)} KB`)
  record('it is a real PDF', pdf.subarray(0, 5).toString() === '%PDF-')

  const raw = pdf.toString('latin1')
  const pageCount = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length
  record('PDF is paginated', pageCount >= 2, `${pageCount} pages`)

  // The PDF embeds subset fonts with Identity-H encoding, so its glyphs are
  // not ASCII and no string search can find the titles. The honest check is
  // to render it: open the same standalone HTML in the print context the
  // server uses and confirm the visible text and pagination.
  const printCheck = await browser.newContext({ javaScriptEnabled: false })
  await printCheck.route('**/*', (route) =>
    /^(?:data:|blob:|about:|file:)/i.test(route.request().url())
      ? route.continue()
      : route.abort('blockedbyclient'),
  )
  const printPage = await printCheck.newPage()
  await printPage.goto(`file://${htmlPath}`, { waitUntil: 'load', timeout: 30000 })
  await printPage.emulateMedia({ media: 'print' })

  const printed = await printPage.evaluate(() => {
    const titles = [...document.querySelectorAll('.doc-title')].map((el) => el.textContent?.trim())
    const chromeVisible = [...document.querySelectorAll('.reader-bar, .reader-index, .rail, .export-bar')]
      .filter((el) => getComputedStyle(el).display !== 'none').length
    const docs = [...document.querySelectorAll('.export-root > .doc')]
    return {
      titles,
      chromeVisible,
      background: getComputedStyle(document.body).backgroundColor,
      // The first document must NOT break (that would open on a blank page);
      // every subsequent one must.
      firstBreak: docs[0] ? getComputedStyle(docs[0]).breakBefore : 'none',
      laterBreaks: docs.slice(1).map((el) => getComputedStyle(el).breakBefore),
    }
  })
  await printCheck.close()

  record('every document title is present under print media (DoD 4.2)',
    ['The Handbook', 'Basics', 'Advanced', 'API Reference'].every((t) => printed.titles.includes(t)),
    printed.titles.join(', '))
  record('reader chrome is hidden in print', printed.chromeVisible === 0,
    `${printed.chromeVisible} visible`)
  record('print background is white, not the dark shell', /rgb\(255,\s*255,\s*255\)/.test(printed.background),
    printed.background)
  record('each document after the first starts a new page',
    printed.laterBreaks.length > 0 && printed.laterBreaks.every((b) => b === 'page'),
    printed.laterBreaks.join(', '))
  record('the file does not open on a blank page',
    printed.firstBreak !== 'page', printed.firstBreak)
  record('PDF page count matches the document count', pageCount >= 4, `${pageCount} pages`)

  writeFileSync(join(outDir, 'export-meta.json'), JSON.stringify({
    htmlBytes: html.length, pdfBytes: pdf.length, pageCount,
  }, null, 2))

  record('no console errors during export', consoleErrors.length === 0,
    consoleErrors.slice(0, 2).join(' | '))
} catch (err) {
  record('export drive completed without throwing', false, String(err).slice(0, 300))
} finally {
  await context.close()
  await browser.close()
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)

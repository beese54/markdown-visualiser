/** Capture screenshots of the reader for visual review. */
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'

const [baseUrl, fixturePath, outDir = '/out'] = process.argv.slice(2)
const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8'))

const DROP = (files) => {
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
      const s = parts[i]
      if (!node.children.has(s)) node.children.set(s, { name: s, dir: true, children: new Map() })
      node = node.children.get(s)
    }
    const leaf = parts[parts.length - 1]
    node.children.set(leaf, { name: leaf, dir: false, content: f.content, base64: f.base64 })
  }
  const toEntry = (n) => {
    if (!n.dir) return { name: n.name, isFile: true, isDirectory: false, file: (ok) => ok(new File([bodyOf(n)], n.name)) }
    const kids = [...n.children.values()]
    let c = 0
    return {
      name: n.name, isFile: false, isDirectory: true,
      createReader: () => ({ readEntries: (ok) => { const sl = kids.slice(c, c + 100); c += sl.length; setTimeout(() => ok(sl.map(toEntry)), 0) } }),
    }
  }
  const ev = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'dataTransfer', {
    value: { types: ['Files'], items: [{ kind: 'file', webkitGetAsEntry: () => toEntry(root), getAsFile: () => null }], files: [] },
  })
  window.dispatchEvent(ev)
}

const browser = await chromium.launch({ args: ['--disable-dev-shm-usage', '--disable-features=HttpsUpgrades'] })
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })).newPage()

await page.goto(baseUrl, { waitUntil: 'load' })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${outDir}/01-dropzone.png` })

await page.evaluate(DROP, fixtures)
await page.waitForSelector('.reader-sheet .doc', { timeout: 20000 })
await page.waitForSelector('.prose .table-wrap table', { timeout: 20000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: `${outDir}/02-reader.png` })

// Basics: math + highlighted code
const titles = await page.$$eval('.index-doc-title', (e) => e.map((x) => x.textContent))
await page.click(`.index-doc >> nth=${titles.indexOf('Basics')}`)
await page.waitForSelector('.prose .katex', { timeout: 20000 })
await page.waitForTimeout(800)
await page.screenshot({ path: `${outDir}/03-code-math.png` })

// Advanced: mermaid
await page.click(`.index-doc >> nth=${titles.indexOf('Advanced')}`)
await page.waitForSelector('.mermaid-slot.is-drawn svg', { timeout: 40000 })
await page.waitForTimeout(800)
await page.screenshot({ path: `${outDir}/04-diagram.png` })

// Repairs panel open
await page.click(`.index-doc >> nth=${titles.indexOf('Broken On Purpose')}`)
await page.waitForSelector('.repairs', { timeout: 20000 })
await page.click('.repairs-toggle')
await page.waitForTimeout(600)
await page.screenshot({ path: `${outDir}/05-repairs.png` })

// Narrow
await page.setViewportSize({ width: 420, height: 900 })
await page.click(`.index-doc >> nth=0`).catch(() => {})
await page.waitForTimeout(800)
await page.screenshot({ path: `${outDir}/06-narrow.png` })

console.log('screenshots written')
await browser.close()

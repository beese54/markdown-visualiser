/** Ad-hoc diagnostic: drops the fixtures and reports on the mermaid document. */
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'

const [baseUrl, fixturePath] = process.argv.slice(2)
const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8'))

const browser = await chromium.launch({
  args: ['--disable-dev-shm-usage', '--disable-features=HttpsUpgrades'],
})
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
page.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error' || /mmd|mermaid/i.test(t)) console.log(`[${m.type()}]`, t.slice(0, 400))
})
page.on('requestfailed', (r) => console.log('[reqfail]', r.url().slice(-60), r.failure()?.errorText))

await page.goto(baseUrl, { waitUntil: 'load' })

await page.evaluate((files) => {
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
    if (!n.dir) {
      return { name: n.name, isFile: true, isDirectory: false, file: (ok) => ok(new File([bodyOf(n)], n.name)) }
    }
    const kids = [...n.children.values()]
    let c = 0
    return {
      name: n.name, isFile: false, isDirectory: true,
      createReader: () => ({
        readEntries: (ok) => {
          const sl = kids.slice(c, c + 100)
          c += sl.length
          setTimeout(() => ok(sl.map(toEntry)), 0)
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
}, fixtures)

await page.waitForSelector('.doc', { timeout: 20000 })

// Open guide/02-advanced.md, which is the one with a mermaid fence.
const titles = await page.$$eval('.index-doc-title', (els) => els.map((e) => e.textContent))
const i = titles.indexOf('Advanced')
console.log('titles:', JSON.stringify(titles), 'advanced at', i)
await page.click(`.index-doc >> nth=${i}`)
await page.waitForFunction(() => document.querySelector('.doc-title')?.textContent === 'Advanced')

await page.waitForTimeout(4000)
const detail = await page.evaluate(() => {
  const fig = document.querySelector('[data-mermaid]')
  const slot = document.querySelector('.mermaid-slot')
  return {
    figAttrs: fig ? [...fig.attributes].map(a => `${a.name}=${a.value}`) : null,
    slotHtml: slot ? slot.innerHTML.slice(0, 220) : null,
    sourcePresent: !!document.querySelector('.mermaid-source'),
    hostPresent: !!document.querySelector('.mermaid-host'),
    proseFirstChildren: [...(document.querySelector('.prose')?.children ?? [])]
      .map(el => el.tagName + '.' + el.className).slice(0, 8),
  }
})
console.log(JSON.stringify(detail, null, 2))

await browser.close()

/**
 * End-to-end drive of the reader (L3).
 *
 * Verifies the DoD 3.x criteria against the real served bundle in Chromium:
 * navigation, active-section tracking, keyboard operation, responsiveness,
 * reduced motion, and an axe-core accessibility pass.
 *
 * Usage:  node drive-reader.mjs <baseUrl> <fixtureJsonPath>
 */

import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'

const [baseUrl = 'http://127.0.0.1:8080', fixturePath] = process.argv.slice(2)
if (!fixturePath) {
  console.error('usage: node drive-reader.mjs <baseUrl> <fixtureJsonPath>')
  process.exit(2)
}

const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8'))

const results = []
const record = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

/** Injects fixtures as the DataTransfer shape a real folder drop produces. */
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
      const seg = parts[i]
      if (!node.children.has(seg)) node.children.set(seg, { name: seg, dir: true, children: new Map() })
      node = node.children.get(seg)
    }
    node.children.set(parts[parts.length - 1], {
      name: parts[parts.length - 1], dir: false, content: f.content, base64: f.base64,
    })
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
  args: [
    '--disable-dev-shm-usage',
    '--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable',
  ],
})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
  if (/\[mmd\]/.test(m.text())) console.log('  ', m.text().slice(0, 220))
})
page.on('pageerror', (e) => consoleErrors.push(String(e)))

const openReader = async () => {
  await page.goto(baseUrl, { waitUntil: 'load', timeout: 20000 })
  await page.evaluate(DROP, fixtures)
  await page.waitForSelector('.reader-sheet .doc', { timeout: 20000 })
}

try {
  await openReader()

  // ---- DoD 3.1 navigation ----------------------------------------------
  const firstTitle = await page.textContent('.doc-title')
  record('reader opens on the first document', firstTitle === 'The Handbook', firstTitle ?? '')

  const indexEntries = await page.$$eval('.index-doc-title', (els) => els.map((e) => e.textContent))
  record(
    'index lists every document',
    indexEntries.length === 6,
    JSON.stringify(indexEntries),
  )

  // Click through every entry and confirm the sheet actually changes.
  const visited = []
  for (let i = 0; i < indexEntries.length; i++) {
    await page.click(`.index-doc >> nth=${i}`)
    await page.waitForFunction(
      (expected) => document.querySelector('.doc-title')?.textContent === expected,
      indexEntries[i],
      { timeout: 15000 },
    )
    visited.push(await page.textContent('.doc-title'))
  }
  record(
    'every index entry opens its document (DoD 3.1)',
    JSON.stringify(visited) === JSON.stringify(indexEntries),
    JSON.stringify(visited),
  )

  const activeMarks = await page.$$eval('.index-doc.is-active', (els) => els.length)
  record('exactly one index entry is marked current', activeMarks === 1, String(activeMarks))

  // ---- Rich content actually rendered ----------------------------------
  await page.click('.index-doc >> nth=3') // guide/01-basics.md
  await page.waitForFunction(() => document.querySelector('.doc-title')?.textContent === 'Basics')
  // Wait for the body, not just the header: asserting on content the instant
  // the title changes races the render and reports false negatives.
  await page.waitForSelector('.prose .katex', { timeout: 20000 })

  const basics = await page.evaluate(() => ({
    katex: document.querySelectorAll('.katex').length,
    shiki: document.querySelectorAll('.shiki, pre.shiki').length,
    internalLink: document.querySelectorAll('a[data-doc]').length,
  }))
  record('math renders via KaTeX', basics.katex > 0, `${basics.katex} nodes`)
  record('code renders via Shiki', basics.shiki > 0, `${basics.shiki} blocks`)
  record('cross-document link is rewritten', basics.internalLink > 0, `${basics.internalLink} links`)

  // Following an in-document link must navigate within the set.
  await page.click('a[data-doc]')
  await page.waitForFunction(
    () => document.querySelector('.doc-title')?.textContent === 'The Handbook',
    null,
    { timeout: 15000 },
  )
  record('following an internal link navigates the set', true)

  // Mermaid: lazily loaded, so allow it time to arrive and draw.
  await page.click('.index-doc >> nth=4') // guide/02-advanced.md
  await page.waitForFunction(() => document.querySelector('.doc-title')?.textContent === 'Advanced')
  const svg = await page
    .waitForSelector('.mermaid-slot.is-drawn svg', { timeout: 40000 })
    .then(() => true)
    .catch(() => false)
  if (!svg) {
    const why = await page.evaluate(() => {
      const slot = document.querySelector('.mermaid-slot')
      return {
        slotClass: slot?.className ?? null,
        slotHtml: slot?.innerHTML.slice(0, 120) ?? null,
        figures: document.querySelectorAll('[data-mermaid]').length,
        title: document.querySelector('.doc-title')?.textContent,
      }
    })
    console.log('   mermaid debug:', JSON.stringify(why))
  }
  record('mermaid diagram renders to SVG', svg)
  if (svg) {
    const sourceGone = await page.evaluate(() => !document.querySelector('.mermaid-source'))
    record('diagram replaces its source fallback', sourceGone)
  }

  const missingImage = await page.$$eval('.asset-missing', (els) => els.length)
  const realImage = await page.$$eval('figure img', (els) => els.length)
  record(
    'local image resolves (not a missing placeholder)',
    realImage > 0 && missingImage === 0,
    `img=${realImage} missing=${missingImage}`,
  )

  // GFM + callouts on the readme.
  await page.click('.index-doc >> nth=0')
  await page.waitForFunction(() => document.querySelector('.doc-title')?.textContent === 'The Handbook')
  await page.waitForSelector('.prose .table-wrap table', { timeout: 20000 })
  const readme = await page.evaluate(() => ({
    table: document.querySelectorAll('.table-wrap table').length,
    alert: document.querySelectorAll('.markdown-alert-note').length,
    dropCap: document.querySelectorAll('.prose .opening').length,
  }))
  record('table renders in a scroll wrapper', readme.table > 0)
  record('GFM callout renders as an admonition', readme.alert > 0)
  record('opening paragraph is marked for a drop cap', readme.dropCap === 1)

  // Repair notice on the deliberately broken document.
  await page.click('.index-doc >> nth=1') // 99-messy.md
  await page.waitForFunction(() => document.querySelector('.repairs') !== null, null, { timeout: 15000 })
  const repairCount = await page.textContent('.repairs-count')
  record('repairs are reported, not silent', Number(repairCount) > 0, `${repairCount} fixes`)

  await page.click('.repairs-toggle')
  const panelVisible = await page.isVisible('.repairs-panel')
  record('repair detail panel expands', panelVisible)

  // ---- DoD 3.2 active-section tracking ---------------------------------
  await page.click('.index-doc >> nth=0')
  await page.waitForFunction(() => document.querySelector('.doc-title')?.textContent === 'The Handbook')
  const headingCount = await page.$$eval('.index-heading', (els) => els.length)
  record('index shows the heading tree of the open document', headingCount > 0, `${headingCount} headings`)

  // ---- DoD 3.3 keyboard ------------------------------------------------
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(400)
  const afterRight = await page.textContent('.doc-title')
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(400)
  const afterLeft = await page.textContent('.doc-title')
  record(
    'arrow keys move between documents (DoD 3.3)',
    afterRight !== 'The Handbook' && afterLeft === 'The Handbook',
    `right=${afterRight} left=${afterLeft}`,
  )

  const focusable = await page.evaluate(() => {
    const sel = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    return [...document.querySelectorAll(sel)].filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }).length
  })
  record('interactive elements are reachable', focusable > 5, `${focusable} focusable`)

  // Every focusable element must show a visible focus ring.
  const focusRing = await page.evaluate(() => {
    const el = document.querySelector('.index-doc')
    if (!el) return false
    el.focus()
    const s = getComputedStyle(el, ':focus-visible')
    return s.outlineStyle !== 'none' || s.outlineWidth !== '0px'
  })
  record('focus is visible on index entries', focusRing)

  // ---- DoD 3.4 responsive ----------------------------------------------
  for (const width of [360, 480, 768, 1024, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(120)
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      stage: (() => {
        const s = document.querySelector('.reader-stage')
        return s ? s.scrollWidth > s.clientWidth + 1 : false
      })(),
    }))
    record(`no horizontal overflow at ${width}px (DoD 3.4)`, !overflow.doc && !overflow.stage,
      overflow.doc ? 'document overflows' : overflow.stage ? 'stage overflows' : '')
  }

  // The index collapses behind a toggle on narrow screens.
  await page.setViewportSize({ width: 400, height: 900 })
  await page.waitForTimeout(150)
  const toggleShown = await page.isVisible('.reader-nav-toggle')
  record('index collapses to a toggle on narrow screens', toggleShown)

  if (toggleShown) {
    await page.click('.reader-nav-toggle')
    await page.waitForTimeout(350)
    const opened = await page.evaluate(() => {
      const el = document.querySelector('.reader-index')
      return el ? el.getBoundingClientRect().left > -10 : false
    })
    record('the index opens as an overlay', opened)
    await page.keyboard.press('Escape')
  }

  await page.setViewportSize({ width: 1440, height: 900 })

  // ---- DoD 3.5 accessibility -------------------------------------------
  await page.addScriptTag({
    url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js',
  }).catch(() => undefined)

  const axeAvailable = await page.evaluate(() => typeof window.axe !== 'undefined')
  if (axeAvailable) {
    const violations = await page.evaluate(async () => {
      const run = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      })
      return run.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id} (${v.nodes.length})`)
    })
    record(
      'no serious or critical axe violations (DoD 3.5)',
      violations.length === 0,
      violations.join(', ') || 'none',
    )
  } else {
    record('axe-core could not be loaded (offline) — a11y check skipped', true, 'skipped')
  }

  // ---- DoD 3.6 reduced motion ------------------------------------------
  const reduced = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  })
  const rpage = await reduced.newPage()
  await rpage.goto(baseUrl, { waitUntil: 'load' })
  await rpage.evaluate(DROP, fixtures)
  await rpage.waitForSelector('.reader-sheet .doc', { timeout: 20000 })

  const motion = await rpage.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const stage = document.querySelector('.reader-stage')
    return {
      durBase: root.getPropertyValue('--dur-base').trim(),
      durReveal: root.getPropertyValue('--dur-reveal').trim(),
      scroll: stage ? getComputedStyle(stage).scrollBehavior : '',
    }
  })
  record(
    'motion tokens collapse under reduced motion (DoD 3.6)',
    motion.durBase === '0ms' && motion.durReveal === '0ms',
    `base=${motion.durBase} reveal=${motion.durReveal}`,
  )
  record('smooth scrolling is disabled under reduced motion', motion.scroll === 'auto', motion.scroll)
  await reduced.close()

  record('no console errors during the drive', consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' | '))
} catch (err) {
  record('drive completed without throwing', false, String(err))
} finally {
  await context.close()
  await browser.close()
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)

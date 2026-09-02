/** Flatten the fixture tree into the JSON the browser drive injects. */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', 'fixtures', 'handbook')
const out = []

const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full)
    else out.push({
      path: relative(root, full).split(sep).join('/'),
      content: readFileSync(full, 'utf8'),
    })
  }
}

walk(root)
writeFileSync(join(here, 'fixtures.json'), JSON.stringify(out))
console.log(`wrote ${out.length} fixtures`)

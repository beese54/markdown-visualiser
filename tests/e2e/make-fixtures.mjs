/**
 * Flatten the fixture tree into the JSON the browser drive injects.
 *
 * Binary files are base64-encoded rather than read as UTF-8: reading a PNG as
 * text corrupts it, the browser then cannot decode it, and the drive ends up
 * testing the failure path while looking like it tested the success path.
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', 'fixtures', 'handbook')

const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.mkd', '.txt', '.json'])

const out = []

const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      walk(full)
      continue
    }
    const path = relative(root, full).split(sep).join('/')
    if (TEXT_EXTENSIONS.has(extname(name).toLowerCase())) {
      out.push({ path, content: readFileSync(full, 'utf8') })
    } else {
      out.push({ path, base64: readFileSync(full).toString('base64') })
    }
  }
}

walk(root)
writeFileSync(join(here, 'fixtures.json'), JSON.stringify(out))
console.log(`wrote ${out.length} fixtures (${out.filter((f) => f.base64).length} binary)`)

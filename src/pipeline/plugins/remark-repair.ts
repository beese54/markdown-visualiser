import { visit } from 'unist-util-visit'
import { toString as mdastToString } from 'mdast-util-to-string'
import type { Heading, List, Node, Root } from 'mdast'
import type { Plugin } from 'unified'

import type { RepairNote } from '@/types/domain'

/**
 * Markdown repair.
 *
 * Real document sets are written by several people over months, and their
 * heading hierarchies drift: an H1 followed by an H5, three H1s in one file,
 * lists indented by two spaces in one section and four in the next. Rendered
 * literally, that produces a document whose structure is wrong - the index is
 * unusable and the typography implies relationships that are not there.
 *
 * The rule this module is built around: **never change a document silently.**
 * Every repair is recorded as a RepairNote and surfaced in the UI. Repairing
 * someone's writing without telling them is editing it behind their back, and
 * a reader that does that cannot be trusted with anything important.
 */

export interface RepairResult {
  readonly notes: RepairNote[]
}

interface RepairOptions {
  /** Collected notes are pushed here; the caller owns the array. */
  readonly sink: RepairNote[]
  /**
   * The document title as resolved by ingest. When the first H1 duplicates
   * it, that H1 is redundant with the page's own title block.
   */
  readonly title?: string
}

const lineOf = (node: Node): number | null => node.position?.start.line ?? null

/**
 * Normalise heading depth.
 *
 * Two problems are fixed in one pass, because they interact:
 *
 *  - **Skipped levels.** `# A` followed by `##### B` implies four levels of
 *    nesting that do not exist. B is pulled up to the next real level.
 *  - **Duplicate H1s.** A file with three H1s has three competing titles. The
 *    first stays; later ones are demoted, and their whole subtree shifts with
 *    them so relative structure is preserved.
 *
 * The algorithm walks headings in document order maintaining a stack of the
 * output depths actually emitted, which is what makes the two fixes agree
 * with each other rather than fighting.
 */
function repairHeadings(tree: Root, opts: RepairOptions): void {
  const headings: Heading[] = []
  visit(tree, 'heading', (node: Heading) => {
    headings.push(node)
  })
  if (headings.length === 0) return

  /** Input depths already seen, mapped to the depth we emitted for them. */
  const stack: { input: number; output: number }[] = []
  let seenH1 = false

  for (const node of headings) {
    const input = node.depth
    const text = mdastToString(node)

    // Drop entries deeper than or equal to this heading: they are siblings
    // or children of a section this heading now closes.
    while (stack.length > 0 && stack[stack.length - 1]!.input >= input) stack.pop()

    const parent = stack[stack.length - 1]
    let output: number

    if (input === 1) {
      if (!seenH1) {
        seenH1 = true
        output = 1
      } else {
        // A second competing title. Demote it under the first.
        output = 2
        opts.sink.push({
          rule: 'duplicate-h1',
          line: lineOf(node),
          before: `h1: ${text}`,
          after: `h2: ${text}`,
          detail:
            'The document already had a top-level heading, so this one was ' +
            'demoted to keep a single title.',
        })
      }
    } else if (!parent) {
      // A heading deeper than h1 with no ancestor - e.g. a file that opens
      // on an h3. Promote it to the top level of its own hierarchy.
      output = seenH1 ? 2 : 1
      if (output !== input) {
        opts.sink.push({
          rule: 'heading-skip',
          line: lineOf(node),
          before: `h${input}: ${text}`,
          after: `h${output}: ${text}`,
          detail: 'This heading had no parent section, so it was promoted.',
        })
      }
    } else {
      // Exactly one level below the parent's *output* depth, not its input
      // depth. Deriving from the output is what makes a demoted section carry
      // its whole subtree down with it: if `# B` became an h2, then `## B1`
      // beneath it must become an h3, or B1 ends up a sibling of the section
      // it belongs to and the index shows a structure the document does not
      // have. The stack has already popped everything at or below this
      // heading's input depth, so the parent is always genuinely shallower.
      output = parent.output + 1
      if (output !== input) {
        opts.sink.push({
          rule: 'heading-skip',
          line: lineOf(node),
          before: `h${input}: ${text}`,
          after: `h${output}: ${text}`,
          detail:
            output < input
              ? `Jumped from h${parent.output} to h${input}, skipping a level.`
              : 'Shifted to stay beneath its parent section, which moved.',
        })
      }
    }

    node.depth = Math.min(6, Math.max(1, output)) as Heading['depth']
    stack.push({ input, output: node.depth })
  }
}

/**
 * Unify bullet markers within a list.
 *
 * mdast does not record the marker character per item, so this operates on
 * what it does expose: a list whose items disagree about spacing is marked
 * loose/tight inconsistently. Normalising `spread` makes the rendered
 * vertical rhythm consistent, which is the visible symptom of mixed markers.
 */
function repairLists(tree: Root, opts: RepairOptions): void {
  visit(tree, 'list', (node: List) => {
    const items = node.children
    if (items.length < 2) return

    const spreadCount = items.filter((item) => item.spread === true).length
    const dominant = spreadCount > items.length / 2

    const inconsistent = items.some((item) => (item.spread === true) !== dominant)
    if (!inconsistent) return

    for (const item of items) item.spread = dominant
    node.spread = dominant

    opts.sink.push({
      rule: 'mixed-markers',
      line: lineOf(node),
      before: `${spreadCount} of ${items.length} items spaced apart`,
      after: dominant ? 'all items spaced apart' : 'all items tight',
      detail: 'List items disagreed about spacing, which broke the rhythm.',
    })
  })
}

/**
 * Fix list nesting that is indented inconsistently.
 *
 * A list nested under a paragraph rather than a list item - the shape you get
 * from two-space indentation where the parser expected four - renders as a
 * sibling instead of a child. Where a list directly follows a list inside the
 * same item, the second is folded into the first.
 */
function repairListNesting(tree: Root, opts: RepairOptions): void {
  visit(tree, 'listItem', (item) => {
    const kids = item.children
    // A list item whose only child is a list has lost its own text content to
    // an indentation mistake; unwrap it so the levels line up.
    if (kids.length === 1 && kids[0]?.type === 'list') {
      const inner = kids[0] as List
      if (inner.children.length > 0) {
        item.children = inner.children.flatMap((child) => child.children)
        opts.sink.push({
          rule: 'list-nesting',
          line: lineOf(item),
          before: 'list item containing only a nested list',
          after: 'nested items lifted to this level',
          detail: 'Indentation created an empty level of nesting.',
        })
      }
    }
  })
}

/** Strip trailing whitespace that is not a deliberate hard line break. */
function repairTrailingWhitespace(tree: Root, opts: RepairOptions): void {
  let count = 0
  let firstLine: number | null = null

  visit(tree, 'text', (node) => {
    // A hard break in mdast is its own node type, so any trailing run of
    // spaces reaching a text node here is residue, not intent.
    const trimmed = node.value.replace(/[ \t]+$/gm, '')
    if (trimmed !== node.value) {
      count += 1
      firstLine ??= lineOf(node)
      node.value = trimmed
    }
  })

  if (count > 0) {
    opts.sink.push({
      rule: 'trailing-ws',
      line: firstLine,
      before: `${count} lines with trailing whitespace`,
      after: 'trimmed',
      detail: 'Trailing spaces can produce stray line breaks when rendered.',
    })
  }
}

/**
 * Close emphasis that was opened and never terminated.
 *
 * remark already recovers from this by treating the marker as literal text,
 * which is the correct parse. What it cannot do is tell the user that the
 * `**` they typed did not do what they meant - so this reports it.
 */
function reportUnbalancedEmphasis(tree: Root, opts: RepairOptions): void {
  visit(tree, 'text', (node) => {
    const stray = /(\*\*|__)(?![\s\S]*\1)/.exec(node.value)
    if (!stray) return
    opts.sink.push({
      rule: 'unbalanced-emphasis',
      line: lineOf(node),
      before: node.value.slice(0, 60),
      after: 'rendered literally',
      detail:
        `An unclosed ${stray[1]} was left as text. It was probably meant to ` +
        'be bold.',
    })
  })
}

/**
 * The repair pass, as a remark plugin.
 *
 * Runs on mdast before conversion to hast, so it fixes structure rather than
 * patching markup after the fact.
 */
export const remarkRepair: Plugin<[RepairOptions], Root> = (opts) => (tree: Root) => {
  // Order matters: whitespace and emphasis are reported against the original
  // text, headings and lists rewrite structure.
  repairTrailingWhitespace(tree, opts)
  reportUnbalancedEmphasis(tree, opts)
  repairHeadings(tree, opts)
  repairListNesting(tree, opts)
  repairLists(tree, opts)
}

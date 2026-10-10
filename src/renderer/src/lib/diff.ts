import { diffLines } from 'diff'

export type DiffRowType = 'add' | 'del' | 'ctx' | 'gap'

export interface DiffRow {
  type: DiffRowType
  text: string
  oldLine: number | null
  newLine: number | null
}

export interface DiffSummary {
  added: number
  removed: number
  /** True when there is nothing to compare. */
  identical: boolean
}

/**
 * Builds a line diff with surrounding context, collapsing long unchanged runs
 * into a single `gap` row so the review card stays readable.
 */
export function buildDiff(before: string, after: string, context = 3): DiffRow[] {
  const parts = diffLines(before ?? '', after ?? '')
  const rows: DiffRow[] = []
  let oldLine = 1
  let newLine = 1

  for (const part of parts) {
    const lines = part.value.split('\n')
    // diffLines keeps the trailing newline as its own empty element.
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

    for (const text of lines) {
      if (part.added) {
        rows.push({ type: 'add', text, oldLine: null, newLine: newLine++ })
      } else if (part.removed) {
        rows.push({ type: 'del', text, oldLine: oldLine++, newLine: null })
      } else {
        rows.push({ type: 'ctx', text, oldLine: oldLine++, newLine: newLine++ })
      }
    }
  }

  const changed = rows
    .map((row, index) => (row.type === 'ctx' ? -1 : index))
    .filter((index) => index >= 0)
  if (changed.length === 0) return rows.slice(0, 200)

  const keep = new Set<number>()
  for (const index of changed) {
    for (let offset = index - context; offset <= index + context; offset += 1) {
      if (offset >= 0 && offset < rows.length) keep.add(offset)
    }
  }

  const collapsed: DiffRow[] = []
  let inGap = false
  rows.forEach((row, index) => {
    if (keep.has(index)) {
      collapsed.push(row)
      inGap = false
      return
    }
    if (!inGap) {
      collapsed.push({ type: 'gap', text: '', oldLine: null, newLine: null })
      inGap = true
    }
  })
  return collapsed
}

export function summarize(before: string, after: string): DiffSummary {
  if ((before ?? '') === (after ?? '')) return { added: 0, removed: 0, identical: true }
  const parts = diffLines(before ?? '', after ?? '')
  let added = 0
  let removed = 0
  for (const part of parts) {
    const count = part.count ?? part.value.split('\n').length
    if (part.added) added += count
    else if (part.removed) removed += count
  }
  return { added, removed, identical: false }
}

/** First line of a diff, used as a one-line preview in the queue. */
export function firstChangedLine(before: string, after: string): string | null {
  for (const row of buildDiff(before, after, 0)) {
    if (row.type === 'add' || row.type === 'del') return row.text.trim().slice(0, 120)
  }
  return null
}

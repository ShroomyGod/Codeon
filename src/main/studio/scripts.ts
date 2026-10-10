/**
 * Helpers for Studio's script tools.
 *
 * `script_read` returns text formatted as `     1→local x = 1`, and `multi_edit`
 * applies ordered string replacements. To show a real diff during review we
 * strip the line numbers and replay the edits locally.
 */

/** Removes the `  12→` gutter that `script_read` puts in front of every line. */
export function stripLineNumbers(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*\d+\s*\u2192/, ''))
    .join('\n')
}

export interface ScriptEdit {
  old_string: string
  new_string: string
  replace_all?: boolean
}

export interface AppliedEdits {
  result: string
  /** Edits that could not be reproduced locally, so the preview is inexact. */
  problems: string[]
}

/**
 * Replays `multi_edit` edits against a source string.
 *
 * This is a best-effort local preview: Roblox performs the real edit, so any
 * mismatch is reported rather than hidden — the review card says when a preview
 * is approximate.
 */
export function applyEdits(source: string, edits: ScriptEdit[]): AppliedEdits {
  let result = source
  const problems: string[] = []

  for (const [index, edit] of edits.entries()) {
    const oldString = edit.old_string ?? ''
    const newString = edit.new_string ?? ''

    if (oldString === '') {
      // Empty old_string means "set the initial content" for a new script.
      if (result === '') {
        result = newString
        continue
      }
      result = newString ? `${result}\n${newString}` : result
      continue
    }

    if (!result.includes(oldString)) {
      problems.push(`edit ${index + 1} did not match the current source`)
      continue
    }

    result = edit.replace_all
      ? result.split(oldString).join(newString)
      : result.replace(oldString, newString)
  }

  return { result, problems }
}

/** Extracts the script paths from `script_search` text output. */
export function parseScriptSearch(text: string): { name: string; className: string; path: string }[] {
  const results: { name: string; className: string; path: string }[] = []
  for (const line of text.split('\n')) {
    const match = /^Name:\s*(.*?)\s*\|\s*Type:\s*(.*?)\s*\|\s*Path:\s*(.+)$/.exec(line.trim())
    if (match) results.push({ name: match[1], className: match[2], path: match[3].trim() })
  }
  return results
}

/** Extracts the flat node list from `search_game_tree` output. */
export function parseGameTree(text: string): { nodes: unknown[]; truncated: boolean } {
  const trimmed = text.trim()
  const truncated = /^\s*Note:\s*Output limited/i.test(trimmed)
  const start = trimmed.indexOf('[')
  const end = trimmed.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return { nodes: [], truncated }
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1))
    return { nodes: Array.isArray(parsed) ? parsed : [], truncated }
  } catch {
    return { nodes: [], truncated }
  }
}

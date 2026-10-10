import { ACTION_BLOCK } from './prompt'

export interface ParsedAction {
  tool: string
  args: Record<string, unknown>
}

export interface ParseResult {
  /** Prose with the action blocks removed, ready to show in the chat. */
  prose: string
  actions: ParsedAction[]
  /** Blocks that looked like actions but were not valid. */
  errors: string[]
}

const BLOCK_PATTERN = new RegExp('```' + ACTION_BLOCK + '\\s*\\n([\\s\\S]*?)```', 'g')

/**
 * Extracts action blocks from an assistant reply.
 *
 * The protocol is a fenced JSON block rather than native tool-calling so that
 * every provider in the catalog behaves identically — including small free
 * models that handle tool schemas poorly.
 */
export function parseActions(text: string): ParseResult {
  const actions: ParsedAction[] = []
  const errors: string[] = []

  const prose = text.replace(BLOCK_PATTERN, (_match, body: string) => {
    const cleaned = body.trim()
    if (!cleaned) {
      errors.push('Empty action block.')
      return ''
    }
    try {
      const parsed = JSON.parse(cleaned) as { tool?: unknown; args?: unknown }
      if (typeof parsed.tool !== 'string' || !parsed.tool) {
        errors.push(`Action block is missing a "tool" string: ${cleaned.slice(0, 120)}`)
        return ''
      }
      const args = parsed.args && typeof parsed.args === 'object' ? (parsed.args as Record<string, unknown>) : {}
      actions.push({ tool: parsed.tool, args })
      return ''
    } catch (error) {
      errors.push(
        `Action block was not valid JSON (${error instanceof Error ? error.message : String(error)}): ${cleaned.slice(0, 120)}`
      )
      return ''
    }
  })

  return { prose: prose.replace(/\n{3,}/g, '\n\n').trim(), actions, errors }
}

/** True when the model appears to have been cut off mid-block. */
export function looksTruncated(text: string): boolean {
  const opens = (text.match(/```/g) ?? []).length
  return opens % 2 === 1
}

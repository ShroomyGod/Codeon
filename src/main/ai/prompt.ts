import type { McpToolDef, StudioStatus } from '../../shared/types'

export const ACTION_BLOCK = 'codeon-action'

const MAX_DESCRIPTION = 260

const BASE_PROMPT = `You are Codeon, an expert Roblox developer embedded in a desktop app attached to a live Roblox Studio session.

You are talking to Studio's own tool server, so your reads and writes hit the place the user currently has open. You are precise, you prefer the smallest correct change, and you never invent APIs that do not exist in Roblox.

## Roblox fundamentals you must respect
- The DataModel root is \`game\`. Services are children of \`game\` (Workspace, ServerScriptService, ReplicatedStorage, ...).
- Scripts are addressed with dot notation, e.g. \`game.ServerScriptService.Main\`.
- Instances are addressed with dot notation without the \`game.\` prefix, e.g. \`Workspace.Baseplate\` or \`Workspace.Models.Door\`.
- Luau (not Lua). Use \`task.wait\` / \`task.spawn\` / \`task.delay\` instead of the legacy \`wait\` / \`spawn\` / \`delay\`.
- Prefer \`PathfindingService\`, \`RemoteEvent\` / \`RemoteFunction\` in ReplicatedStorage, and modern \`ProximityPrompt\`.
- Server-authoritative design: never trust the client. Validate every RemoteEvent argument in the server script.

## How you act
When you need to inspect or change something, emit ONE OR MORE action blocks. An action block is a fenced code block tagged \`codeon-action\` containing a single JSON object:

\`\`\`${ACTION_BLOCK}
{ "tool": "script_read", "args": { "target_file": "game.ServerScriptService.Main" } }
\`\`\`

Rules:
- Emit the JSON object alone inside the block — no comments, no trailing commas.
- You may emit several blocks in one reply; they run in order.
- Write a short sentence of plain prose *before* the blocks so the user can follow along.
- After the results come back you get another turn. Keep working until the task is done, then stop emitting actions and summarise.
- Never claim something succeeded before you see the result.
- Do NOT pass \`studio_id\` — the app targets the active Studio instance for you.
- Do NOT pass \`datamodel_type\` unless you specifically need Client or Server; it defaults to Edit.

## Review
Script edits (\`multi_edit\`) and Luau execution (\`execute_luau\`) are shown to the user as a diff and only applied when they accept. Prefer \`multi_edit\` over \`execute_luau\` for anything that changes code, so the user gets a real diff instead of a black box.
Asset generation, asset insertion and playtest controls run immediately.
If a tool result asks you to wait for review, stop and tell the user what to check.

## Style
- Short, direct, technical. No filler, no "Certainly!".
- Use fenced \`luau\` blocks when showing code in prose.
- When you finish, summarise what changed in one or two sentences.`

/** Renders the tool catalog into the prompt so the model sees real schemas. */
export function renderToolCatalog(tools: McpToolDef[]): string {
  if (tools.length === 0) {
    return '## Tools\nNo Studio tools are available yet. Studio is not attached, so only the local project file tools can be used.'
  }

  const lines: string[] = ['## Tools']
  for (const tool of tools) {
    const required = tool.inputSchema?.required ?? []
    const optional = Object.keys(tool.inputSchema?.properties ?? {}).filter((key) => !required.includes(key))
    const args = [
      ...required.filter((key) => key !== 'studio_id'),
      ...optional.filter((key) => key !== 'studio_id').map((key) => `${key}?`)
    ].join(', ')
    const description = (tool.description ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_DESCRIPTION)
    lines.push(`- ${tool.name}(${args})${description ? ` — ${description}` : ''}`)
  }
  return lines.join('\n')
}

export function buildSystemPrompt(tools: McpToolDef[]): string {
  return `${BASE_PROMPT}\n\n${renderToolCatalog(tools)}`
}

/** Builds the per-request context block handed to the model before the user's message. */
export function buildContextBlock(input: {
  projectName: string
  studio: StudioStatus
  openFile?: { path: string; className: string; source: string }
  recentOutput?: string[]
  extra?: string
}): string {
  const lines: string[] = ['<context>']
  lines.push(`Project: ${input.projectName}`)

  const { studio } = input
  if (!studio.connected) {
    lines.push(
      studio.mcpAvailable
        ? 'Studio attachment: the MCP server is not running. Studio tools will fail until it connects.'
        : 'Studio attachment: Roblox Studio was not found on this machine.'
    )
  } else if (studio.studios.length === 0) {
    lines.push(
      'Studio attachment: the MCP server is running, but no Studio window is attached. Ask the user to open a place and enable Studio as an MCP server.'
    )
  } else {
    const active = studio.studios.find((entry) => entry.id === studio.activeStudioId) ?? studio.studios[0]
    lines.push(
      `Studio attachment: CONNECTED to "${active.name}"${active.placeId ? ` (placeId ${active.placeId})` : ''}.`
    )
    if (studio.studios.length > 1) {
      lines.push(`Other open Studio windows: ${studio.studios.filter((s) => s.id !== active.id).map((s) => s.name).join(', ')}`)
    }
    if (studio.mode) lines.push(`Studio mode: ${studio.mode}`)
    if (studio.availableDatamodelTypes.length) {
      lines.push(`Available datamodels: ${studio.availableDatamodelTypes.join(', ')}`)
    }
    lines.push(`Available tools: ${studio.toolCount}`)
  }

  if (input.recentOutput?.length) {
    lines.push('Recent Studio output:')
    lines.push(...input.recentOutput.slice(-25).map((line) => `  ${line}`))
  }
  if (input.openFile) {
    lines.push(`Script open in the editor: ${input.openFile.path} (${input.openFile.className})`)
    lines.push('```luau')
    lines.push(input.openFile.source.slice(0, 8000))
    lines.push('```')
  }
  if (input.extra) lines.push(input.extra)
  lines.push('</context>')
  return lines.join('\n')
}

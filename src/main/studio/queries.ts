import type { GameTreeNode, GameTreeResult, InspectResult } from '../../shared/types'
import {
  buildCreateInstance,
  buildDeleteInstance,
  buildGetSelection,
  buildListProperties,
  buildSetProperty
} from './luau'
import type { StudioMcpClient } from './mcp'
import { parseGameTree, stripLineNumbers } from './scripts'

/**
 * Reads the `name<TAB>value` lines {@link buildListProperties} returns.
 *
 * Values may contain tabs, so only the first one separates the name; blank and
 * malformed lines are skipped rather than guessed at.
 */
export function parsePropertyLines(text: string): Record<string, string> {
  const properties: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const separator = line.indexOf('\t')
    if (separator <= 0) continue
    const name = line.slice(0, separator).trim()
    if (!name) continue
    properties[name] = line.slice(separator + 1)
  }
  return properties
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export interface GameTreeQuery {
  path?: string
  maxDepth?: number
  instanceType?: string
  keywords?: string
  headLimit?: number
}

export async function fetchGameTree(mcp: StudioMcpClient, query: GameTreeQuery = {}): Promise<GameTreeResult> {
  const result = await mcp.callTool('search_game_tree', {
    path: query.path || undefined,
    max_depth: query.maxDepth ?? 3,
    instance_type: query.instanceType || undefined,
    keywords: query.keywords || undefined,
    head_limit: query.headLimit ?? 400
  })

  const { nodes, truncated } = parseGameTree(result.text)
  const parsed: GameTreeNode[] = []
  for (const node of nodes) {
    const record = asRecord(node)
    const fullPath = String(record.fullPath ?? record.path ?? '')
    if (!fullPath) continue
    parsed.push({
      fullPath,
      name: String(record.name ?? fullPath.split('.').pop() ?? fullPath),
      className: String(record.className ?? record.type ?? 'Instance'),
      parentName: record.parentName ? String(record.parentName) : undefined
    })
  }
  return { nodes: parsed, truncated }
}

export async function fetchInstance(mcp: StudioMcpClient, path: string): Promise<InspectResult> {
  const result = await mcp.callTool('inspect_instance', { path })
  const record = asRecord(result.json)
  const fromMcp = asRecord(record.properties)
  const children = asRecord(record.children)
  const immediate = Array.isArray(children.immediateChildren) ? children.immediateChildren : []

  // Services arrive with no properties at all — Studio's MCP server cannot
  // enumerate them, so `properties` comes back as an empty array — while Luau can
  // read them. Falls back rather than telling the user their Workspace has none.
  let properties: Record<string, unknown> = fromMcp
  let propertiesError: string | undefined
  if (Object.keys(fromMcp).length === 0) {
    try {
      properties = parsePropertyLines(await runLuau(mcp, buildListProperties(path)))
    } catch (error) {
      propertiesError = `Could not read properties from Studio: ${
        error instanceof Error ? error.message : String(error)
      }`
    }
  }

  return {
    path: String(record.path ?? path),
    name: String(record.name ?? path.split('.').pop() ?? path),
    className: String(record.className ?? 'Instance'),
    uniqueId: record.uniqueId ? String(record.uniqueId) : undefined,
    properties,
    propertiesError,
    children: {
      immediateChildren: immediate.map((child) => {
        const entry = asRecord(child)
        return { path: String(entry.path ?? ''), className: String(entry.className ?? 'Instance') }
      }),
      totalDescendants: typeof children.totalDescendants === 'number' ? children.totalDescendants : undefined,
      childrenCount: typeof children.childrenCount === 'number' ? children.childrenCount : undefined
    }
  }
}

/** Full source of a script, with Studio's line-number gutter removed. */
export async function readScriptSource(mcp: StudioMcpClient, path: string): Promise<string> {
  const result = await mcp.callTool('script_read', { target_file: path, should_read_entire_file: true })
  return stripLineNumbers(result.text)
}

export interface StudioStateSummary {
  mode?: string
  available: string[]
  raw: string
}

export async function fetchStudioState(mcp: StudioMcpClient): Promise<StudioStateSummary> {
  const result = await mcp.callTool('get_studio_state')
  const mode = /Current Studio Mode:\s*(\w+)/i.exec(result.text)?.[1]
  const availableRaw = /Available DataModels:\s*(.+)/i.exec(result.text)?.[1] ?? ''
  return {
    mode,
    available: availableRaw
      .split(/[,\s]+/)
      .map((part) => part.trim())
      .filter(Boolean),
    raw: result.text
  }
}

/* ------------------------------------------------------------------ */
/* Writes (used by the UI, which applies them immediately)             */
/* ------------------------------------------------------------------ */

export async function runLuau(mcp: StudioMcpClient, code: string, datamodel = 'Edit'): Promise<string> {
  const result = await mcp.callTool('execute_luau', { code, datamodel_type: datamodel }, { timeoutMs: 60000 })
  return result.text
}

export async function setPropertyDirect(
  mcp: StudioMcpClient,
  input: { path: string; property: string; value: string }
): Promise<string> {
  return runLuau(mcp, buildSetProperty(input))
}

export async function createInstanceDirect(
  mcp: StudioMcpClient,
  input: { parent: string; className: string; name: string; properties?: Record<string, string> }
): Promise<string> {
  return runLuau(mcp, buildCreateInstance(input))
}

export async function deleteInstanceDirect(mcp: StudioMcpClient, path: string): Promise<string> {
  return runLuau(mcp, buildDeleteInstance(path))
}

export async function fetchSelection(mcp: StudioMcpClient): Promise<string[]> {
  const text = await runLuau(mcp, buildGetSelection())
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export async function setPlayState(mcp: StudioMcpClient, start: boolean): Promise<string> {
  const result = await mcp.callTool('start_stop_play', { is_start: start }, { timeoutMs: 60000 })
  return result.text
}

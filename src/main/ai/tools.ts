import type { Change, GameTreeResult, McpToolDef } from '../../shared/types'
import type { ChangeService } from '../changes'
import {
  buildCreateInstance,
  buildDeleteInstance,
  buildGetSelection,
  buildSetProperty
} from '../studio/luau'
import type { StudioMcpClient as McpClient } from '../studio/mcp'
import { fetchGameTree, fetchInstance, readScriptSource } from '../studio/queries'
import { applyEdits, type ScriptEdit } from '../studio/scripts'
import type { Store } from '../store'

export interface AgentToolConfig {
  reviewChanges: boolean
  autoApproveScripts: boolean
  autoApproveLuau: boolean
}

export interface ToolRunContext {
  projectId: string
  sessionId: string
  config: AgentToolConfig
}

export interface ToolOutcome {
  /** Compact JSON-able payload handed back to the model. */
  data: unknown
  /** One-line description shown as an agent step in the UI. */
  summary: string
  change?: Change
}

const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback)

/**
 * Tools Codeon adds on top of the Studio catalog.
 *
 * Roblox's server has no typed property writer, so these build the Luau for the
 * agent and route it through review instead of hoping the model writes correct
 * coercion code every time.
 */
export const LOCAL_TOOLS: McpToolDef[] = [
  {
    name: 'set_property',
    description:
      'Set one property on an instance, coerced to the right type (Vector3, Color3, UDim2, CFrame, Enum, boolean, number). Prefix the property with @ to set an attribute. Reviewed before it reaches Studio.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Dot-notation path, e.g. Workspace.Baseplate' },
        property: { type: 'string', description: 'Property name, e.g. Anchored (or @MyAttribute)' },
        value: { type: 'string', description: 'New value as text, e.g. "true", "10, 5, 0", "#ff8800", "Neon"' }
      },
      required: ['path', 'property', 'value']
    }
  },
  {
    name: 'create_instance',
    description: 'Create an instance under a parent and optionally apply properties. Reviewed before it reaches Studio.',
    inputSchema: {
      type: 'object',
      properties: {
        parent: { type: 'string', description: 'Parent path, e.g. Workspace' },
        className: { type: 'string', description: 'Roblox class name, e.g. Part' },
        name: { type: 'string' },
        properties: { type: 'object', description: 'Optional property map, values as text' }
      },
      required: ['parent', 'className', 'name']
    }
  },
  {
    name: 'delete_instance',
    description: 'Destroy an instance and everything under it. Reviewed before it reaches Studio.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Dot-notation path to destroy' } },
      required: ['path']
    }
  },
  {
    name: 'get_selection',
    description: 'The instances the user currently has selected in Studio.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'read_project_file',
    description: "Read a file from Codeon's local project snapshot (not Studio).",
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path']
    }
  },
  {
    name: 'write_project_file',
    description: "Write a file into Codeon's local project snapshot. Reviewed before it is saved.",
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' }, source: { type: 'string' } },
      required: ['path', 'source']
    }
  }
]

/** Short human labels for the agent's step list. */
export function describeCall(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'script_read':
      return `Read ${asString(args.target_file, 'a script')}`
    case 'script_search':
      return `Searched scripts for "${asString(args.keywords)}"`
    case 'script_grep':
      return `Searched script contents for "${asString(args.query)}"`
    case 'search_game_tree':
      return `Explored ${asString(args.path) || 'the DataModel'}`
    case 'inspect_instance':
      return `Inspected ${asString(args.path)}`
    case 'insert_asset':
      return `Inserted asset ${asString(args.assetId)}`
    case 'search_asset':
      return 'Searched the Creator Store'
    case 'generate_mesh':
      return 'Generated a mesh'
    case 'generate_material':
      return 'Generated a material'
    case 'generate_texture':
      return 'Generated a texture'
    case 'generate_procedural_model':
      return 'Generated a procedural model'
    case 'start_stop_play':
      return args.is_start ? 'Started a playtest' : 'Stopped the playtest'
    case 'get_console_output':
      return 'Read the Studio console'
    case 'screen_capture':
      return 'Captured the Studio viewport'
    case 'subagent':
      return `Ran a ${asString(args.subagent_type, 'studio')} subagent`
    case 'http_get':
      return `Fetched ${asString(args.url)}`
    case 'skill':
      return `Read the "${asString(args.skill_name)}" skill`
    default:
      return `Ran ${name}`
  }
}

export class ToolRunner {
  constructor(
    private readonly store: Store,
    private readonly mcp: McpClient,
    private readonly changes: ChangeService
  ) {}

  /** Everything the agent may call: Codeon's helpers plus Studio's own tools. */
  get catalog(): McpToolDef[] {
    return [...LOCAL_TOOLS, ...this.mcp.toolDefinitions]
  }

  private project(projectId: string) {
    return this.store.getProject(projectId)
  }

  /**
   * Records a proposed mutation. Depending on the review settings it either
   * waits in the review queue or applies immediately.
   */
  private async propose(
    input: {
      kind: Change['kind']
      target: string
      property?: string
      before?: string
      after?: string
      note?: string
      tool?: string
      toolArgs?: Record<string, unknown>
    },
    context: ToolRunContext
  ): Promise<{ change: Change; applied: boolean }> {
    const isLuau = input.kind === 'run'
    const autoApprove =
      !context.config.reviewChanges ||
      (isLuau ? context.config.autoApproveLuau : context.config.autoApproveScripts)

    const change = this.changes.create({
      ...input,
      projectId: context.projectId,
      sessionId: context.sessionId,
      appliedAutomatically: autoApprove
    })

    if (!autoApprove) return { change, applied: false }

    try {
      await this.changes.apply(change.id)
      return { change, applied: true }
    } catch {
      return { change, applied: false }
    }
  }

  /** Luau that Codeon generates itself always targets the active studio. */
  private luauArgs(code: string, datamodel = 'Edit'): Record<string, unknown> {
    return { code, datamodel_type: datamodel, studio_id: this.mcp.activeStudioId }
  }

  async run(name: string, args: Record<string, unknown>, context: ToolRunContext): Promise<ToolOutcome> {
    switch (name) {
      case 'set_property': {
        const path = asString(args.path)
        const property = asString(args.property)
        if (!path || !property) throw new Error('set_property needs both "path" and "property".')
        const value = asString(args.value, String(args.value ?? ''))

        let before: string | undefined
        try {
          const instance = await fetchInstance(this.mcp, path)
          const current = instance.properties[property]
          before = current === undefined ? undefined : String(current)
        } catch {
          before = undefined
        }

        const { change, applied } = await this.propose(
          {
            kind: 'property',
            target: path,
            property,
            before,
            after: value,
            note: `Set ${property} on ${path}`,
            tool: 'execute_luau',
            toolArgs: this.luauArgs(buildSetProperty({ path, property, value }))
          },
          context
        )
        return {
          data: { changeId: change.id, status: change.status, applied, result: change.result },
          summary: `${applied ? 'Set' : 'Proposed'} ${property} on ${path}`,
          change
        }
      }

      case 'create_instance': {
        const payload = {
          parent: asString(args.parent, 'game'),
          className: asString(args.className, 'Folder'),
          name: asString(args.name, asString(args.className, 'Folder')) || 'Folder',
          properties: (args.properties ?? {}) as Record<string, string>
        }
        const { change, applied } = await this.propose(
          {
            kind: 'create',
            target: `${payload.parent}.${payload.name}`,
            after: JSON.stringify(payload, null, 2),
            note: `Create ${payload.className} "${payload.name}" in ${payload.parent}`,
            tool: 'execute_luau',
            toolArgs: this.luauArgs(buildCreateInstance(payload))
          },
          context
        )
        return {
          data: { changeId: change.id, status: change.status, applied, result: change.result },
          summary: `${applied ? 'Created' : 'Proposed'} ${payload.className} in ${payload.parent}`,
          change
        }
      }

      case 'delete_instance': {
        const path = asString(args.path)
        let before: string | undefined
        try {
          before = JSON.stringify(await fetchInstance(this.mcp, path), null, 2)
        } catch {
          before = undefined
        }
        const { change, applied } = await this.propose(
          {
            kind: 'delete',
            target: path,
            before,
            note: `Delete ${path}`,
            tool: 'execute_luau',
            toolArgs: this.luauArgs(buildDeleteInstance(path))
          },
          context
        )
        return {
          data: { changeId: change.id, status: change.status, applied, result: change.result },
          summary: `${applied ? 'Deleted' : 'Proposed deletion of'} ${path}`,
          change
        }
      }

      case 'get_selection': {
        const text = await this.mcp.callTool('execute_luau', { code: buildGetSelection() })
        const selection = text.text
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
        return { data: { selection }, summary: selection.length ? `Selection: ${selection.join(', ')}` : 'Nothing is selected in Studio' }
      }

      case 'read_project_file': {
        const path = asString(args.path)
        const file = this.project(context.projectId)?.files.find((entry) => entry.path === path)
        if (!file) throw new Error(`No project file at "${path}".`)
        return { data: { path, source: file.source }, summary: `Read project file ${path}` }
      }

      case 'write_project_file': {
        const path = asString(args.path)
        const source = asString(args.source)
        const existing = this.project(context.projectId)?.files.find((entry) => entry.path === path)
        const { change, applied } = await this.propose(
          {
            kind: 'script',
            target: `file:${path}`,
            before: existing?.source ?? '',
            after: source,
            note: `Write project file ${path}`
          },
          context
        )
        return {
          data: { changeId: change.id, status: change.status, applied },
          summary: `${applied ? 'Wrote' : 'Proposed write to'} ${path}`,
          change
        }
      }

      case 'multi_edit': {
        const filePath = asString(args.file_path)
        if (!filePath) throw new Error('multi_edit needs a "file_path" (dot notation, e.g. game.ServerScriptService.Main).')
        const edits = Array.isArray(args.edits) ? (args.edits as ScriptEdit[]) : []
        const datamodel = asString(args.datamodel_type, 'Edit')

        // Replay the edits locally so the review card can show a real diff.
        let before = ''
        let exists = true
        try {
          before = await readScriptSource(this.mcp, filePath)
        } catch {
          exists = false
        }
        const { result, problems } = applyEdits(before, edits)
        const baseNote = exists ? `Edit ${filePath}` : `Create ${filePath}`
        const note = problems.length
          ? `${baseNote} — the preview could not reproduce: ${problems.join('; ')}`
          : baseNote

        const { change, applied } = await this.propose(
          {
            kind: 'script',
            target: filePath,
            before,
            after: result,
            note,
            tool: 'multi_edit',
            toolArgs: { ...args, file_path: filePath, datamodel_type: datamodel, studio_id: this.mcp.activeStudioId }
          },
          context
        )
        return {
          data: {
            changeId: change.id,
            status: change.status,
            applied,
            approximatePreview: problems.length > 0 ? problems : undefined,
            result: change.result
          },
          summary: `${applied ? 'Edited' : 'Proposed edits to'} ${filePath}`,
          change
        }
      }

      case 'execute_luau': {
        const code = asString(args.code)
        if (!code) throw new Error('execute_luau needs "code".')
        const datamodel = asString(args.datamodel_type, 'Edit')
        const { change, applied } = await this.propose(
          {
            kind: 'run',
            target: `studio:${datamodel}`,
            after: code,
            note: `Run Luau in the ${datamodel} datamodel. Studio freezes until it yields, so keep it short.`,
            tool: 'execute_luau',
            toolArgs: this.luauArgs(code, datamodel)
          },
          context
        )
        return {
          data: { changeId: change.id, status: change.status, applied, result: change.result },
          summary: `${applied ? 'Ran' : 'Proposed running'} Luau (${datamodel})`,
          change
        }
      }

      default: {
        // Everything else is a pass-through to Roblox's own tool.
        const result = await this.mcp.callTool(name, args, { timeoutMs: timeoutFor(name, args) })

        if (name === 'list_roblox_studios') await this.mcp.refreshStudios()
        if (name === 'start_stop_play') await this.mcp.refreshState().catch(() => undefined)
        if (name === 'get_console_output') void this.mcp.pollConsole().catch(() => undefined)

        return {
          data: { text: result.text.slice(0, 8000) },
          summary: describeCall(name, args)
        }
      }
    }
  }

  /** Cached tree for the explorer, also mirrored into the project snapshot. */
  async loadTree(projectId: string, query: Parameters<typeof fetchGameTree>[1]): Promise<GameTreeResult> {
    const tree = await fetchGameTree(this.mcp, query)
    this.store.updateProject(projectId, (project) => {
      project.instanceSnapshot = tree.nodes.slice(0, 2000)
    })
    return tree
  }
}

/** Tools that can legitimately take a long time inside Studio. */
function timeoutFor(name: string, args: Record<string, unknown>): number | undefined {
  if (name === 'generate_mesh' || name === 'generate_material' || name === 'generate_texture') {
    return args.async === true ? 60000 : 600000
  }
  if (name === 'generate_procedural_model') return 600000
  if (name === 'subagent') return 900000
  if (name === 'start_stop_play') return 120000
  if (name === 'execute_luau') return 120000
  if (name === 'insert_asset' || name === 'upload_image') return 180000
  return undefined
}

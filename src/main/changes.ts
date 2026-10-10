import { randomUUID } from 'node:crypto'
import type { Change, ChangeKind, ChangeStatus, Project } from '../shared/types'
import type { Store } from './store'
import type { StudioMcpClient } from './studio/mcp'

export interface CreateChangeInput {
  projectId: string
  sessionId: string
  kind: ChangeKind
  /** Dot-notation Studio path, or `file:<path>` for local project files. */
  target: string
  property?: string
  before?: string
  after?: string
  note?: string
  status?: ChangeStatus
  appliedAutomatically?: boolean
  /** Studio MCP tool replayed on accept, with its exact arguments. */
  tool?: string
  toolArgs?: Record<string, unknown>
}

/**
 * Owns the review queue.
 *
 * Every mutation the agent wants to make becomes a `Change` first. The renderer
 * shows a diff, and only an explicit accept replays the recorded Studio tool
 * call. Rejecting keeps the queue honest without side effects.
 */
export class ChangeService {
  constructor(
    private readonly store: Store,
    private readonly mcp: StudioMcpClient,
    private readonly onChanged: (change: Change) => void
  ) {}

  create(input: CreateChangeInput): Change {
    const change: Change = {
      id: randomUUID(),
      projectId: input.projectId,
      sessionId: input.sessionId,
      kind: input.kind,
      target: input.target,
      property: input.property,
      before: input.before,
      after: input.after,
      note: input.note,
      status: input.status ?? 'pending',
      appliedAutomatically: input.appliedAutomatically,
      tool: input.tool,
      toolArgs: input.toolArgs,
      createdAt: Date.now()
    }
    this.store.saveChange(change)

    const project = this.store.getProject(change.projectId)
    const session = project?.sessions.find((entry) => entry.id === change.sessionId)
    if (session) session.changeIds.push(change.id)
    if (project) this.store.saveProject(project)

    this.onChanged(change)
    return change
  }

  listPending(projectId?: string): Change[] {
    return this.store.changes.filter(
      (change) => change.status === 'pending' && (!projectId || change.projectId === projectId)
    )
  }

  reject(id: string): Change {
    const change = this.store.getChange(id)
    if (!change) throw new Error(`Unknown change ${id}`)
    change.status = 'rejected'
    change.resolvedAt = Date.now()
    this.store.saveChange(change)
    this.onChanged(change)
    return change
  }

  async apply(id: string): Promise<Change> {
    const change = this.store.getChange(id)
    if (!change) throw new Error(`Unknown change ${id}`)
    if (change.status === 'accepted') return change

    try {
      change.result = await this.perform(change)
      change.status = 'accepted'
      change.error = undefined
    } catch (error) {
      change.status = 'failed'
      change.error =
        error instanceof Error ? StudioMcpErrorMessage(error.message) : String(error)
    }
    change.resolvedAt = Date.now()
    this.store.saveChange(change)
    this.onChanged(change)

    if (change.status === 'failed') {
      throw new Error(change.error ?? 'Change failed to apply')
    }
    return change
  }

  async applyMany(ids: string[]): Promise<Change[]> {
    const applied: Change[] = []
    for (const id of ids) applied.push(await this.apply(id))
    return applied
  }

  /**
   * Performs the real mutation and returns whatever Studio reported.
   * Split out so review and auto-apply share the same code path.
   */
  private async perform(change: Change): Promise<string | undefined> {
    // Local project files never touch Studio.
    if (change.target.startsWith('file:')) {
      const path = change.target.slice('file:'.length)
      this.store.updateProject(change.projectId, (project) => {
        const file = project.files.find((entry) => entry.path === path)
        if (file) {
          file.source = change.after ?? ''
          file.updatedAt = Date.now()
        } else {
          project.files.push({
            path,
            className: 'Script',
            source: change.after ?? '',
            updatedAt: Date.now()            })
        }
      })
      return undefined
    }

    if (!change.tool) {
      throw new Error(
        `This change has no Studio tool recorded, so Codeon cannot apply it. Reject it and ask again.`
      )
    }

    const result = await this.mcp.callTool(change.tool, change.toolArgs ?? {})

    // Keep the local snapshot in step with what Studio now holds.
    if (change.kind === 'script') {
      this.store.updateProject(change.projectId, (project) => {
        const file = project.files.find((entry) => entry.path === change.target)
        if (file) {
          file.source = change.after ?? ''
          file.updatedAt = Date.now()
        }
      })
    }

    return result.text.slice(0, 4000)
  }

  projectFor(projectId: string): Project | undefined {
    return this.store.getProject(projectId)
  }
}

/** Studio prefixes some errors with an internal tool trace; strip it off. */
function StudioMcpErrorMessage(message: string): string {
  return message.replace(/^[^\s:]+\.rbxm[^\s:]*:\d+:\s*/, '').trim()
}

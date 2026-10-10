import { randomUUID } from 'node:crypto'
import type { AgentEvent, AgentStep, ChatRequest } from '../../shared/types'
import { resolveProvider } from '../../shared/providers'
import type { Store } from '../store'
import type { StudioMcpClient } from '../studio/mcp'
import { ProviderError, streamChat, type ChatTurn } from './client'
import { ACTION_BLOCK, buildContextBlock, buildSystemPrompt } from './prompt'
import { looksTruncated, parseActions } from './protocol'
import type { ToolRunner } from './tools'

/** Hides in-flight action blocks so the user only ever sees prose. */
class ProseStreamer {
  private raw = ''
  private emitted = 0
  private holding = false

  constructor(private readonly marker: string) {}

  feed(chunk: string): string {
    this.raw += chunk
    if (this.holding) return ''
    const index = this.raw.indexOf(this.marker)
    if (index !== -1) {
      this.holding = true
      const out = this.raw.slice(this.emitted, index)
      this.emitted = index
      return out
    }
    const safeEnd = Math.max(this.emitted, this.raw.length - (this.marker.length - 1))
    const out = this.raw.slice(this.emitted, safeEnd)
    this.emitted = safeEnd
    return out
  }
}

export interface AgentDeps {
  store: Store
  mcp: StudioMcpClient
  tools: ToolRunner
  emit: (event: AgentEvent) => void
  /** Optional override so tests can avoid the network. */
  stream?: typeof streamChat
}

interface RunState {
  controller: AbortController
}

export class Agent {
  private readonly runs = new Map<string, RunState>()

  constructor(private readonly deps: AgentDeps) {}

  cancel(runId: string): void {
    const run = this.runs.get(runId)
    if (run) run.controller.abort()
  }

  cancelAll(): void {
    for (const [runId] of this.runs) this.cancel(runId)
  }

  async run(request: ChatRequest): Promise<void> {
    const { emit, store, tools, mcp } = this.deps
    const stream = this.deps.stream ?? streamChat
    const controller = new AbortController()
    this.runs.set(request.runId, { controller })

    const emitSafe = (event: AgentEvent) => {
      try {
        emit(event)
      } catch (error) {
        console.error('[agent] failed to emit event:', error)
      }
    }

    emitSafe({ type: 'start', messageId: request.messageId, runId: request.runId })

    const steps: AgentStep[] = []
    const proseParts: string[] = []

    try {
      const settings = store.settings
      const resolved = resolveProvider(settings)
      const provider = resolved.provider

      if (provider.requiresKey && !resolved.apiKey) {
        throw new Error(
          `"${provider.label}" needs an API key. Open Settings to add one, or switch to OpenCode Zen (free).`
        )
      }

      const project = store.getProject(request.projectId)
      if (!project) throw new Error(`Unknown project ${request.projectId}`)
      const session = project.sessions.find((entry) => entry.id === request.sessionId)
      if (!session) throw new Error(`Unknown session ${request.sessionId}`)

      const history: ChatTurn[] = session.messages
        .filter((message) => (message.role === 'user' || message.role === 'assistant') && message.content.trim())
        .slice(-24)
        .map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content }))

      const openFile = store.getProject(request.projectId)?.files.find((entry) => entry.path === request.context)
      const contextBlock = buildContextBlock({
        projectName: project.name,
        studio: mcp.currentStatus,
        openFile: openFile
          ? { path: openFile.path, className: openFile.className, source: openFile.source }
          : undefined,
        recentOutput: mcp.consoleLines.slice(-25).map((line) => `${line.level}: ${line.message}`),
        extra:
          request.context && !openFile
            ? `The user currently has this instance open in the app: ${request.context}`
            : undefined
      })

      const conversation: ChatTurn[] = [
        { role: 'system', content: buildSystemPrompt(tools.catalog) },
        ...history,
        { role: 'user', content: `${contextBlock}\n\n<request>\n${request.prompt}\n</request>` }
      ]

      const maxSteps = Math.max(1, Math.min(settings.maxAgentSteps, 30))
      let proseAll = ''

      for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
        // Built from the same tag the prompt asks for and the parser looks for.
        const streamer = new ProseStreamer(`\`\`\`${ACTION_BLOCK}`)
        let raw = ''

        const attempt = async (): Promise<string> =>
          stream({
            kind: provider.kind,
            baseUrl: resolved.baseUrl,
            apiKey: resolved.apiKey,
            model: resolved.model,
            messages: conversation,
            signal: controller.signal,
            onDelta: (chunk) => {
              const visible = streamer.feed(chunk)
              if (visible && settings.streamResponses) {
                emitSafe({ type: 'delta', messageId: request.messageId, text: visible })
              }
            }
          })

        let retried = false
        for (;;) {
          try {
            raw = await attempt()
            break
          } catch (error) {
            // A truncated stream from a flaky free endpoint is worth one retry.
            const retryable =
              !retried && error instanceof ProviderError && !controller.signal.aborted && stepIndex === 0
            if (!retryable) throw error
            retried = true
            console.warn('[agent] retrying after provider error:', (error as Error).message)
          }
        }

        if (looksTruncated(raw)) {
          steps.push({
            id: randomUUID(),
            at: Date.now(),
            type: 'note',
            name: 'truncated',
            result: 'The model stopped mid-block; asking it to continue.'
          })
        }

        const { prose, actions, errors } = parseActions(raw)
        if (prose) proseParts.push(prose)
        proseAll = proseParts.join('\n\n')

        for (const message of errors) {
          const step: AgentStep = { id: randomUUID(), at: Date.now(), type: 'error', result: message }
          steps.push(step)
          emitSafe({ type: 'step', messageId: request.messageId, step })
        }

        if (actions.length === 0) break

        conversation.push({ role: 'assistant', content: raw })

        const resultLines: string[] = []
        for (const action of actions) {
          const started = Date.now()
          try {
            const outcome = await tools.run(action.tool, action.args, {
              projectId: request.projectId,
              sessionId: request.sessionId,
              config: {
                reviewChanges: settings.reviewChanges,
                autoApproveScripts: settings.autoApproveScripts,
                autoApproveLuau: settings.autoApproveLuau
              }
            })

            const step: AgentStep = {
              id: randomUUID(),
              at: started,
              type: 'tool',
              name: action.tool,
              args: action.args,
              result: outcome.summary,
              ok: true,
              changeIds: outcome.change ? [outcome.change.id] : undefined
            }
            steps.push(step)
            emitSafe({ type: 'step', messageId: request.messageId, step })
            if (outcome.change) {
              emitSafe({ type: 'change', messageId: request.messageId, change: outcome.change })
            }

            resultLines.push(
              `<result tool="${action.tool}">\n${JSON.stringify(outcome.data, null, 2).slice(0, 6000)}\n</result>`
            )
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            const step: AgentStep = {
              id: randomUUID(),
              at: started,
              type: 'error',
              name: action.tool,
              args: action.args,
              result: message,
              ok: false
            }
            steps.push(step)
            emitSafe({ type: 'step', messageId: request.messageId, step })
            resultLines.push(`<result tool="${action.tool}" error="true">\n${message}\n</result>`)
          }
        }

        conversation.push({
          role: 'user',
          content: `<tool-results>\n${resultLines.join('\n')}\n</tool-results>\n\nContinue. If the task is complete, reply with a short summary and no action blocks.`
        })
      }

      emitSafe({ type: 'done', messageId: request.messageId, content: proseAll || 'Done.', steps })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[agent] run failed:', message)
      emitSafe({
        type: 'error',
        messageId: request.messageId,
        message
      })
    } finally {
      this.runs.delete(request.runId)
    }
  }
}

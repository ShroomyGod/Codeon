import { app, ipcMain, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import type {
  AgentEvent,
  ChatMessage,
  ChatRequest,
  McpToolDef,
  OutputLine,
  Project,
  Session,
  Settings,
  SettingsView,
  StudioInfo,
  StudioStatus
} from '../shared/types'
import { PROVIDERS, getProvider } from '../shared/providers'
import type { Agent } from './ai/agent'
import { listModels } from './ai/client'
import type { ToolRunner } from './ai/tools'
import type { ChangeService } from './changes'
import { createProject, type Store } from './store'
import type { StudioMcpClient } from './studio/mcp'
import {
  createInstanceDirect,
  deleteInstanceDirect,
  fetchGameTree,
  fetchInstance,
  fetchSelection,
  fetchStudioState,
  readScriptSource,
  setPlayState,
  setPropertyDirect
} from './studio/queries'

export interface IpcDeps {
  store: Store
  mcp: StudioMcpClient
  changes: ChangeService
  tools: ToolRunner
  agent: Agent
  emit: (channel: string, payload: unknown) => void
  resourcesDir: string
}

/** Strips secrets before settings cross into the renderer. */
function toSettingsView(settings: Settings): SettingsView {
  const providers: SettingsView['providers'] = {}
  for (const [id, value] of Object.entries(settings.providers)) {
    providers[id] = { hasKey: Boolean(value.apiKey), baseUrl: value.baseUrl, model: value.model }
  }
  return { ...settings, providers }
}

export function registerIpc(deps: IpcDeps): void {
  const { store, mcp, changes, agent, emit } = deps

  const saveSession = (
    projectId: string,
    sessionId: string,
    mutate: (session: Session) => void
  ): Project | undefined =>
    store.updateProject(projectId, (project) => {
      const session = project.sessions.find((entry) => entry.id === sessionId)
      if (!session) throw new Error(`Unknown session ${sessionId}`)
      mutate(session)
      session.updatedAt = Date.now()
    })

  /* ---------------------------------------------------------------- */
  /* App + settings                                                    */
  /* ---------------------------------------------------------------- */

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
    userData: app.getPath('userData'),
    resourcesDir: deps.resourcesDir,
    repoUrl: 'https://github.com/ShroomyGod/Codeon',
    studioDocsUrl: 'https://create.roblox.com/docs/studio/mcp',
    providers: PROVIDERS
  }))

  ipcMain.handle('settings:get', () => toSettingsView(store.settings))

  ipcMain.handle('settings:update', async (_event, patch: Partial<Settings>) => {
    const next = { ...patch }
    // Provider entries carry API keys, so a general settings patch cannot
    // clobber them — keys are only written through `settings:setProviderKey`.
    delete next.providers

    const launcherChanged =
      'mcpLauncherOverride' in next && next.mcpLauncherOverride !== store.settings.mcpLauncherOverride

    const settings = store.updateSettings(next)
    emit('settings:changed', toSettingsView(settings))

    if (launcherChanged) {
      mcp.refreshLauncher()
      void mcp.restart().catch((error) => {
        console.warn('[studio] reconnect after launcher change failed:', error instanceof Error ? error.message : error)
      })
    }
    return toSettingsView(settings)
  })

  ipcMain.handle(
    'settings:setProviderKey',
    (_event, payload: { providerId: string; apiKey?: string; baseUrl?: string; model?: string }) => {
      if (!getProvider(payload.providerId)) throw new Error(`Unknown provider ${payload.providerId}`)
      const entry = { ...(store.settings.providers[payload.providerId] ?? {}) }
      if (payload.apiKey !== undefined) {
        if (payload.apiKey === '') delete entry.apiKey
        else entry.apiKey = payload.apiKey.trim()
      }
      if (payload.baseUrl !== undefined) entry.baseUrl = payload.baseUrl.trim() || undefined
      if (payload.model !== undefined) entry.model = payload.model.trim() || undefined
      const settings = store.updateSettings({
        providers: { ...store.settings.providers, [payload.providerId]: entry }
      })
      emit('settings:changed', toSettingsView(settings))
      return toSettingsView(settings)
    }
  )

  /* ---------------------------------------------------------------- */
  /* Projects + sessions                                               */
  /* ---------------------------------------------------------------- */

  ipcMain.handle('projects:list', () => store.projects)

  ipcMain.handle('projects:create', (_event, payload: { name: string; description?: string }) => {
    const project = createProject(payload.name, payload.description ?? '')
    store.saveProject(project)
    emit('projects:changed', store.projects)
    return project
  })

  ipcMain.handle('projects:save', (_event, project: Project) => {
    const saved = store.saveProject(project)
    emit('projects:changed', store.projects)
    return saved
  })

  ipcMain.handle('projects:delete', (_event, id: string) => {
    const removed = store.deleteProject(id)
    emit('projects:changed', store.projects)
    return removed
  })

  ipcMain.handle('sessions:create', (_event, payload: { projectId: string; title?: string }) => {
    const now = Date.now()
    const session: Session = {
      id: randomUUID(),
      title: payload.title?.trim() || `Session ${new Date(now).toLocaleString()}`,
      createdAt: now,
      updatedAt: now,
      messages: [],
      changeIds: []
    }
    const project = store.updateProject(payload.projectId, (draft) => {
      draft.sessions.push(session)
      draft.activeSessionId = session.id
    })
    emit('projects:changed', store.projects)
    return project
  })

  ipcMain.handle('sessions:delete', (_event, payload: { projectId: string; sessionId: string }) => {
    const project = store.updateProject(payload.projectId, (draft) => {
      draft.sessions = draft.sessions.filter((session) => session.id !== payload.sessionId)
      if (draft.sessions.length === 0) {
        const now = Date.now()
        draft.sessions.push({
          id: randomUUID(),
          title: 'Session 1',
          createdAt: now,
          updatedAt: now,
          messages: [],
          changeIds: []
        })
      }
      if (draft.activeSessionId === payload.sessionId) draft.activeSessionId = draft.sessions[0].id
    })
    emit('projects:changed', store.projects)
    return project
  })

  ipcMain.handle('sessions:select', (_event, payload: { projectId: string; sessionId: string }) => {
    const project = store.updateProject(payload.projectId, (draft) => {
      draft.activeSessionId = payload.sessionId
    })
    emit('projects:changed', store.projects)
    return project
  })

  ipcMain.handle(
    'sessions:appendMessage',
    (_event, payload: { projectId: string; sessionId: string; message: ChatMessage }) => {
      const project = saveSession(payload.projectId, payload.sessionId, (session) => {
        session.messages.push(payload.message)
        if (session.messages.filter((message) => message.role === 'user').length === 1) {
          session.title = payload.message.content.slice(0, 48).replace(/\s+/g, ' ').trim() || session.title
        }
      })
      emit('projects:changed', store.projects)
      return project
    }
  )

  ipcMain.handle(
    'sessions:updateMessage',
    (
      _event,
      payload: { projectId: string; sessionId: string; messageId: string; patch: Partial<ChatMessage> }
    ) => {
      const project = saveSession(payload.projectId, payload.sessionId, (session) => {
        const message = session.messages.find((entry) => entry.id === payload.messageId)
        if (message) Object.assign(message, payload.patch)
      })
      emit('projects:changed', store.projects)
      return project
    }
  )

  /* ---------------------------------------------------------------- */
  /* Change review                                                     */
  /* ---------------------------------------------------------------- */

  ipcMain.handle('changes:list', (_event, projectId?: string) =>
    store.changes.filter((change) => !projectId || change.projectId === projectId)
  )

  ipcMain.handle('changes:apply', async (_event, id: string) => changes.apply(id))
  ipcMain.handle('changes:applyMany', async (_event, ids: string[]) => changes.applyMany(ids))
  ipcMain.handle('changes:reject', (_event, id: string) => changes.reject(id))

  /* ---------------------------------------------------------------- */
  /* Studio attachment                                                 */
  /* ---------------------------------------------------------------- */

  ipcMain.handle('studio:status', (): StudioStatus => mcp.currentStatus)

  ipcMain.handle('studio:refresh', async (): Promise<StudioStatus> => {
    try {
      await mcp.ensureStarted()
      await mcp.refreshStudios()
      await mcp.refreshState()
      await mcp.pollConsole()
    } catch (error) {
      emit('studio:status', { ...mcp.currentStatus, lastError: error instanceof Error ? error.message : String(error) })
    }
    return mcp.currentStatus
  })

  ipcMain.handle('studio:studios', (): StudioInfo[] => mcp.currentStatus.studios)

  ipcMain.handle('studio:select', async (_event, id: string) => {
    mcp.selectStudio(id)
    await mcp.refreshState().catch(() => undefined)
    await mcp.pollConsole().catch(() => undefined)
    return mcp.currentStatus
  })

  ipcMain.handle('studio:tools', (): McpToolDef[] => mcp.toolDefinitions)

  ipcMain.handle(
    'studio:tree',
    async (
      _event,
      payload: {
        path?: string
        maxDepth?: number
        instanceType?: string
        keywords?: string
        headLimit?: number
      }
    ) =>
      fetchGameTree(mcp, {
        path: payload?.path,
        maxDepth: payload?.maxDepth ?? 3,
        instanceType: payload?.instanceType,
        keywords: payload?.keywords,
        headLimit: payload?.headLimit
      })
  )

  ipcMain.handle('studio:instance', async (_event, payload: { path: string }) =>
    fetchInstance(mcp, payload.path)
  )

  ipcMain.handle('studio:readScript', async (_event, payload: { path: string }) => {
    const source = await readScriptSource(mcp, payload.path)
    return { path: payload.path, source }
  })

  ipcMain.handle(
    'studio:writeScript',
    async (_event, payload: { path: string; source: string; className?: string }) => {
      // Replacing the whole file via one exact-match edit: the old_string is read
      // from Studio itself, so the match is guaranteed to be exact.
      let current: string | null = null
      try {
        current = await readScriptSource(mcp, payload.path)
      } catch {
        current = null
      }
      const args: Record<string, unknown> = {
        file_path: payload.path,
        edits: [{ old_string: current ?? '', new_string: payload.source }],
        datamodel_type: 'Edit'
      }
      if (current === null && payload.className) args.className = payload.className
      const result = await mcp.callTool('multi_edit', args)
      return { text: result.text }
    }
  )

  ipcMain.handle(
    'studio:setProperty',
    async (_event, payload: { path: string; property: string; value: string }) => ({
      text: await setPropertyDirect(mcp, payload)
    })
  )

  ipcMain.handle(
    'studio:createInstance',
    async (
      _event,
      payload: { parent: string; className: string; name: string; properties?: Record<string, string> }
    ) => ({ text: await createInstanceDirect(mcp, payload) })
  )

  ipcMain.handle('studio:deleteInstance', async (_event, payload: { path: string }) => ({
    text: await deleteInstanceDirect(mcp, payload.path)
  }))

  ipcMain.handle('studio:selection', async () => ({ paths: await fetchSelection(mcp) }))

  ipcMain.handle('studio:state', async () => fetchStudioState(mcp))

  ipcMain.handle('studio:console', async (): Promise<OutputLine[]> => {
    const lines = await mcp.pollConsole().catch(() => [])
    return lines.length ? lines : mcp.consoleLines
  })

  ipcMain.handle('studio:playtest', async (_event, payload: { action: 'start' | 'stop' }) => {
    const text = await setPlayState(mcp, payload.action === 'start')
    await mcp.refreshState().catch(() => undefined)
    return { text }
  })

  /* ---------------------------------------------------------------- */
  /* Agent                                                             */
  /* ---------------------------------------------------------------- */

  ipcMain.handle('agent:run', async (_event, request: ChatRequest) => {
    // Fire and forget: progress arrives on the `agent:event` channel.
    void agent.run(request)
    return { accepted: true }
  })

  ipcMain.handle('agent:cancel', (_event, runId: string) => {
    agent.cancel(runId)
    return true
  })

  /* ---------------------------------------------------------------- */
  /* Models + shell                                                    */
  /* ---------------------------------------------------------------- */

  ipcMain.handle('models:list', async (_event, payload: { providerId: string }) => {
    const provider = getProvider(payload.providerId)
    if (!provider) throw new Error(`Unknown provider ${payload.providerId}`)
    const saved = store.settings.providers[payload.providerId] ?? {}
    return listModels(saved.baseUrl || provider.baseUrl, saved.apiKey ?? '', provider.kind)
  })

  ipcMain.handle('shell:openPath', async (_event, target: string) => {
    const error = await shell.openPath(target)
    return error || null
  })

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    await shell.openExternal(url)
    return true
  })
}

export type EmitFn = (event: AgentEvent) => void

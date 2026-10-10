import { create } from 'zustand'
import type {
  AgentEvent,
  AgentStep,
  Change,
  ChatMessage,
  InspectResult,
  OutputLine,
  Project,
  SettingsView,
  StudioInfo,
  StudioStatus
} from '@shared/types'
import { buildGameTree, childTree, graftChildren, indexTree, type TreeNode } from '@shared/gametree'
import { PROVIDERS, getProvider } from '@shared/providers'
import type { AppInfo } from '@shared/ipc'
import { events, invoke } from './api'

/**
 * How many children to ask for when a row is opened. Studio caps its listing, and
 * one instance rarely holds more than this, but the cap is reported back so a
 * truncated row can say so instead of silently missing children.
 */
const childrenPageSize = 1000

export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export interface RunState {
  runId: string
  messageId: string
  text: string
  steps: AgentStep[]
  changeIds: string[]
}

/** Views that live in the left column. */
export type LeftViewTab = 'explorer' | 'playtest'
/** Views that live in the middle column. */
export type MainViewTab = 'code' | 'properties'
export type InspectorTab = LeftViewTab | MainViewTab

export const LEFT_VIEW_TABS: LeftViewTab[] = ['explorer', 'playtest']
export const MAIN_VIEW_TABS: MainViewTab[] = ['code', 'properties']

/** True for the views the left column owns. */
export function isLeftView(tab: InspectorTab): tab is LeftViewTab {
  return tab === 'explorer' || tab === 'playtest'
}

export interface EditorBuffer {
  path: string
  className: string
  source: string
  original: string
  dirty: boolean
  loading: boolean
  error?: string
}

export interface Toast {
  id: string
  kind: 'info' | 'error' | 'success'
  message: string
}

/** One provider's live model catalog, as the provider itself reported it. */
export interface ModelCatalog {
  status: 'loading' | 'ready' | 'error'
  /** Model ids, empty until the first successful listing. */
  models: string[]
  error?: string
  at: number
}

interface AppState {
  ready: boolean
  bootError?: string
  info: AppInfo | null
  settings: SettingsView | null
  projects: Project[]
  activeProjectId?: string
  activeSessionId?: string
  studio: StudioStatus | null
  studios: StudioInfo[]
  output: OutputLine[]
  changes: Change[]
  runs: Record<string, RunState>
  selection: string[]

  /** Active view in the left column (Explorer, Playtest). */
  leftTab: LeftViewTab
  /** Active view in the middle column (Code, Properties). */
  mainTab: MainViewTab
  tree: TreeNode[] | null
  treeTruncated: boolean
  /** Rows whose children are being read from Studio right now. */
  loadingChildren: Record<string, boolean>
  treeLoading: boolean
  treeError?: string
  expanded: Record<string, boolean>
  selectedPath?: string
  instance: InspectResult | null
  instanceLoading: boolean
  instanceError?: string
  editor: EditorBuffer | null
  playtestRunning: boolean
  composerDraft: string
  toasts: Toast[]
  modelCatalog: Record<string, ModelCatalog>

  init: () => Promise<void>
  refreshProjects: () => Promise<void>
  refreshChanges: () => Promise<void>
  refreshStudio: () => Promise<void>
  refreshStudios: () => Promise<void>
  selectStudio: (id: string) => Promise<void>

  createProject: (name: string, description?: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  selectProject: (id: string) => void
  createSession: () => Promise<void>
  selectSession: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  renameProject: (id: string, name: string) => Promise<void>

  send: (text: string) => Promise<void>
  cancelRun: () => Promise<void>
  setDraft: (value: string) => void

  setTab: (tab: InspectorTab) => void
  setExpanded: (path: string, open: boolean) => void
  loadChildren: (path: string) => Promise<void>
  loadTree: (opts?: { root?: string; depth?: number; classFilter?: string; keywords?: string }) => Promise<void>
  selectPath: (path: string, className?: string) => Promise<void>
  openScript: (path: string, className?: string) => Promise<void>
  updateEditorSource: (source: string) => void
  saveEditor: () => Promise<void>
  closeEditor: () => void

  saveProperty: (path: string, property: string, value: string) => Promise<void>
  createInstance: (input: {
    parent: string
    className: string
    name: string
    properties?: Record<string, string>
  }) => Promise<void>
  deleteInstance: (path: string) => Promise<void>
  pullSelection: () => Promise<void>

  startPlaytest: () => Promise<void>
  stopPlaytest: () => Promise<void>
  clearOutput: () => Promise<void>

  updateSettings: (patch: Record<string, unknown>) => Promise<void>
  setProviderKey: (payload: {
    providerId: string
    apiKey?: string
    baseUrl?: string
    model?: string
  }) => Promise<void>
  loadModels: (providerId: string, opts?: { refresh?: boolean }) => Promise<void>
  loadAllModels: (opts?: { refresh?: boolean }) => Promise<void>

  pushToast: (kind: Toast['kind'], message: string) => void
  dismissToast: (id: string) => void
}

const MAX_OUTPUT = 600

/** Electron wraps IPC failures, which is noise in a one-line hint. */
function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']*':\s*(\w*Error:\s*)?/, '')
}

export const useStore = create<AppState>((set, get) => ({
  ready: false,
  info: null,
  settings: null,
  projects: [],
  studio: null,
  studios: [],
  output: [],
  changes: [],
  runs: {},
  selection: [],
  leftTab: 'explorer',
  mainTab: 'code',
  tree: null,
  treeTruncated: false,
  treeLoading: false,
  expanded: {},
  loadingChildren: {},
  instance: null,
  instanceLoading: false,
  editor: null,
  playtestRunning: false,
  composerDraft: '',
  toasts: [],
  modelCatalog: {},

  async init() {
    try {
      const [info, settings, projects, changes, output, studio, studios] = await Promise.all([
        invoke('app:info'),
        invoke('settings:get'),
        invoke('projects:list'),
        invoke('changes:list', undefined),
        invoke('studio:console'),
        invoke('studio:status'),
        invoke('studio:studios')
      ])
      const activeProject = projects[0]
      set({
        info,
        settings,
        projects,
        changes,
        output,
        studio,
        studios,
        ready: true,
        activeProjectId: activeProject?.id,
        activeSessionId: activeProject?.activeSessionId ?? activeProject?.sessions[0]?.id
      })

      events.onAgent((event) => void handleAgentEvent(event, set, get))
      events.onStudioStatus((status) => {
        set({ studio: status, studios: status.studios })
        // Populate the explorer the first time a place becomes available, so the
        // tree is not empty until the user thinks to press Refresh.
        const state = get()
        if (status.connected && state.tree === null && !state.treeLoading && !state.treeError) {
          void state.loadTree({ depth: 2 })
        }
      })
      events.onStudioConsole((lines) =>
        set((state) => {
          const known = new Set(state.output.map((line) => line.id))
          const fresh = lines.filter((line) => !known.has(line.id))
          if (fresh.length === 0) return {}
          return { output: [...state.output, ...fresh].slice(-MAX_OUTPUT) }
        })
      )
      events.onChanges((change) =>
        set((state) => {
          const index = state.changes.findIndex((entry) => entry.id === change.id)
          if (index < 0) return { changes: [...state.changes, change] }
          const next = [...state.changes]
          next[index] = change
          return { changes: next }
        })
      )
      events.onProjects((projectsList) => {
        set({ projects: projectsList })
        const { activeProjectId } = get()
        if (activeProjectId && !projectsList.some((project) => project.id === activeProjectId)) {
          const first = projectsList[0]
          set({
            activeProjectId: first?.id,
            activeSessionId: first?.activeSessionId ?? first?.sessions[0]?.id
          })
        }
      })
      events.onSettings((next) => set({ settings: next }))
    } catch (error) {
      set({ bootError: error instanceof Error ? error.message : String(error), ready: true })
    }
  },

  async refreshProjects() {
    set({ projects: await invoke('projects:list') })
  },

  async refreshChanges() {
    set({ changes: await invoke('changes:list', undefined) })
  },

  async refreshStudio() {
    try {
      const studio = await invoke('studio:refresh')
      set({ studio, studios: studio.studios })
      if (studio.connected && !studio.lastError) await get().loadTree({ depth: 2 })
    } catch (error) {
      get().pushToast('error', error instanceof Error ? error.message : String(error))
    }
  },

  async refreshStudios() {
    const studios = await invoke('studio:studios')
    set({ studios })
  },

  async selectStudio(id) {
    const studio = await invoke('studio:select', id)
    set({ studio, studios: studio.studios, instance: null, tree: null })
    if (studio.connected) await get().loadTree({ depth: 2 })
  },

  async createProject(name, description) {
    const project = await invoke('projects:create', { name, description })
    set((state) => ({
      projects: [...state.projects, project],
      activeProjectId: project.id,
      activeSessionId: project.sessions[0]?.id
    }))
    get().pushToast('success', `Created "${project.name}"`)
  },

  async deleteProject(id) {
    await invoke('projects:delete', id)
    const projects = get().projects.filter((project) => project.id !== id)
    set({
      projects,
      activeProjectId: projects[0]?.id,
      activeSessionId: projects[0]?.activeSessionId ?? projects[0]?.sessions[0]?.id
    })
  },

  selectProject(id) {
    const project = get().projects.find((entry) => entry.id === id)
    if (!project) return
    set({ activeProjectId: id, activeSessionId: project.activeSessionId ?? project.sessions[0]?.id })
  },

  async createSession() {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    await invoke('sessions:create', { projectId: activeProjectId })
    const projects = await invoke('projects:list')
    const project = projects.find((entry) => entry.id === activeProjectId)
    set({ projects, activeSessionId: project?.activeSessionId })
  },

  async selectSession(id) {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    await invoke('sessions:select', { projectId: activeProjectId, sessionId: id })
    set({ activeSessionId: id })
    const projects = await invoke('projects:list')
    set({ projects })
  },

  async deleteSession(id) {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    const project = await invoke('sessions:delete', { projectId: activeProjectId, sessionId: id })
    set((state) => ({
      projects: state.projects.map((entry) => (entry.id === project.id ? project : entry)),
      activeSessionId: project.activeSessionId
    }))
  },

  async renameProject(id, name) {
    const project = get().projects.find((entry) => entry.id === id)
    if (!project) return
    const saved = await invoke('projects:save', { ...project, name })
    set((state) => ({ projects: state.projects.map((entry) => (entry.id === id ? saved : entry)) }))
  },

  async send(text) {
    const { activeProjectId, activeSessionId, settings, projects } = get()
    if (!activeProjectId || !activeSessionId || !text.trim()) return
    const project = projects.find((entry) => entry.id === activeProjectId)
    if (!project) return

    const userMessage: ChatMessage = {
      id: uuid(),
      role: 'user',
      content: text.trim(),
      createdAt: Date.now()
    }
    const assistantId = uuid()
    const runId = uuid()
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      providerId: settings?.activeProviderId,
      model: settings?.activeModel,
      pending: true,
      steps: []
    }

    set({ composerDraft: '' })
    await invoke('sessions:appendMessage', { projectId: activeProjectId, sessionId: activeSessionId, message: userMessage })
    await invoke('sessions:appendMessage', {
      projectId: activeProjectId,
      sessionId: activeSessionId,
      message: assistantMessage
    })
    await get().refreshProjects()

    set((state) => ({
      runs: {
        ...state.runs,
        [assistantId]: { runId, messageId: assistantId, text: '', steps: [], changeIds: [] }
      }
    }))

    const context = get().editor?.path
    await invoke('agent:run', {
      projectId: activeProjectId,
      sessionId: activeSessionId,
      runId,
      messageId: assistantId,
      prompt: text.trim(),
      context
    })
  },

  async cancelRun() {
    const runs = Object.values(get().runs)
    for (const run of runs) await invoke('agent:cancel', run.runId)
  },

  setDraft(value) {
    set({ composerDraft: value })
  },

  // One entry point for every "open this view" caller: the tab picks its column.
  setTab(tab) {
    set(isLeftView(tab) ? { leftTab: tab } : { mainTab: tab })
  },

  setExpanded(path, open) {
    const { tree, loadingChildren } = get()
    set((state) => ({ expanded: { ...state.expanded, [path]: open } }))
    if (!open) return
    // A listing only goes as deep as it was asked for, so an opened row that
    // nobody has read yet asks Studio for its children rather than staying shut.
    const node = tree ? indexTree(tree).get(path) : undefined
    if (node && !node.childrenLoaded && !loadingChildren[path]) void get().loadChildren(path)
  },

  async loadChildren(path) {
    const { studio, loadingChildren, tree } = get()
    if (!studio?.connected || loadingChildren[path]) return
    set((state) => ({ loadingChildren: { ...state.loadingChildren, [path]: true } }))
    try {
      const result = await invoke('studio:tree', {
        path,
        maxDepth: 1,
        headLimit: childrenPageSize
      })
      const children = childTree(result.nodes, path, result.truncated ? undefined : 1)
      if (children && get().tree) {
        set((state) =>
          state.tree
            ? { tree: graftChildren(state.tree, path, children, result.truncated) }
            : {}
        )
      } else if (!children && tree) {
        // Studio reported no children, so the row is a leaf from here on.
        set((state) =>
          state.tree ? { tree: graftChildren(state.tree, path, [], false) } : {}
        )
      }
    } catch (error) {
      get().pushToast(
        'error',
        `Could not read the children of ${path}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    } finally {
      set((state) => {
        const next = { ...state.loadingChildren }
        delete next[path]
        return { loadingChildren: next }
      })
    }
  },

  async loadTree(opts) {
    const { studio } = get()
    if (!studio?.connected) {
      set({ treeError: 'Studio is not attached yet.', treeLoading: false })
      return
    }
    set({ treeLoading: true, treeError: undefined })
    try {
      const depth = opts?.depth ?? 3
      const result = await invoke('studio:tree', {
        path: opts?.root,
        maxDepth: depth,
        instanceType: opts?.classFilter,
        keywords: opts?.keywords
      })
      set({
        tree: buildGameTree(result.nodes, {
          loadedDepths: result.truncated ? undefined : depth
        }),
        treeTruncated: result.truncated,
        treeLoading: false
      })
    } catch (error) {
      set({ treeError: error instanceof Error ? error.message : String(error), treeLoading: false })
    }
  },

  async selectPath(path, className) {
    set({ selectedPath: path })
    const { studio } = get()
    if (!studio?.connected) {
      set({ instanceError: 'Studio is not attached yet.', instance: null })
      return
    }
    set({ instanceLoading: true, instanceError: undefined })
    try {
      const instance = await invoke('studio:instance', { path })
      set({ instance, instanceLoading: false })
      if (isScriptClass(instance.className || className || '')) {
        // Scripts open in the code tab automatically — that is what users want.
        void get().openScript(path, instance.className)
      }
    } catch (error) {
      set({
        instanceError: error instanceof Error ? error.message : String(error),
        instanceLoading: false
      })
    }
  },

  async openScript(path, className) {
    const known =
      className ?? get().instance?.className ?? classNameFromTree(get().tree, path) ?? 'Script'
    set({
      editor: { path, className: known, source: '', original: '', dirty: false, loading: true }
    })
    try {
      const result = await invoke('studio:readScript', { path })
      set((state) => ({
        editor: state.editor
          ? {
              ...state.editor,
              className: known,
              source: result.source ?? '',
              original: result.source ?? '',
              dirty: false,
              loading: false
            }
          : null
      }))
    } catch (error) {
      set((state) => ({
        editor: state.editor
          ? { ...state.editor, loading: false, error: error instanceof Error ? error.message : String(error) }
          : null
      }))
    }
  },

  updateEditorSource(source) {
    set((state) => (state.editor ? { editor: { ...state.editor, source, dirty: source !== state.editor.original } } : {}))
  },

  async saveEditor() {
    const { editor } = get()
    if (!editor) return
    try {
      await invoke('studio:writeScript', { path: editor.path, source: editor.source })
      set({ editor: { ...editor, original: editor.source, dirty: false } })
      get().pushToast('success', `Saved ${editor.path}`)
      void get().refreshChanges()
    } catch (error) {
      get().pushToast('error', error instanceof Error ? error.message : String(error))
    }
  },

  closeEditor() {
    set({ editor: null })
  },

  async saveProperty(path, property, value) {
    try {
      await invoke('studio:setProperty', { path, property, value })
      const instance = await invoke('studio:instance', { path })
      set({ instance })
      get().pushToast('success', `Set ${property}`)
    } catch (error) {
      get().pushToast('error', error instanceof Error ? error.message : String(error))
    }
  },

  async createInstance(input) {
    try {
      await invoke('studio:createInstance', input)
      get().pushToast('success', `Created ${input.className} "${input.name}"`)
      const parent = input.parent.includes('/')
        ? input.parent.slice(0, input.parent.lastIndexOf('/'))
        : ''
      await get().loadTree({ root: parent || undefined, depth: 3 })
    } catch (error) {
      get().pushToast('error', error instanceof Error ? error.message : String(error))
    }
  },

  async deleteInstance(path) {
    try {
      await invoke('studio:deleteInstance', { path })
      get().pushToast('success', `Deleted ${path}`)
      set({ instance: null, selectedPath: undefined })
      await get().loadTree({ depth: 3 })
    } catch (error) {
      get().pushToast('error', error instanceof Error ? error.message : String(error))
    }
  },

  async pullSelection() {
    try {
      const result = await invoke('studio:selection')
      set({ selection: result.paths })
      const first = result.paths[0]
      if (first) await get().selectPath(first)
    } catch (error) {
      get().pushToast('error', error instanceof Error ? error.message : String(error))
    }
  },

  async startPlaytest() {
    try {
      await invoke('studio:playtest', { action: 'start' })
      set({ playtestRunning: true, leftTab: 'playtest' })
      get().pushToast('success', 'Playtest started (Run mode)')
    } catch (error) {
      get().pushToast('error', error instanceof Error ? error.message : String(error))
    }
  },

  async stopPlaytest() {
    try {
      await invoke('studio:playtest', { action: 'stop' })
      set({ playtestRunning: false })
      get().pushToast('success', 'Playtest stopped')
    } catch (error) {
      get().pushToast('error', error instanceof Error ? error.message : String(error))
    }
  },

  // The console buffer lives in the main process; clearing is a local view reset
  // so previously captured lines do not come back on the next poll.
  async clearOutput() {
    set({ output: [] })
  },

  async updateSettings(patch) {
    const settings = await invoke('settings:update', patch)
    set({ settings })
  },

  async setProviderKey(payload) {
    const settings = await invoke('settings:setProviderKey', payload)
    set({ settings })
  },

  /**
   * Ask a provider which models it offers. The result is cached until a refresh
   * is asked for, so opening the picker repeatedly costs one request per run.
   */
  async loadModels(providerId, opts) {
    const provider = getProvider(providerId)
    if (!provider?.baseUrl || provider.liveModels === false) return

    const cached = get().modelCatalog[providerId]
    if (!opts?.refresh && (cached?.status === 'ready' || cached?.status === 'loading')) return

    set((state) => ({
      modelCatalog: {
        ...state.modelCatalog,
        [providerId]: {
          status: 'loading',
          models: cached?.models ?? [],
          at: cached?.at ?? Date.now()
        }
      }
    }))

    try {
      const models = await invoke('models:list', { providerId })
      set((state) => ({
        modelCatalog: {
          ...state.modelCatalog,
          [providerId]: { status: 'ready', models, at: Date.now() }
        }
      }))
    } catch (error) {
      // A provider that needs a key before it lists anything is the common case,
      // so record the reason instead of shouting about it.
      set((state) => ({
        modelCatalog: {
          ...state.modelCatalog,
          [providerId]: {
            status: 'error',
            models: cached?.models ?? [],
            error: readableError(error),
            at: Date.now()
          }
        }
      }))
    }
  },

  async loadAllModels(opts) {
    await Promise.all(PROVIDERS.map((provider) => get().loadModels(provider.id, opts)))
  },

  pushToast(kind, message) {
    const id = uuid()
    set((state) => ({ toasts: [...state.toasts, { id, kind, message }] }))
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 9000 : 4500)
  },

  dismissToast(id) {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
  }
}))

function isScriptClass(className: string): boolean {
  return className === 'Script' || className === 'LocalScript' || className === 'ModuleScript'
}

/** Looks a class name up in the loaded tree when the caller did not supply one. */
function classNameFromTree(tree: TreeNode[] | null, path: string): string | undefined {
  if (!tree) return undefined
  let found: string | undefined
  const walk = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      if (node.fullPath === path) {
        found = node.className
        return
      }
      if (found) return
      walk(node.children)
    }
  }
  walk(tree)
  return found
}

type SetState = (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void
type GetState = () => AppState

async function handleAgentEvent(event: AgentEvent, set: SetState, get: GetState): Promise<void> {
  const patchRun = (mutate: (run: RunState) => RunState) => {
    set((state) => {
      const run = state.runs[event.messageId]
      if (!run) return {}
      return { runs: { ...state.runs, [event.messageId]: mutate(run) } }
    })
  }

  switch (event.type) {
    case 'start':
      return

    case 'delta':
      patchRun((run) => ({ ...run, text: run.text + event.text }))
      return

    case 'step':
      patchRun((run) => ({ ...run, steps: [...run.steps, event.step] }))
      return

    case 'change':
      patchRun((run) => ({ ...run, changeIds: [...run.changeIds, event.change.id] }))
      return

    case 'done': {
      const state = get()
      const run = state.runs[event.messageId]
      const projectId = state.activeProjectId
      if (projectId && run) {
        const sessionId = state.activeSessionId
        if (sessionId) {
          await invoke('sessions:updateMessage', {
            projectId,
            sessionId,
            messageId: event.messageId,
            patch: { content: event.content, steps: event.steps, pending: false }
          })
        }
      }
      set((current) => {
        const next = { ...current.runs }
        delete next[event.messageId]
        return { runs: next }
      })
      await get().refreshProjects()
      await get().refreshChanges()
      return
    }

    case 'error': {
      const state = get()
      const projectId = state.activeProjectId
      const sessionId = state.activeSessionId
      if (projectId && sessionId) {
        await invoke('sessions:updateMessage', {
          projectId,
          sessionId,
          messageId: event.messageId,
          patch: { content: event.message, pending: false, errored: true }
        })
      }
      set((current) => {
        const next = { ...current.runs }
        delete next[event.messageId]
        return { runs: next }
      })
      await get().refreshProjects()
      return
    }

    default:
      return
  }
}

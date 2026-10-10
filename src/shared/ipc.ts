import type {
  AgentEvent,
  Change,
  ChatMessage,
  ChatRequest,
  GameTreeResult,
  InspectResult,
  McpToolDef,
  OutputLine,
  Project,
  ProviderDef,
  Settings,
  SettingsView,
  StudioInfo,
  StudioStatus
} from './types'

/** Every channel the renderer may invoke. Anything else is refused. */
export const INVOKE_CHANNELS = [
  'app:info',
  'settings:get',
  'settings:update',
  'settings:setProviderKey',
  'projects:list',
  'projects:create',
  'projects:save',
  'projects:delete',
  'sessions:create',
  'sessions:delete',
  'sessions:select',
  'sessions:appendMessage',
  'sessions:updateMessage',
  'changes:list',
  'changes:apply',
  'changes:applyMany',
  'changes:reject',
  'studio:status',
  'studio:refresh',
  'studio:studios',
  'studio:select',
  'studio:tools',
  'studio:tree',
  'studio:instance',
  'studio:readScript',
  'studio:writeScript',
  'studio:setProperty',
  'studio:createInstance',
  'studio:deleteInstance',
  'studio:selection',
  'studio:state',
  'studio:console',
  'studio:playtest',
  'agent:run',
  'agent:cancel',
  'models:list',
  'shell:openPath',
  'shell:openExternal'
] as const

/** Channels the main process pushes to the renderer. */
export const EVENT_CHANNELS = [
  'agent:event',
  'studio:status',
  'studio:console',
  'changes:changed',
  'projects:changed',
  'settings:changed'
] as const

export type InvokeChannel = (typeof INVOKE_CHANNELS)[number]
export type EventChannel = (typeof EVENT_CHANNELS)[number]

export interface AppInfo {
  version: string
  platform: string
  isPackaged: boolean
  userData: string
  resourcesDir: string
  repoUrl: string
  /** Roblox's own documentation for enabling the Studio MCP server. */
  studioDocsUrl: string
  providers: ProviderDef[]
}

export interface AppApi {
  invoke<T = unknown>(channel: InvokeChannel, payload?: unknown): Promise<T>
  on(channel: EventChannel, listener: (payload: unknown) => void): () => void
}

export interface StudioStateSummary {
  mode?: string
  available: string[]
  raw: string
}

/** Payload/response types for each channel. */
export interface ApiMap {
  'app:info': { request: void; response: AppInfo }
  'settings:get': { request: void; response: SettingsView }
  'settings:update': { request: Partial<Settings>; response: SettingsView }
  'settings:setProviderKey': {
    request: { providerId: string; apiKey?: string; baseUrl?: string; model?: string }
    response: SettingsView
  }
  'projects:list': { request: void; response: Project[] }
  'projects:create': { request: { name: string; description?: string }; response: Project }
  'projects:save': { request: Project; response: Project }
  'projects:delete': { request: string; response: boolean }
  'sessions:create': { request: { projectId: string; title?: string }; response: Project }
  'sessions:delete': { request: { projectId: string; sessionId: string }; response: Project }
  'sessions:select': { request: { projectId: string; sessionId: string }; response: Project }
  'sessions:appendMessage': {
    request: { projectId: string; sessionId: string; message: ChatMessage }
    response: Project
  }
  'sessions:updateMessage': {
    request: { projectId: string; sessionId: string; messageId: string; patch: Partial<ChatMessage> }
    response: Project
  }
  'changes:list': { request: string | undefined; response: Change[] }
  'changes:apply': { request: string; response: Change }
  'changes:applyMany': { request: string[]; response: Change[] }
  'changes:reject': { request: string; response: Change }
  'studio:status': { request: void; response: StudioStatus }
  'studio:refresh': { request: void; response: StudioStatus }
  'studio:studios': { request: void; response: StudioInfo[] }
  'studio:select': { request: string; response: StudioStatus }
  'studio:tools': { request: void; response: McpToolDef[] }
  'studio:tree': {
    request: {
      path?: string
      maxDepth?: number
      instanceType?: string
      keywords?: string
      /** Rows to ask for before Studio truncates its answer. */
      headLimit?: number
    }
    response: GameTreeResult
  }
  'studio:instance': { request: { path: string }; response: InspectResult }
  'studio:readScript': { request: { path: string }; response: { path: string; source: string } }
  'studio:writeScript': {
    request: { path: string; source: string; className?: string }
    response: { text: string }
  }
  'studio:setProperty': {
    request: { path: string; property: string; value: string }
    response: { text: string }
  }
  'studio:createInstance': {
    request: { parent: string; className: string; name: string; properties?: Record<string, string> }
    response: { text: string }
  }
  'studio:deleteInstance': { request: { path: string }; response: { text: string } }
  'studio:selection': { request: void; response: { paths: string[] } }
  'studio:state': { request: void; response: StudioStateSummary }
  'studio:console': { request: void; response: OutputLine[] }
  'studio:playtest': { request: { action: 'start' | 'stop' }; response: { text: string } }
  'agent:run': { request: ChatRequest; response: { accepted: boolean } }
  'agent:cancel': { request: string; response: boolean }
  'models:list': { request: { providerId: string }; response: string[] }
  'shell:openPath': { request: string; response: string | null }
  'shell:openExternal': { request: string; response: boolean }
}

export type AgentEventListener = (event: AgentEvent) => void

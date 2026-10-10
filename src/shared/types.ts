/**
 * Types shared by the main process, preload bridge and renderer.
 * Keep this file dependency-free — it is imported from every context.
 */

/* ------------------------------------------------------------------ */
/* AI providers                                                        */
/* ------------------------------------------------------------------ */

export type ProviderKind = 'openai' | 'anthropic' | 'google'

export interface ProviderModel {
  id: string
  label: string
  /** Marks a model that costs nothing on the provider's free tier. */
  free?: boolean
  contextWindow?: number
  notes?: string
}

export interface ProviderDef {
  id: string
  label: string
  kind: ProviderKind
  baseUrl: string
  defaultModel: string
  /**
   * Models to show before (or instead of) a live catalog. Never the whole
   * story: the picker lists what the provider itself reports.
   */
  models: ProviderModel[]
  /**
   * False when `GET /models` describes more than this entry can actually run —
   * OpenCode Zen answers with its whole paid catalog even for the keyless
   * tier, so that entry keeps its hand-picked list instead.
   */
  liveModels?: boolean
  /** false for endpoints that work without an account (local, OpenCode Zen). */
  requiresKey: boolean
  keyLabel?: string
  /** Where the user creates a key. */
  keyUrl?: string
  docsUrl?: string
  local?: boolean
  /** Short hint shown under the provider picker. */
  notes?: string
}

export interface ProviderSettings {
  apiKey?: string
  /** Overrides the catalog base URL (required for the `custom` provider). */
  baseUrl?: string
  /** Overrides the catalog default model. */
  model?: string
}

export interface ProviderSettingsView {
  hasKey: boolean
  baseUrl?: string
  model?: string
}

/** Settings as the renderer sees them — API keys never cross the bridge. */
export type SettingsView = Omit<Settings, 'providers'> & {
  providers: Record<string, ProviderSettingsView>
}

export interface Settings {
  activeProviderId: string
  activeModel: string
  providers: Record<string, ProviderSettings>
  theme: 'dark' | 'light'
  /** Overrides the auto-detected Roblox Studio MCP launcher command line. */
  mcpLauncherOverride?: string
  /** Review script edits and Luau execution before they reach Studio. */
  reviewChanges: boolean
  autoApproveScripts: boolean
  autoApproveLuau: boolean
  maxAgentSteps: number
  /** Stream partial assistant text into the chat. */
  streamResponses: boolean
  /**
   * Show the engine and Studio services the Explorer hides by default, as
   * Studio's own "Show Hidden Objects in Explorer" does.
   */
  showInternalServices: boolean
  telemetry: false
}

/* ------------------------------------------------------------------ */
/* Projects, sessions, chat                                            */
/* ------------------------------------------------------------------ */

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool'

export interface AgentStep {
  id: string
  at: number
  type: 'tool' | 'note' | 'error'
  name?: string
  args?: unknown
  result?: string
  ok?: boolean
  /** Changes produced by this step, if any. */
  changeIds?: string[]
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  providerId?: string
  model?: string
  steps?: AgentStep[]
  pending?: boolean
  errored?: boolean
}

export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  changeIds: string[]
}

export interface ProjectFile {
  /** Instance path inside the DataModel, e.g. `ServerScriptService/Main`. */
  path: string
  className: string
  source: string
  updatedAt: number
}

export interface Project {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
  placeName?: string
  placeId?: number
  sessions: Session[]
  activeSessionId?: string
  files: ProjectFile[]
  /** Instances the explorer has seen, cached for offline browsing. */
  instanceSnapshot?: GameTreeNode[]
  color: string
}

/* ------------------------------------------------------------------ */
/* Change review                                                       */
/* ------------------------------------------------------------------ */

export type ChangeKind = 'script' | 'property' | 'create' | 'delete' | 'run'

export type ChangeStatus = 'pending' | 'accepted' | 'rejected' | 'failed'

export interface Change {
  id: string
  projectId: string
  sessionId: string
  kind: ChangeKind
  /** Instance path the change targets. */
  target: string
  property?: string
  before?: string
  after?: string
  status: ChangeStatus
  createdAt: number
  resolvedAt?: number
  note?: string
  error?: string
  /** True when the change was produced outside the review queue (auto mode). */
  appliedAutomatically?: boolean
  /**
   * The Studio MCP tool and arguments replayed when this change is accepted.
   * Storing them means review shows a real diff and acceptance is exact.
   */
  tool?: string
  toolArgs?: Record<string, unknown>
  /** Text Studio returned when the change was applied. */
  result?: string
}

/* ------------------------------------------------------------------ */
/* Studio attachment                                                   */
/* ------------------------------------------------------------------ */

/** One open Roblox Studio window, as reported by `list_roblox_studios`. */
export interface StudioInfo {
  id: string
  name: string
  placeId?: number
}

/**
 * Attachment state. Codeon talks to Studio's own MCP server, so "connected"
 * means the MCP handshake is done, not that a place is open.
 */
export interface StudioStatus {
  /** The Roblox-shipped MCP launcher was found on this machine. */
  mcpAvailable: boolean
  connected: boolean
  launcher?: string
  mcpVersion?: string
  protocolVersion?: string
  toolCount: number
  studios: StudioInfo[]
  activeStudioId?: string
  /** `Edit`, `Play` … as reported by get_studio_state. */
  mode?: string
  availableDatamodelTypes: string[]
  rawState?: string
  lastError?: string
  lastSeen?: number
}

/** A tool advertised by Studio's MCP server. */
export interface McpToolDef {
  name: string
  description?: string
  inputSchema?: {
    type?: string
    properties?: Record<string, { type?: string; description?: string; enum?: string[] }>
    required?: string[]
  }
}

/** One row of `search_game_tree`, which returns a flat list. */
export interface GameTreeNode {
  fullPath: string
  name: string
  className: string
  parentName?: string
}

export interface GameTreeResult {
  nodes: GameTreeNode[]
  truncated: boolean
}

/** Parsed `inspect_instance` payload. */
export interface InspectResult {
  path: string
  name: string
  className: string
  uniqueId?: string
  properties: Record<string, unknown>
  /** Set when the property list could not be read at all, so the panel can say why. */
  propertiesError?: string
  children?: {
    immediateChildren?: { path: string; className: string }[]
    totalDescendants?: number
    childrenCount?: number
  }
}

export type OutputLevel = 'print' | 'info' | 'warn' | 'error' | 'debug'

export interface OutputLine {
  id: string
  level: OutputLevel
  message: string
  at: number
  source?: string
}

export interface PlaytestState {
  running: boolean
  startedAt?: number
  /** `run` (server simulation) or `play` (client). */
  mode?: 'run' | 'play'
  lastError?: string
}

/* ------------------------------------------------------------------ */
/* Agent streaming events                                              */
/* ------------------------------------------------------------------ */

export type AgentEvent =
  | { type: 'start'; messageId: string; runId: string }
  | { type: 'delta'; messageId: string; text: string }
  | { type: 'step'; messageId: string; step: AgentStep }
  | { type: 'change'; messageId: string; change: Change }
  | { type: 'done'; messageId: string; content: string; steps: AgentStep[] }
  | { type: 'error'; messageId: string; message: string }

export interface ChatRequest {
  projectId: string
  sessionId: string
  runId: string
  messageId: string
  prompt: string
  /** Extra context assembled by the renderer (selection, open file, ...). */
  context?: string
}

/* ------------------------------------------------------------------ */
/* Agent tools                                                         */
/* ------------------------------------------------------------------ */

/**
 * The agent's tools are not a fixed catalog: they are whatever Studio's MCP
 * server advertises at runtime, plus Codeon's own helpers. See
 * `LOCAL_TOOLS` in `src/main/ai/tools.ts` — anything handled there goes through
 * the review queue, and everything else is a pass-through to Roblox's tool.
 */

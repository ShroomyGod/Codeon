import { EventEmitter } from 'node:events'
import { spawn, type ChildProcess } from 'node:child_process'
import type { McpToolDef, OutputLevel, OutputLine, StudioInfo, StudioStatus } from '../../shared/types'
import { describeMissingLauncher, resolveMcpLauncher, type McpLauncher } from './launcher'

/** Protocol revisions we can speak, newest first. */
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

const INIT_TIMEOUT_MS = 20000
const DEFAULT_CALL_TIMEOUT_MS = 120000
const STUDIO_POLL_MS = 3000
const CONSOLE_POLL_MS = 3000
const STDERR_RING = 40

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
  method: string
}

export interface ToolCallResult {
  /** Concatenated text content of the tool result. */
  text: string
  /** Parsed JSON when the whole text body is JSON, otherwise null. */
  json: unknown
  isError: boolean
}

export interface StudioMcpOptions {
  /** Overrides the auto-detected launcher command line. */
  launcherOverride?: string
  /** Injectable for tests. */
  spawnImpl?: typeof spawn
  platform?: NodeJS.Platform
  localAppData?: string
  /** Milliseconds between `list_roblox_studios` polls while running. */
  pollMs?: number
  /** Milliseconds between studio console polls while running. */
  consolePollMs?: number
}

/**
 * Client for Roblox Studio's built-in MCP server.
 *
 * The server is a local process that Studio itself ships, so there is nothing
 * to install into Studio: the app spawns the launcher, performs the MCP
 * handshake over stdio, and then talks JSON-RPC to the user's live place.
 */
export class StudioMcpClient extends EventEmitter {
  private child: ChildProcess | null = null
  private starting: Promise<void> | null = null
  private readonly pending = new Map<number, PendingRequest>()
  private readonly stderrRing: string[] = []
  private stdoutBuffer = ''
  private nextId = 1
  private tools: McpToolDef[] = []
  private studioPoll: NodeJS.Timeout | null = null
  private consolePoll: NodeJS.Timeout | null = null
  private consoleText = ''
  private stopping = false
  private status: StudioStatus

  constructor(private readonly options: StudioMcpOptions = {}) {
    super()
    this.status = {
      mcpAvailable: Boolean(this.launcher),
      connected: false,
      launcher: this.launcher?.display,
      toolCount: 0,
      studios: [],
      availableDatamodelTypes: []
    }
  }

  get launcher(): McpLauncher | null {
    return resolveMcpLauncher({
      platform: this.options.platform,
      localAppData: this.options.localAppData,
      override: this.options.launcherOverride
    })
  }

  get currentStatus(): StudioStatus {
    return { ...this.status, launcher: this.launcher?.display, mcpAvailable: Boolean(this.launcher) }
  }

  get toolDefinitions(): McpToolDef[] {
    return this.tools
  }

  get activeStudioId(): string | undefined {
    return this.status.activeStudioId
  }

  /** Re-reads the launcher (used after the user changes the override). */
  refreshLauncher(): void {
    this.setStatus({ mcpAvailable: Boolean(this.launcher), launcher: this.launcher?.display })
  }

  private setStatus(patch: Partial<StudioStatus>): void {
    this.status = { ...this.status, ...patch }
    this.emit('status', this.currentStatus)
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  /** Spawns the server if needed and completes the MCP handshake. */
  async ensureStarted(): Promise<void> {
    if (this.status.connected && this.child && !this.child.killed) return
    if (this.starting) return this.starting
    this.starting = this.start().finally(() => {
      this.starting = null
    })
    return this.starting
  }

  private async start(): Promise<void> {
    const launcher = this.launcher
    if (!launcher) {
      const message = describeMissingLauncher(this.options.platform)
      this.setStatus({ connected: false, mcpAvailable: false, lastError: message })
      throw new Error(message)
    }

    this.stopping = false
    this.stdoutBuffer = ''
    const spawnImpl = this.options.spawnImpl ?? spawn

    const child = spawnImpl(launcher.command, launcher.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
    this.child = child
    // Every handler ignores events from a process that is no longer the current
    // one. Without this, restarting would let the previous child's late `exit`
    // event tear down the connection that just replaced it.
    child.stdout?.on('data', (chunk: Buffer) => {
      if (this.child === child) this.consume(chunk.toString('utf8'))
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      if (this.child === child) this.recordStderr(chunk.toString('utf8'))
    })
    child.on('error', (error) => {
      if (this.child !== child) return
      this.handleExit(`Could not start the Studio MCP server: ${error.message}`)
    })
    child.on('exit', (code) => {
      if (this.child !== child) return
      if (!this.stopping) this.handleExit(`The Studio MCP server exited (code ${code ?? 'unknown'}).`)
    })

    this.setStatus({ launcher: launcher.display, mcpAvailable: true, lastError: undefined })

    const result = await this.handshake()
    this.setStatus({
      connected: true,
      mcpVersion: (result.serverInfo as { version?: string } | undefined)?.version,
      protocolVersion: result.protocolVersion,
      lastError: undefined,
      lastSeen: Date.now()
    })

    await this.refreshTools()
    await this.refreshStudios()
    this.startStudioPoll()
    this.startConsolePoll()
  }

  private async handshake(): Promise<{ serverInfo?: unknown; protocolVersion?: string }> {
    const clientInfo = { name: 'codeon', version: '1.0.0' }
    let lastError: Error | null = null

    for (const protocolVersion of PROTOCOL_VERSIONS) {
      try {
        const response = (await this.request(
          'initialize',
          { protocolVersion, capabilities: {}, clientInfo },
          INIT_TIMEOUT_MS
        )) as { serverInfo?: unknown; protocolVersion?: string }
        this.notify('notifications/initialized')
        return response ?? {}
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }
    throw new Error(
      `The Studio MCP server rejected every protocol version Codeon supports. ${lastError?.message ?? ''}`.trim()
    )
  }

  async stop(): Promise<void> {
    this.stopping = true
    this.clearPollers()
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Codeon shut the Studio connection down.'))
    }
    this.pending.clear()
    const child = this.child
    this.child = null
    if (child && !child.killed) {
      child.stdin?.end()
      child.kill()
    }
    this.setStatus({ connected: false, studios: [], activeStudioId: undefined, toolCount: 0 })
  }

  /** Restarts from scratch — used by the "Reconnect" button and Settings. */
  async restart(): Promise<void> {
    // `stop()` detaches the child before killing it, so the exit event it
    // produces is ignored by the handler above.
    await this.stop()
    this.starting = null
    await this.ensureStarted()
  }

  private clearPollers(): void {
    if (this.studioPoll) {
      clearInterval(this.studioPoll)
      this.studioPoll = null
    }
    if (this.consolePoll) {
      clearInterval(this.consolePoll)
      this.consolePoll = null
    }
  }

  private handleExit(reason: string): void {
    this.child = null
    const wasConnected = this.status.connected
    this.clearPollers()
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error(reason))
    }
    this.pending.clear()
    this.setStatus({
      connected: false,
      studios: [],
      activeStudioId: undefined,
      toolCount: this.tools.length,
      lastError: this.stderrRing.slice(-3).join(' ') || (wasConnected ? reason : undefined)
    })
    this.emit('disconnected', reason)
  }

  private recordStderr(text: string): void {
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      this.stderrRing.push(trimmed)
      if (this.stderrRing.length > STDERR_RING) this.stderrRing.shift()
    }
    this.emit('diagnostic', text)
  }

  /* ---------------------------------------------------------------- */
  /* JSON-RPC over stdio                                               */
  /* ---------------------------------------------------------------- */

  private consume(chunk: string): void {
    this.stdoutBuffer += chunk
    let index = this.stdoutBuffer.indexOf('\n')
    while (index !== -1) {
      const line = this.stdoutBuffer.slice(0, index).trim()
      this.stdoutBuffer = this.stdoutBuffer.slice(index + 1)
      if (line) this.handleLine(line)
      index = this.stdoutBuffer.indexOf('\n')
    }
  }

  private handleLine(line: string): void {
    let message: {
      id?: number
      method?: string
      result?: unknown
      error?: { code?: number; message?: string }
    }
    try {
      message = JSON.parse(line)
    } catch {
      // The server must not write non-JSON to stdout, but never crash on it.
      this.emit('diagnostic', line)
      return
    }

    if (message.method) {
      // Server-initiated notification.
      if (message.method === 'notifications/tools/list_changed') void this.refreshTools().catch(() => undefined)
      return
    }

    if (typeof message.id !== 'number') return
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    clearTimeout(pending.timer)

    if (message.error) {
      pending.reject(new Error(message.error.message ?? `MCP error ${message.error.code ?? ''}`.trim()))
    } else {
      pending.resolve(message.result)
    }
  }

  private write(payload: unknown): void {
    if (!this.child?.stdin || this.child.killed) throw new Error('The Studio MCP server is not running.')
    this.child.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  private request(method: string, params: unknown, timeoutMs = DEFAULT_CALL_TIMEOUT_MS): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(
          new Error(
            `${method} timed out after ${Math.round(timeoutMs / 1000)}s. Roblox Studio freezes while it runs code, so a long tool call can block the connection.`
          )
        )
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer, method })
      try {
        this.write({ jsonrpc: '2.0', id, method, params })
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private notify(method: string, params?: unknown): void {
    try {
      this.write({ jsonrpc: '2.0', method, params })
    } catch {
      /* a dead pipe is reported by the exit handler */
    }
  }

  /* ---------------------------------------------------------------- */
  /* Tools                                                             */
  /* ---------------------------------------------------------------- */

  async refreshTools(): Promise<McpToolDef[]> {
    const result = (await this.request('tools/list', {}, INIT_TIMEOUT_MS)) as { tools?: McpToolDef[] }
    this.tools = result?.tools ?? []
    this.setStatus({ toolCount: this.tools.length })
    this.emit('tools', this.tools)
    return this.tools
  }

  /**
   * Calls a Studio tool. `studio_id` is filled in from the active Studio
   * instance, because every Roblox tool requires it.
   */
  async callTool(
    name: string,
    args: Record<string, unknown> = {},
    options: { timeoutMs?: number; studioId?: string } = {}
  ): Promise<ToolCallResult> {
    await this.ensureStarted()

    const definition = this.tools.find((tool) => tool.name === name)
    // Only enforce this once a catalog was read, so a failed `tools/list` cannot
    // make every call look like an unknown tool.
    if (this.tools.length > 0 && !definition) {
      throw new Error(
        `Studio's MCP server does not offer a "${name}" tool. It may have changed in a Studio update.`
      )
    }
    const properties =
      (definition?.inputSchema as { properties?: Record<string, unknown> } | undefined)?.properties ?? {}
    const required = ((definition?.inputSchema as { required?: string[] } | undefined)?.required ?? []) as string[]

    const payload: Record<string, unknown> = { ...args }

    if (properties.studio_id && !payload.studio_id) {
      const studioId = options.studioId ?? (await this.resolveStudioId())
      if (!studioId) {
        throw new Error(
          'No Roblox Studio instance is attached. Open a place in Studio, then enable Studio as an MCP server in Assistant \u2192 Manage MCP Servers.'
        )
      }
      payload.studio_id = studioId
    }

    // Several tools need a datamodel to act on; Edit is the safe default.
    const datamodelSchema = properties.datamodel_type as { enum?: string[] } | undefined
    if (datamodelSchema && !payload.datamodel_type) {
      payload.datamodel_type = datamodelSchema.enum?.[0] ?? 'Edit'
    }

    for (const key of required) {
      if (payload[key] === undefined && key !== 'studio_id') {
        throw new Error(`The "${name}" tool needs a "${key}" argument.`)
      }
    }

    let raw: { content?: { type?: string; text?: string }[]; isError?: boolean }
    try {
      raw = (await this.request(
        'tools/call',
        { name, arguments: payload },
        options.timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS
      )) as typeof raw
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error))
    }

    const text = (raw?.content ?? [])
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n')

    if (raw?.isError) {
      throw new Error(text || `The "${name}" tool failed inside Roblox Studio.`)
    }

    this.setStatus({ lastSeen: Date.now() })
    return { text, json: tryParseJson(text), isError: false }
  }

  /** Strips the internal trace prefix Studio adds to some error messages. */
  static cleanError(message: string): string {
    return message.replace(/^[^\s:]+\.rbxm?[^\s:]*:\d+:\s*/, '').trim()
  }

  /* ---------------------------------------------------------------- */
  /* Studio instances                                                  */
  /* ---------------------------------------------------------------- */

  async refreshStudios(): Promise<StudioInfo[]> {
    const result = await this.callTool('list_roblox_studios')
    const studios = parseStudios(result)
    const active = this.status.activeStudioId
    const stillThere = studios.some((studio) => studio.id === active)
    this.setStatus({
      studios,
      activeStudioId: stillThere ? active : studios[0]?.id,
      lastSeen: Date.now()
    })
    return studios
  }

  private async resolveStudioId(): Promise<string | undefined> {
    if (this.status.activeStudioId) return this.status.activeStudioId
    const studios = await this.refreshStudios()
    return studios[0]?.id
  }

  selectStudio(id: string): void {
    if (!this.status.studios.some((studio) => studio.id === id)) return
    this.setStatus({ activeStudioId: id })
  }

  /** Reads play state and available datamodels for the active Studio. */
  async refreshState(): Promise<void> {
    const result = await this.callTool('get_studio_state')
    const mode = /Current Studio Mode:\s*(\w+)/i.exec(result.text)?.[1]
    const available = /Available DataModels:\s*(.+)/i.exec(result.text)?.[1]
    this.setStatus({
      mode,
      availableDatamodelTypes: available
        ? available
            .split(/[,\s]+/)
            .map((part) => part.trim())
            .filter(Boolean)
        : [],
      rawState: result.text
    })
  }

  private startStudioPoll(): void {
    if (this.studioPoll) return
    const interval = this.options.pollMs ?? STUDIO_POLL_MS
    this.studioPoll = setInterval(() => {
      if (!this.status.connected) return
      this.refreshStudios().catch((error) => {
        this.emit('diagnostic', `studio poll failed: ${error instanceof Error ? error.message : error}`)
      })
    }, interval)
    // Do not hold the event loop open because of the poller.
    this.studioPoll.unref?.()
  }

  /* ---------------------------------------------------------------- */
  /* Console output                                                    */
  /* ---------------------------------------------------------------- */

  /**
   * MCP has no console subscription, so the output log is polled. The whole
   * buffer is re-read each time and only emitted when it actually changes,
   * which keeps the UI identical to Studio's own Output window.
   */
  private startConsolePoll(): void {
    if (this.consolePoll) return
    this.consolePoll = setInterval(() => {
      void this.pollConsole().catch(() => undefined)
    }, this.options.consolePollMs ?? CONSOLE_POLL_MS)
    this.consolePoll.unref?.()
  }

  async pollConsole(): Promise<OutputLine[]> {
    if (!this.status.connected || this.status.studios.length === 0) return []
    try {
      const result = await this.callTool('get_console_output', {}, { timeoutMs: 15000 })
      if (result.text === this.consoleText) return []
      this.consoleText = result.text
      const lines = parseConsoleOutput(result.text)
      this.emit('console', lines)
      return lines
    } catch (error) {
      this.emit('diagnostic', `console poll failed: ${error instanceof Error ? error.message : error}`)
      return []
    }
  }

  get consoleLines(): OutputLine[] {
    return parseConsoleOutput(this.consoleText)
  }
}

/** Splits Studio's output log into level-tagged lines. */
export function parseConsoleOutput(text: string): OutputLine[] {
  const lines: OutputLine[] = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (!line.trim()) continue

    let at = Date.now()
    let message = line.trim()
    const stamp = /^\s*(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?\s+/.exec(raw)
    if (stamp) {
      const when = new Date()
      when.setHours(Number(stamp[1]), Number(stamp[2]), Number(stamp[3]), Number(stamp[4] ?? 0))
      at = when.getTime()
      message = raw.slice(stamp[0].length).trim()
    }
    if (!message) continue
    lines.push({ id: `console-${lines.length}-${at}`, level: consoleLevel(message), message, at })
  }
  return lines
}

function consoleLevel(message: string): OutputLevel {
  if (/Stack Begin|Stack End/.test(message)) return 'error'
  if (/^\s*(?:\[error\]|error\b)/i.test(message) || message.includes('\u2665')) return 'error'
  if (/^\s*(?:\[warn(?:ing)?\]|warning\b)/i.test(message)) return 'warn'
  return 'print'
}

export function parseStudios(result: ToolCallResult): StudioInfo[] {
  const payload = result.json as { studios?: unknown } | unknown[] | null
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { studios?: unknown }).studios)
      ? ((payload as { studios: unknown[] }).studios as unknown[])
      : []

  return list
    .map((entry) => {
      if (typeof entry === 'string') return { id: entry, name: entry }
      if (!entry || typeof entry !== 'object') return null
      const record = entry as Record<string, unknown>
      const id = String(record.id ?? record.studio_id ?? record.studioId ?? '')
      if (!id) return null
      const name = String(record.name ?? record.placeName ?? id)
      const placeId =
        typeof record.placeId === 'number'
          ? record.placeId
          : typeof record.place_id === 'number'
            ? record.place_id
            : Number(/placeId:\s*(\d+)/.exec(name)?.[1] ?? NaN)
      return { id, name, placeId: Number.isFinite(placeId) ? placeId : undefined }
    })
    .filter((entry): entry is StudioInfo => entry !== null)
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (!/^[[{"]/.test(trimmed)) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

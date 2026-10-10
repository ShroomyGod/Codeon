import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, it } from 'node:test'
import type { ChildProcess } from 'node:child_process'
import { StudioMcpClient } from '../src/main/studio/mcp'

interface Rpc {
  id?: number
  method?: string
  params?: { name?: string; arguments?: Record<string, unknown> }
}

const TOOLS = [
  { name: 'list_roblox_studios', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'get_studio_state',
    inputSchema: {
      type: 'object',
      properties: { studio_id: { type: 'string' }, datamodel_type: { enum: ['Edit', 'Play'] } },
      required: ['studio_id']
    }
  },
  {
    name: 'execute_luau',
    inputSchema: {
      type: 'object',
      properties: { studio_id: { type: 'string' }, code: { type: 'string' } },
      required: ['studio_id', 'code']
    }
  }
]

/**
 * A stand-in for Studio's MCP server: newline-delimited JSON-RPC on a pair of
 * streams. `exitDelayMs` controls whether `kill()` reports its exit immediately
 * or on a later tick, which is how the real child process behaves.
 */
class FakeServer extends EventEmitter {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  killed = false
  readonly calls: { name: string; args: Record<string, unknown> }[] = []
  private buffer = ''

  constructor(private readonly exitDelayMs = 0) {
    super()
    this.stdin.on('data', (chunk: Buffer) => this.consume(chunk.toString('utf8')))
  }

  kill(): boolean {
    if (this.killed) return false
    this.killed = true
    if (this.exitDelayMs > 0) setTimeout(() => this.emit('exit', 0), this.exitDelayMs)
    else this.emit('exit', 0)
    return true
  }

  private consume(chunk: string): void {
    this.buffer += chunk
    let index = this.buffer.indexOf('\n')
    while (index !== -1) {
      const line = this.buffer.slice(0, index).trim()
      this.buffer = this.buffer.slice(index + 1)
      if (line) this.handle(JSON.parse(line) as Rpc)
      index = this.buffer.indexOf('\n')
    }
  }

  private handle(message: Rpc): void {
    if (message.id === undefined) return // notification

    if (message.method === 'initialize') {
      this.reply(message.id, {
        result: {
          protocolVersion: '2025-06-18',
          serverInfo: { name: 'fake-studio-mcp', version: '9.9.9' },
          capabilities: {}
        }
      })
      return
    }

    if (message.method === 'tools/list') {
      this.reply(message.id, { result: { tools: TOOLS } })
      return
    }

    if (message.method === 'tools/call') {
      const name = message.params?.name ?? ''
      const args = message.params?.arguments ?? {}
      this.calls.push({ name, args })
      const text =
        name === 'list_roblox_studios'
          ? JSON.stringify({ studios: [{ id: 'studio-1', name: 'MyPlace', placeId: 7 }] })
          : `ran ${name}`
      this.reply(message.id, { result: { content: [{ type: 'text', text }] } })
      return
    }

    this.reply(message.id, { error: { code: -32601, message: `no method ${message.method}` } })
  }

  private reply(id: number, body: unknown): void {
    this.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, ...body })}\n`)
  }
}

function makeClient(options: { exitDelayMs?: number } = {}) {
  const servers: FakeServer[] = []
  const spawnImpl = (() => {
    const server = new FakeServer(options.exitDelayMs ?? 0)
    servers.push(server)
    return server as unknown as ChildProcess
  }) as unknown as typeof import('node:child_process').spawn
  const client = new StudioMcpClient({
    spawnImpl,
    pollMs: 1_000_000,
    consolePollMs: 1_000_000,
    launcherOverride: 'mcp.bat'
  })
  return { client, servers }
}

describe('StudioMcpClient', () => {
  it('performs the handshake and reads the advertised tool catalog', async () => {
    const { client } = makeClient()
    await client.ensureStarted()

    const status = client.currentStatus
    assert.equal(status.connected, true)
    assert.equal(status.protocolVersion, '2025-06-18')
    assert.equal(status.mcpVersion, '9.9.9')
    assert.equal(status.toolCount, TOOLS.length)
    assert.equal(client.toolDefinitions.length, TOOLS.length)
    assert.equal(status.mcpAvailable, true)
    await client.stop()
  })

  it('fills in studio_id and the default datamodel for tools that need them', async () => {
    const { client, servers } = makeClient()
    await client.ensureStarted()

    const result = await client.callTool('execute_luau', { code: 'return 1' })
    assert.equal(result.text, 'ran execute_luau')
    assert.equal(result.json, null)

    const call = servers[0].calls.find((entry) => entry.name === 'execute_luau')
    assert.equal(call?.args.studio_id, 'studio-1')
    assert.equal(call?.args.code, 'return 1')
    // `execute_luau` has no datamodel_type in this fake schema, so none is added.
    assert.equal(call?.args.datamodel_type, undefined)
    await client.stop()
  })

  it('discovers open Studio windows from list_roblox_studios', async () => {
    const { client } = makeClient()
    await client.ensureStarted()
    assert.deepEqual(client.currentStatus.studios, [{ id: 'studio-1', name: 'MyPlace', placeId: 7 }])
    assert.equal(client.activeStudioId, 'studio-1')
    await client.stop()
  })

  it('rejects a tool the server does not advertise', async () => {
    const { client } = makeClient()
    await client.ensureStarted()
    await assert.rejects(() => client.callTool('not_a_real_tool', {}), /does not offer a "not_a_real_tool" tool/)
    await client.stop()
  })

  it('reports a missing required argument before calling the server', async () => {
    const { client, servers } = makeClient()
    await client.ensureStarted()
    await assert.rejects(() => client.callTool('execute_luau', {}), /needs a "code" argument/)
    assert.equal(servers[0].calls.filter((entry) => entry.name === 'execute_luau').length, 0)
    await client.stop()
  })

  it('stays connected when the previous process exits late', async () => {
    // Regression: the child replaced by a restart used to report its exit a tick
    // later, which tore down the new connection.
    const { client, servers } = makeClient({ exitDelayMs: 10 })
    await client.ensureStarted()
    assert.equal(servers.length, 1)

    await client.restart()
    assert.equal(servers.length, 2)

    // Let the first child's delayed exit event land.
    await new Promise((resolve) => setTimeout(resolve, 40))

    assert.equal(client.currentStatus.connected, true)
    assert.equal(client.currentStatus.toolCount, TOOLS.length)
    await client.stop()
  })

  it('clears connection state on stop', async () => {
    const { client } = makeClient()
    await client.ensureStarted()
    await client.stop()
    assert.equal(client.currentStatus.connected, false)
    assert.deepEqual(client.currentStatus.studios, [])
  })
})

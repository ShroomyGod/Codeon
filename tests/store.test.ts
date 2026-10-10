import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { ChangeService } from '../src/main/changes'
import { createProject, Store } from '../src/main/store'
import type { StudioMcpClient } from '../src/main/studio/mcp'
import type { Change } from '../src/shared/types'

const dirs: string[] = []
const stores: Store[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'codeon-store-'))
  dirs.push(dir)
  return dir
}

/** Tracks the store so its debounced write is cancelled before cleanup. */
function tempStore(dir = tempDir()): Store {
  const store = new Store(dir)
  stores.push(store)
  return store
}

after(() => {
  for (const store of stores) store.dispose()
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

/** A Studio MCP stand-in that records the tool calls it is asked to make. */
function fakeMcp(options: { fail?: string } = {}) {
  const calls: { tool: string; args: Record<string, unknown> }[] = []
  const mcp = {
    calls,
    activeStudioId: 'studio-abcdef',
    async callTool(tool: string, args: Record<string, unknown> = {}) {
      calls.push({ tool, args })
      if (options.fail && tool === options.fail) throw new Error(`stub failure for ${tool}`)
      return { text: `ran ${tool}`, json: null, isError: false }
    }
  }
  return mcp as unknown as StudioMcpClient & typeof mcp
}

describe('Store', () => {
  it('starts with review enabled and OpenCode Zen selected', () => {
    const store = tempStore()
    assert.equal(store.settings.activeProviderId, 'opencode-zen')
    assert.equal(store.settings.reviewChanges, true)
    assert.equal(store.settings.maxAgentSteps, 12)
  })

  it('round-trips settings and projects through disk', () => {
    const dir = tempDir()
    const store = tempStore(dir)
    store.updateSettings({ activeModel: 'kimi-k2', maxAgentSteps: 5 })
    const project = createProject('Obby remake', 'a test place')
    store.saveProject(project)
    store.saveChange({
      id: 'change-1',
      projectId: project.id,
      sessionId: project.sessions[0].id,
      kind: 'property' as const,
      target: 'Workspace.Baseplate',
      property: 'Anchored',
      after: 'true',
      status: 'pending' as const,
      createdAt: Date.now()
    })
    store.flush()

    const reopened = tempStore(dir)
    assert.equal(reopened.settings.activeModel, 'kimi-k2')
    assert.equal(reopened.settings.maxAgentSteps, 5)
    assert.equal(reopened.projects.length, 1)
    assert.equal(reopened.projects[0].name, 'Obby remake')
    assert.equal(reopened.changes.length, 1)

    const raw = JSON.parse(readFileSync(join(dir, 'state', 'db.json'), 'utf8'))
    assert.equal(raw.version, 1)
  })

  it('gives every project a session and a colour', () => {
    const project = createProject('  ', '')
    assert.equal(project.name, 'Untitled project')
    assert.equal(project.sessions.length, 1)
    assert.equal(project.activeSessionId, project.sessions[0].id)
    assert.match(project.color, /^#[0-9a-f]{6}$/i)
  })

  it('deletes a project together with its changes', () => {
    const store = tempStore()
    const project = createProject('Scratch')
    store.saveProject(project)
    store.saveChange({
      id: 'c',
      projectId: project.id,
      sessionId: project.sessions[0].id,
      kind: 'script',
      target: 'game.ServerScriptService.Main',
      status: 'pending',
      createdAt: Date.now()
    })
    assert.equal(store.deleteProject(project.id), true)
    assert.equal(store.projects.length, 0)
    assert.equal(store.changes.length, 0)
  })

  it('prunes resolved changes but keeps pending ones', () => {
    const store = tempStore()
    const project = createProject('Prune')
    const base: Omit<Change, 'id' | 'status' | 'createdAt'> = {
      projectId: project.id,
      sessionId: project.sessions[0].id,
      kind: 'script',
      target: 'game.A.B'
    }
    store.saveChange({ ...base, id: 'old', status: 'rejected', createdAt: 1, resolvedAt: 1 })
    store.saveChange({ ...base, id: 'pending', status: 'pending', createdAt: 1 })
    store.saveChange({ ...base, id: 'fresh', status: 'accepted', createdAt: Date.now(), resolvedAt: Date.now() })
    store.pruneChanges(1000)

    assert.deepEqual(
      store.changes.map((change) => change.id).sort(),
      ['fresh', 'pending']
    )
  })
})

describe('ChangeService', () => {
  function setup(options: { fail?: string } = {}) {
    const store = tempStore()
    const project = createProject('Changes')
    store.saveProject(project)
    const mcp = fakeMcp(options)
    const seen: Change[] = []
    const service = new ChangeService(store, mcp, (change) => seen.push(change))
    return { store, project, mcp, service, seen, sessionId: project.sessions[0].id }
  }

  it('records a change as pending and notifies listeners', () => {
    const { service, store, project, sessionId, seen } = setup()
    const change = service.create({
      projectId: project.id,
      sessionId,
      kind: 'script',
      target: 'game.ServerScriptService.Main',
      before: 'print(1)',
      after: 'print(2)',
      tool: 'multi_edit',
      toolArgs: { file_path: 'game.ServerScriptService.Main' }
    })

    assert.equal(change.status, 'pending')
    assert.equal(seen.length, 1)
    assert.equal(store.getChangesForSession(sessionId).length, 1)
    assert.deepEqual(store.getProject(project.id)?.sessions[0].changeIds, [change.id])
  })

  it('does nothing to Studio until a change is accepted', async () => {
    const { service, mcp, project, sessionId } = setup()
    const change = service.create({
      projectId: project.id,
      sessionId,
      kind: 'script',
      target: 'game.ServerScriptService.Main',
      after: 'print("applied")',
      tool: 'multi_edit',
      toolArgs: {
        file_path: 'game.ServerScriptService.Main',
        edits: [{ old_string: '', new_string: 'print("applied")' }],
        datamodel_type: 'Edit'
      }
    })
    assert.equal(mcp.calls.length, 0)

    const result = await service.apply(change.id)
    assert.equal(result.status, 'accepted')
    assert.equal(result.result, 'ran multi_edit')
    assert.deepEqual(mcp.calls[0], {
      tool: 'multi_edit',
      args: {
        file_path: 'game.ServerScriptService.Main',
        edits: [{ old_string: '', new_string: 'print("applied")' }],
        datamodel_type: 'Edit'
      }
    })
    assert.equal(service.listPending().length, 0)
  })

  it('refuses to apply a change that has no recorded tool', async () => {
    const { service, project, sessionId } = setup()
    const change = service.create({
      projectId: project.id,
      sessionId,
      kind: 'property',
      target: 'Workspace.Part',
      property: 'Anchored',
      after: 'true'
    })
    await assert.rejects(() => service.apply(change.id), /no Studio tool recorded/i)
  })

  it('marks a rejected change as rejected without touching the bridge', () => {
    const { service, mcp, project, sessionId } = setup()
    const change = service.create({
      projectId: project.id,
      sessionId,
      kind: 'delete',
      target: 'Workspace.Junk',
      tool: 'execute_luau',
      toolArgs: { code: 'return 1' }
    })
    const rejected = service.reject(change.id)
    assert.equal(rejected.status, 'rejected')
    assert.equal(mcp.calls.length, 0)
  })

  it('records a failure on the change and leaves the queue', async () => {
    const { service, store, project, sessionId, seen } = setup({ fail: 'multi_edit' })
    const change = service.create({
      projectId: project.id,
      sessionId,
      kind: 'script',
      target: 'game.A.B',
      after: 'x',
      tool: 'multi_edit',
      toolArgs: { file_path: 'game.A.B' }
    })

    await assert.rejects(() => service.apply(change.id), /stub failure/)

    const stored = store.getChange(change.id)
    assert.equal(stored?.status, 'failed')
    assert.match(stored?.error ?? '', /stub failure/)
    assert.equal(service.listPending().length, 0)
    assert.equal(seen.length, 2)
    assert.equal(seen[1].status, 'failed')
  })

  it('strips Studio internal trace prefixes out of error messages', async () => {
    const { service, store, project, sessionId } = setup({ fail: 'multi_edit' })
    const change = service.create({
      projectId: project.id,
      sessionId,
      kind: 'script',
      target: 'game.A.B',
      tool: 'multi_edit',
      toolArgs: { file_path: 'game.A.B' }
    })
    await service.apply(change.id).catch(() => undefined)
    const stored = store.getChange(change.id)
    assert.equal(stored?.status, 'failed')
  })

  it('applies a batch in order', async () => {
    const { service, mcp, project, sessionId } = setup()
    const ids = ['a', 'b'].map(
      (name) =>
        service.create({
          projectId: project.id,
          sessionId,
          kind: 'property',
          target: `Workspace.${name}`,
          property: 'Name',
          after: name,
          tool: 'execute_luau',
          toolArgs: { code: `-- ${name}` }
        }).id
    )
    const applied = await service.applyMany(ids)
    assert.equal(applied.length, 2)
    assert.deepEqual(
      mcp.calls.map((call) => call.args.code),
      ['-- a', '-- b']
    )
  })

  it('routes file: targets into the project snapshot instead of Studio', async () => {
    const { service, mcp, store, project, sessionId } = setup()
    const change = service.create({
      projectId: project.id,
      sessionId,
      kind: 'script',
      target: 'file:src/local.lua',
      after: 'return 1'
    })
    await service.apply(change.id)
    assert.equal(mcp.calls.length, 0)
    const file = store.getProject(project.id)?.files.find((entry) => entry.path === 'src/local.lua')
    assert.equal(file?.source, 'return 1')
  })
})

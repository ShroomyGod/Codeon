import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { StudioMcpClient } from '../src/main/studio/mcp'
import { fetchInstance } from '../src/main/studio/queries'

/**
 * Studio's `inspect_instance` answers with `"properties":[]` — an empty array —
 * for services such as `Workspace` and `Lighting`, while ordinary instances get
 * a populated object. `fetchInstance` must fall back to a Luau property listing
 * for those instead of handing the panel nothing to show.
 */
function stubMcp(options: {
  inspect?: { json?: unknown; text?: string; isError?: boolean }
  luau?: { text?: string; isError?: boolean } | Error
} = {}): StudioMcpClient & { calls: { tool: string; args: Record<string, unknown> }[] } {
  const calls: { tool: string; args: Record<string, unknown> }[] = []
  const mcp = {
    calls,
    async callTool(tool: string, args: Record<string, unknown> = {}) {
      calls.push({ tool, args })
      if (tool === 'inspect_instance') {
        return {
          text: options.inspect?.text ?? '',
          json: options.inspect?.json ?? null,
          isError: options.inspect?.isError ?? false
        }
      }
      if (options.luau instanceof Error) throw options.luau
      return { text: options.luau?.text ?? '', json: null, isError: options.luau?.isError ?? false }
    }
  }
  return mcp as unknown as StudioMcpClient & typeof mcp
}

const SERVICE = {
  path: 'Workspace',
  name: 'Workspace',
  className: 'Workspace',
  properties: [],
  children: {
    immediateChildren: [{ path: 'Workspace.Baseplate', className: 'Part' }],
    childrenCount: 1,
    totalDescendants: 1
  }
}

describe('fetchInstance', () => {
  it('uses the properties inspect_instance reports for an ordinary instance', async () => {
    const mcp = stubMcp({
      inspect: { json: { path: 'Workspace.Baseplate', className: 'Part', properties: { Anchored: true } } }
    })
    const result = await fetchInstance(mcp, 'Workspace.Baseplate')
    assert.deepEqual(result.properties, { Anchored: true })
    assert.equal(result.propertiesError, undefined)
    assert.deepEqual(
      mcp.calls.map((call) => call.tool),
      ['inspect_instance'],
      'no Luau round trip when Studio already answered'
    )
  })

  it('falls back to a Luau listing for a service that reports no properties', async () => {
    const mcp = stubMcp({
      inspect: { json: SERVICE },
      luau: { text: 'Gravity\t75\nStreamingEnabled\ttrue\n@Tag\tvalue' }
    })
    const result = await fetchInstance(mcp, 'Workspace')
    assert.deepEqual(result.properties, {
      Gravity: '75',
      StreamingEnabled: 'true',
      '@Tag': 'value'
    })
    assert.equal(result.propertiesError, undefined)
    const luau = mcp.calls.find((call) => call.tool === 'execute_luau')
    assert.ok(luau, 'the fallback runs through execute_luau')
    assert.match(String(luau.args.code), /GetPropertiesOfClass/)
    assert.equal(luau.args.datamodel_type, 'Edit')
  })

  it('keeps the children listing from the fallback path', async () => {
    const mcp = stubMcp({ inspect: { json: SERVICE }, luau: { text: 'Gravity\t75' } })
    const result = await fetchInstance(mcp, 'Workspace')
    assert.deepEqual(result.children?.immediateChildren, [
      { path: 'Workspace.Baseplate', className: 'Part' }
    ])
    assert.equal(result.children?.childrenCount, 1)
  })

  it('says the read failed instead of reporting an empty instance', async () => {
    const mcp = stubMcp({
      inspect: { json: SERVICE },
      luau: new Error('Luau timed out')
    })
    const result = await fetchInstance(mcp, 'Workspace')
    assert.deepEqual(result.properties, {})
    assert.equal(result.propertiesError, 'Could not read properties from Studio: Luau timed out')
  })

  it('stays quiet when the Luau listing is genuinely empty', async () => {
    const mcp = stubMcp({ inspect: { json: SERVICE }, luau: { text: '' } })
    const result = await fetchInstance(mcp, 'Workspace')
    assert.deepEqual(result.properties, {})
    assert.equal(result.propertiesError, undefined)
  })

  it('still tries Luau for a non-service instance Studio answers thinly for', async () => {
    const mcp = stubMcp({
      inspect: { json: { path: 'Workspace.Thing', className: 'Folder', properties: {} } },
      luau: { text: 'Name\tThing' }
    })
    const result = await fetchInstance(mcp, 'Workspace.Thing')
    assert.deepEqual(result.properties, { Name: 'Thing' })
  })
})

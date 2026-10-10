import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { buildGameTree, childTree, graftChildren, indexTree } from '../src/shared/gametree'
import type { GameTreeNode } from '../src/shared/types'

/**
 * A place bigger than Studio's result limit: the listing covers the DataModel,
 * the services and their children, then stops — so `Workspace.FlameAura` is a
 * Model whose children nobody has read.
 */
const LISTED: GameTreeNode[] = [
  { fullPath: 'Place1', name: 'Place1', className: 'DataModel' },
  { fullPath: 'Workspace', name: 'Workspace', className: 'Workspace', parentName: 'Place1' },
  { fullPath: 'Workspace.Baseplate', name: 'Baseplate', className: 'Part', parentName: 'Workspace' },
  { fullPath: 'Workspace.FlameAura', name: 'FlameAura', className: 'Model', parentName: 'Workspace' }
]

/** What Studio answers for `search_game_tree({ path: 'Workspace.FlameAura', max_depth: 1 })`. */
const SCOPED: GameTreeNode[] = [
  { fullPath: 'Workspace.FlameAura', name: 'FlameAura', className: 'Model', parentName: 'Workspace' },
  { fullPath: 'Workspace.FlameAura.Head', name: 'Head', className: 'Part', parentName: 'FlameAura' },
  { fullPath: 'Workspace.FlameAura.Animate', name: 'Animate', className: 'LocalScript', parentName: 'FlameAura' }
]

const calls: { channel: string; payload: Record<string, unknown> }[] = []

// The renderer store reads the bridge when it is imported, so it is stubbed
// before the module is pulled in. Only `studio:tree` is answered here.
;(globalThis as { window?: unknown }).window = {
  codeon: {
    async invoke(channel: string, payload: Record<string, unknown> = {}) {
      calls.push({ channel, payload })
      if (channel === 'studio:tree') return { nodes: SCOPED, truncated: false }
      return undefined
    },
    on: () => () => undefined
  }
}

let useStore: typeof import('../src/renderer/src/store').useStore

before(async () => {
  useStore = (await import('../src/renderer/src/store')).useStore
})

async function settle(check: () => boolean, timeoutMs = 1000): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

function seed(): void {
  calls.length = 0
  useStore.setState({
    studio: { connected: true },
    tree: buildGameTree(LISTED, { loadedDepths: 2 }),
    expanded: {},
    loadingChildren: {}
  } as never)
}

function nodeAt(path: string) {
  const tree = useStore.getState().tree
  return tree ? indexTree(tree).get(path) : undefined
}

describe('lazy tree loading', () => {
  it('reads a model\'s children when its row is opened', async () => {
    seed()
    assert.equal(nodeAt('Workspace.FlameAura')?.childrenLoaded, false, 'edge of the listing')
    assert.deepEqual(nodeAt('Workspace.FlameAura')?.children, [])

    useStore.getState().setExpanded('Workspace.FlameAura', true)
    await settle(() => (nodeAt('Workspace.FlameAura')?.children.length ?? 0) > 0)

    const node = nodeAt('Workspace.FlameAura')
    assert.deepEqual(
      node?.children.map((child) => child.name),
      ['Head', 'Animate']
    )
    assert.equal(node?.childrenLoaded, true)
    assert.equal(useStore.getState().expanded['Workspace.FlameAura'], true)

    const fetch = calls.find((call) => call.channel === 'studio:tree')
    assert.ok(fetch, 'the row asked Studio for its children')
    assert.equal(fetch.payload.path, 'Workspace.FlameAura')
    assert.equal(fetch.payload.maxDepth, 1)
    assert.ok(
      Number(fetch.payload.headLimit) >= 400,
      'a scoped read asks for more than the truncated place listing'
    )
    assert.equal(useStore.getState().loadingChildren['Workspace.FlameAura'], undefined)
  })

  it('does not re-read a row whose children Studio already listed', async () => {
    seed()
    assert.equal(nodeAt('Workspace')?.childrenLoaded, true)

    useStore.getState().setExpanded('Workspace', true)
    await new Promise((resolve) => setTimeout(resolve, 20))

    assert.equal(nodeAt('Workspace')?.children.length, 2)
    assert.deepEqual(calls, [], 'no round trip for children already in hand')
  })

  it('never reads for a row that is being closed', async () => {
    seed()
    useStore.getState().setExpanded('Workspace.FlameAura', false)
    await new Promise((resolve) => setTimeout(resolve, 20))

    assert.deepEqual(calls, [])
    assert.equal(nodeAt('Workspace.FlameAura')?.childrenLoaded, false)
  })

  it('leaves the fetch out of the tree when Studio fails', async () => {
    seed()
    const failing = { ...(globalThis as unknown as { window: { codeon: { invoke: unknown } } }).window }
    const original = failing.codeon.invoke
    failing.codeon.invoke = async () => {
      throw new Error('Studio is busy')
    }
    useStore.getState().setExpanded('Workspace.FlameAura', true)
    await new Promise((resolve) => setTimeout(resolve, 20))

    assert.deepEqual(nodeAt('Workspace.FlameAura')?.children, [])
    assert.equal(useStore.getState().loadingChildren['Workspace.FlameAura'], undefined)
    assert.match(useStore.getState().toasts.at(-1)?.message ?? '', /Studio is busy/)
    failing.codeon.invoke = original
  })
})

describe('gametree: children in hand', () => {
  it('marks the rows a listing covered and leaves the edge unknown', () => {
    const tree = buildGameTree(LISTED, { loadedDepths: 2 })
    const byPath = indexTree(tree)
    assert.equal(byPath.get('Place1')?.childrenLoaded, true)
    assert.equal(byPath.get('Workspace')?.childrenLoaded, true)
    assert.equal(byPath.get('Workspace.FlameAura')?.childrenLoaded, false)
  })

  it('trusts nothing when Studio truncated the listing', () => {
    const tree = buildGameTree(LISTED)
    for (const node of indexTree(tree).values()) {
      assert.equal(node.childrenLoaded, undefined, `${node.fullPath} must stay unknown`)
    }
  })

  it('picks a row\'s children out of a scoped listing', () => {
    const children = childTree(SCOPED, 'Workspace.FlameAura', 1)
    assert.deepEqual(
      children?.map((child) => child.fullPath),
      ['Workspace.FlameAura.Head', 'Workspace.FlameAura.Animate']
    )
    assert.equal(childTree(SCOPED, 'Workspace.Nothing', 1), null)
  })

  it('accepts a listing that names descendants without the instance itself', () => {
    const children = childTree(SCOPED.slice(1), 'Workspace.FlameAura', 1)
    assert.deepEqual(
      children?.map((child) => child.name),
      ['Head', 'Animate']
    )
  })

  it('grafts one row\'s children without touching its siblings', () => {
    const before = buildGameTree(LISTED, { loadedDepths: 2 })
    const untouched = indexTree(before).get('Workspace.Baseplate')
    const grafted = graftChildren(before, 'Workspace.FlameAura', childTree(SCOPED, 'Workspace.FlameAura', 1) ?? [])
    const after = indexTree(grafted)

    assert.deepEqual(
      after.get('Workspace.FlameAura')?.children.map((child) => child.name),
      ['Head', 'Animate']
    )
    assert.equal(after.get('Workspace.FlameAura')?.childrenLoaded, true)
    assert.equal(after.get('Workspace.Baseplate'), untouched, 'sibling row keeps its identity')
    assert.equal(indexTree(before).get('Workspace.FlameAura')?.children.length, 0, 'input untouched')
  })

  it('marks a row Studio returned nothing for as a leaf', () => {
    const tree = buildGameTree(LISTED, { loadedDepths: 2 })
    const grafted = graftChildren(tree, 'Workspace.Baseplate', [])
    assert.equal(indexTree(grafted).get('Workspace.Baseplate')?.childrenLoaded, true)
  })
})

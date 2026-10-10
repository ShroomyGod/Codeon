import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildGameTree, countTree, filterTree, indexTree } from '../src/shared/gametree'
import { SERVICE_CLASSES } from '../src/shared/serviceClasses'
import { PLACE_SERVICES, hideInternalServices, isInternalService } from '../src/shared/services'
import type { GameTreeNode } from '../src/shared/types'

/** Copied from a real `search_game_tree` response. */
const REAL: GameTreeNode[] = [
  { fullPath: 'Place1', name: 'Place1', className: 'DataModel' },
  { parentName: 'Place1', fullPath: 'Workspace', name: 'Workspace', className: 'Workspace' },
  { parentName: 'Place1', fullPath: 'Run Service', name: 'Run Service', className: 'RunService' },
  { parentName: 'Place1', fullPath: 'SoundService', name: 'SoundService', className: 'SoundService' },
  { parentName: 'Workspace', fullPath: 'Workspace.Baseplate', name: 'Baseplate', className: 'Part' },
  { parentName: 'Workspace', fullPath: 'Workspace.Camera', name: 'Camera', className: 'Camera' },
  { parentName: 'Workspace', fullPath: 'Workspace.CloudAura', name: 'CloudAura', className: 'Model' },
  {
    parentName: 'Workspace.CloudAura',
    fullPath: 'Workspace.CloudAura.Animate',
    name: 'Animate',
    className: 'LocalScript'
  }
]

describe('buildGameTree', () => {
  it('nests children under their parent path', () => {
    const roots = buildGameTree(REAL)
    assert.equal(roots.length, 1)
    assert.equal(roots[0].className, 'DataModel')

    const workspace = roots[0].children.find((node) => node.name === 'Workspace')
    assert.ok(workspace, 'Workspace should be a child of the DataModel')
    assert.deepEqual(
      workspace.children.map((node) => node.name),
      ['Baseplate', 'Camera', 'CloudAura']
    )
  })

  it('nests grandchildren', () => {
    const roots = buildGameTree(REAL)
    const workspace = indexTree(roots).get('Workspace')
    const cloudAura = workspace?.children.find((node) => node.name === 'CloudAura')
    assert.equal(cloudAura?.children[0].name, 'Animate')
    assert.equal(cloudAura?.children[0].fullPath, 'Workspace.CloudAura.Animate')
  })

  it('promotes orphaned nodes to roots instead of dropping them', () => {
    // A truncated listing can contain a child whose parent was cut off.
    const truncated: GameTreeNode[] = [
      { fullPath: 'Workspace.Baseplate', name: 'Baseplate', className: 'Part' }
    ]
    const roots = buildGameTree(truncated)
    assert.equal(roots.length, 1)
    assert.equal(roots[0].fullPath, 'Workspace.Baseplate')
  })

  it('keeps every node exactly once', () => {
    const map = indexTree(buildGameTree(REAL))
    assert.equal(map.size, REAL.length)
  })

  it('handles an empty listing', () => {
    assert.deepEqual(buildGameTree([]), [])
  })
})

describe('filterTree', () => {
  const roots = buildGameTree(REAL)

  it('returns the tree untouched for a blank query', () => {
    assert.equal(filterTree(roots, ''), roots)
    assert.equal(filterTree(roots, '   '), roots)
  })

  it('keeps the ancestors of a deep match so the path is visible', () => {
    const filtered = filterTree(roots, 'animate')
    assert.equal(filtered.length, 1)
    // DataModel > Workspace > CloudAura > Animate
    const workspace = filtered[0].children.find((node) => node.name === 'Workspace')
    assert.ok(workspace, 'the chain to the match must survive')
    assert.deepEqual(workspace.children.map((node) => node.name), ['CloudAura'])
    assert.deepEqual(workspace.children[0].children.map((node) => node.name), ['Animate'])
  })

  it('keeps every child of a matching node', () => {
    const filtered = filterTree(roots, 'workspace')
    const workspace = filtered[0].children.find((node) => node.name === 'Workspace')
    assert.deepEqual(
      workspace?.children.map((node) => node.name),
      ['Baseplate', 'Camera', 'CloudAura']
    )
  })

  it('matches on class name as well as instance name', () => {
    const filtered = filterTree(roots, 'Camera')
    assert.equal(countTree(filtered), 3)
  })

  it('is case-insensitive and trims the query', () => {
    assert.equal(countTree(filterTree(roots, '  BASEPLATE ')), countTree(filterTree(roots, 'baseplate')))
  })

  it('returns nothing when there is no match', () => {
    assert.deepEqual(filterTree(roots, 'zzzz-nope'), [])
  })

  it('never invents or drops nodes on an exact-name query', () => {
    // A leaf match keeps only itself and the chain above it.
    assert.equal(countTree(filterTree(roots, 'Animate')), 4)
  })
})

describe('countTree', () => {
  it('counts every node', () => {
    assert.equal(countTree(buildGameTree(REAL)), REAL.length)
  })

  it('counts zero for an empty forest', () => {
    assert.equal(countTree([]), 0)
  })
})

describe('internal services', () => {
  /** The services a real place reports, headed by the plumbing that used to fill the Explorer. */
  const SERVICES: GameTreeNode[] = [
    { fullPath: 'Place1', name: 'Place1', className: 'DataModel' },
    ...[
      'Workspace',
      'NetworkClient',
      'StudioService',
      'ServiceVisibilityService',
      'ScriptDebuggerService',
      'DebuggerManager',
      'StudioTestService',
      'RemoteDebuggerServer',
      'TraceRouteService',
      'RunService',
      'Stats',
      'ContentProvider',
      'TweenService',
      'ReplicatedStorage',
      'ServerScriptService',
      'Lighting',
      'Teams',
      'Players'
    ].map((className) => ({
      parentName: 'Place1',
      fullPath: className,
      name: className,
      className
    })),
    { parentName: 'Workspace', fullPath: 'Workspace.Baseplate', name: 'Baseplate', className: 'Part' },
    // Studio's own Explorer bookkeeping: a DataModel child the engine gives no class.
    { parentName: 'Place1', fullPath: 'FilteredSelection', name: 'FilteredSelection', className: '' },
    { parentName: 'Place1', fullPath: 'ExplorerFilter', name: 'ExplorerFilter', className: 'Instance' }
  ]

  it('hides every service a place is not browsed for', () => {
    const kept = hideInternalServices(buildGameTree(SERVICES))
    const dataModel = kept.find((node) => node.className === 'DataModel')
    assert.deepEqual(
      dataModel?.children.map((node) => node.className),
      ['Workspace', 'ReplicatedStorage', 'ServerScriptService', 'Lighting', 'Teams', 'Players']
    )
  })

  it('hides engine services that are not Studio debuggers', () => {
    // The class of service the report was about: engine plumbing the DataModel
    // carries but Studio never lists.
    for (const name of ['RunService', 'Stats', 'ContentProvider', 'TweenService', 'NetworkClient']) {
      assert.ok(isInternalService(name), `${name} should be internal`)
    }
  })

  it('leaves the contents of a kept service alone', () => {
    const kept = hideInternalServices(buildGameTree(SERVICES))
    const workspace = indexTree(kept).get('Workspace')
    assert.deepEqual(
      workspace?.children.map((node) => node.name),
      ['Baseplate']
    )
  })

  it('filters a listing that carries no DataModel row, and keeps ordinary instances', () => {
    // A truncated listing starts at the service, and its roots can also be plain
    // instances, which must never be mistaken for services.
    const orphans = SERVICES.filter(
      (node) => node.className === 'Lighting' || node.className === 'RunService' || node.className === 'Part'
    )
    const kept = hideInternalServices(buildGameTree(orphans)).map((node) => node.className)
    assert.deepEqual(kept, ['Lighting', 'Part'])
  })

  it('shows everything again when asked', () => {
    const roots = buildGameTree(SERVICES)
    const shown = hideInternalServices(roots, true)
    assert.equal(shown, roots)
    assert.equal(countTree(shown), SERVICES.length)
  })

  it('returns the same array when nothing matched, so React sees no change', () => {
    const browsable = SERVICES.filter(
      (node) =>
        node.className === 'DataModel' || node.className === 'Part' || PLACE_SERVICES.has(node.className)
    )
    const roots = buildGameTree(browsable)
    assert.equal(hideInternalServices(roots), roots)
  })

  it('never hides something a place is browsed for', () => {
    // The guard that matters: naming one of these would hide real work.
    for (const name of [
      'Workspace',
      'Players',
      'Lighting',
      'MaterialService',
      'ReplicatedFirst',
      'ReplicatedStorage',
      'ServerScriptService',
      'ServerStorage',
      'StarterGui',
      'StarterPack',
      'StarterPlayer',
      'SoundService',
      'Teams',
      'TestService',
      'TextChatService',
      'LocalizationService',
      'HttpService'
    ]) {
      assert.ok(!isInternalService(name), `${name} must stay visible`)
    }
  })

  it('hides the services Studio keeps behind its own settings', () => {
    // Chat was replaced by TextChatService, Debris is engine bookkeeping, and
    // CoreGui and PluginGuiService are the two Studio has "Show … in Explorer"
    // settings for — the settings exist because the default is not to draw them.
    assert.ok(isInternalService('Chat'))
    assert.ok(isInternalService('Debris'))
    assert.ok(isInternalService('CoreGui'))
    assert.ok(isInternalService('PluginGuiService'))
    assert.ok(!isInternalService('TextChatService'))
    assert.ok(!isInternalService('ScriptEditorService'))
    assert.ok(!isInternalService('Packages'))
  })

  it('drops a plugin dock widget the listing promoted to a root', () => {
    // Real case: the Rojo plugin's dock widget arrives as a top-level
    // `DockWidgetPluginGui` row because its parent was not in the listing.
    const nodes: GameTreeNode[] = [
      { fullPath: 'Place1', name: 'Place1', className: 'DataModel' },
      { fullPath: 'Rojo 7.7.0', name: 'Rojo 7.7.0', className: 'DockWidgetPluginGui' },
      { fullPath: 'Workspace', name: 'Workspace', className: 'Workspace', parentName: 'Place1' }
    ]
    const kept = hideInternalServices(buildGameTree(nodes)).map((node) => node.name)
    assert.deepEqual(kept, ['Place1'])
    assert.equal(indexTree(hideInternalServices(buildGameTree(nodes))).get('Place1')?.children.length, 1)
  })

  it('drops a script-editor document that arrives as a root row', () => {
    // Real case: an open editor tab is listed as `StarterGui.CoreUi` of class
    // `ScriptDocument`, with no parent in the listing, so it became a root.
    const nodes: GameTreeNode[] = [
      { fullPath: 'Place1', name: 'Place1', className: 'DataModel' },
      { fullPath: 'StarterGui.CoreUi', name: 'StarterGui.CoreUi', className: 'ScriptDocument' },
      { fullPath: 'Workspace', name: 'Workspace', className: 'Workspace', parentName: 'Place1' }
    ]
    const kept = hideInternalServices(buildGameTree(nodes)).map((node) => node.name)
    assert.deepEqual(kept, ['Place1'])
  })

  it('never hides an ordinary instance', () => {
    for (const name of ['Part', 'Model', 'Script', 'Folder', 'DataModel', 'Humanoid']) {
      assert.ok(!isInternalService(name), `${name} is not a service`)
    }
  })

  it('drops the classless nodes Studio leaves on the DataModel', () => {
    const dataModel = hideInternalServices(buildGameTree(SERVICES)).find(
      (node) => node.className === 'DataModel'
    )
    const names = dataModel?.children.map((node) => node.name) ?? []
    assert.ok(!names.includes('FilteredSelection'), 'FilteredSelection should be hidden')
    assert.ok(!names.includes('ExplorerFilter'), 'ExplorerFilter should be hidden')
  })

  it('keeps a user instance that happens to share a service name', () => {
    // Inside a place an instance can be called anything; only its class decides.
    const nodes: GameTreeNode[] = [
      { fullPath: 'Place1', name: 'Place1', className: 'DataModel' },
      { parentName: 'Place1', fullPath: 'Workspace', name: 'Workspace', className: 'Workspace' },
      { parentName: 'Workspace', fullPath: 'Workspace.StudioService', name: 'StudioService', className: 'Folder' }
    ]
    const workspace = indexTree(hideInternalServices(buildGameTree(nodes))).get('Workspace')
    assert.deepEqual(
      workspace?.children.map((node) => node.name),
      ['StudioService']
    )
  })

  it('keeps the browsable list in step with the generated service classes', () => {
    // Cross-check against the generated set: a typo here would silently hide a
    // real service, so every entry has to be a class Roblox actually offers.
    assert.ok(PLACE_SERVICES.size > 15)
    for (const name of PLACE_SERVICES) {
      assert.ok(SERVICE_CLASSES.has(name), `${name} is not a service class in Roblox's API dump`)
    }
    assert.ok(SERVICE_CLASSES.has('StudioService'))
    assert.ok(SERVICE_CLASSES.has('Workspace'))
    assert.ok(!SERVICE_CLASSES.has('Part'))
  })
})

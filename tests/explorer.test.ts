import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it } from 'node:test'
import { buildGameTree, countTree, filterTree } from '../src/shared/gametree'
import type { GameTreeNode } from '../src/shared/types'
import TreeBranch, { treeKey } from '../src/renderer/src/components/TreeBranch'

/** Copied from a real `search_game_tree` response for a place. */
const NODES: GameTreeNode[] = [
  { fullPath: 'Place1', name: 'Place1', className: 'DataModel' },
  { fullPath: 'Workspace', name: 'Workspace', className: 'Workspace', parentName: 'Place1' },
  { fullPath: 'Lighting', name: 'Lighting', className: 'Lighting', parentName: 'Place1' },
  { fullPath: 'ReplicatedStorage', name: 'ReplicatedStorage', className: 'ReplicatedStorage', parentName: 'Place1' },
  { fullPath: 'ServerScriptService', name: 'ServerScriptService', className: 'ServerScriptService', parentName: 'Place1' },
  { fullPath: 'Workspace.Baseplate', name: 'Baseplate', className: 'Part', parentName: 'Workspace' },
  { fullPath: 'Workspace.Camera', name: 'Camera', className: 'Camera', parentName: 'Workspace' },
  { fullPath: 'Workspace.Animate', name: 'Animate', className: 'LocalScript', parentName: 'Workspace' }
]

function render(
  tree = buildGameTree(NODES),
  options: { selectedPath?: string; expanded?: Record<string, boolean>; forceExpanded?: boolean } = {}
): string {
  return renderToStaticMarkup(
    createElement(
      'div',
      { className: 'tree' },
      tree.map((node) =>
        createElement(TreeBranch, {
          key: node.fullPath,
          node,
          selectedPath: options.selectedPath,
          expanded: options.expanded ?? {},
          forceExpanded: options.forceExpanded,
          onToggle: () => undefined,
          onSelect: () => undefined
        })
      )
    )
  )
}

/** Place1 > Workspace open, so Workspace's children are visible. */
const WORKSPACE_OPEN = { Place1: true, Workspace: true }

/** Counts non-overlapping occurrences. */
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

describe('explorer rows', () => {
  it('draws a vector icon for every visible row', () => {
    const markup = render()
    assert.equal(count(markup, 'class="tree-row'), 5, 'the top level starts expanded')
    assert.equal(count(markup, 'svg class="instance-icon"'), 5)
  })

  it('shows the instance name but keeps the class name in the row tooltip', () => {
    const markup = render(buildGameTree(NODES), { expanded: WORKSPACE_OPEN })
    assert.match(markup, /class="tree-name">Workspace</)
    // No second column of class names, as in Studio's Explorer.
    assert.ok(!markup.includes('tree-class'))
    assert.match(markup, /title="Workspace \(Workspace\)"/)
    assert.match(markup, /title="Baseplate \(Part\)"/)
    assert.match(markup, /class="tree-name">Baseplate</)
  })

  it('gives a row a caret when it has children or has not been read yet', () => {
    // A plain listing cannot say whether a row is childless, so every row can be
    // opened to find out — that is how a Model's children get read.
    const unread = render()
    assert.match(unread, /class="tree-caret has-children open"/)
    assert.equal(count(unread, 'class="tree-caret has-children'), 5)

    // Once a listing has covered a row, the caret tells the truth again.
    const read = render(buildGameTree(NODES, { loadedDepths: 5 }), { expanded: WORKSPACE_OPEN })
    assert.equal(count(read, 'class="tree-caret has-children'), 2, 'Place1 and Workspace')
    assert.equal(count(read, 'class="tree-caret"'), 6, 'the rest are leaves')
    const animate = read.slice(read.indexOf('title="Animate (LocalScript)"'))
    assert.match(animate, /^title="Animate \(LocalScript\)"><span class="tree-caret"><\/span>/)
  })

  it('says a row is reading its children, and when Studio cut them short', () => {
    const tree = buildGameTree(NODES, { loadedDepths: 5 })
    const workspace = tree[0].children[0]
    const renderRow = (node: typeof workspace, loadingChildren: Record<string, boolean>): string =>
      renderToStaticMarkup(
        createElement(TreeBranch, {
          node,
          expanded: WORKSPACE_OPEN,
          loadingChildren,
          onToggle: () => undefined,
          onSelect: () => undefined
        })
      )

    const waiting = renderRow(workspace, { Workspace: true })
    assert.match(waiting, /class="tree-caret has-children open loading"/)
    assert.match(waiting, /Reading children…/)

    const cut = renderRow({ ...workspace, childrenTruncated: true }, {})
    assert.match(cut, /more children than Studio returned/)
    assert.ok(!cut.includes('Reading children'))
  })

  it('marks the selected row', () => {
    const markup = render(buildGameTree(NODES), {
      selectedPath: 'Workspace.Camera',
      expanded: WORKSPACE_OPEN
    })
    assert.match(markup, /class="tree-row selected"/)
    assert.equal(count(markup, 'tree-row selected'), 1)
  })

  it('indents each depth level', () => {
    const markup = render(buildGameTree(NODES), { expanded: WORKSPACE_OPEN })
    assert.match(markup, /padding-left:4px/)
    assert.match(markup, /padding-left:18px/)
    assert.match(markup, /padding-left:32px/)
  })

  it('collapses children when the node is closed', () => {
    const open = render(buildGameTree(NODES), { expanded: WORKSPACE_OPEN })
    const closed = render(buildGameTree(NODES), { expanded: { Place1: true } })
    assert.ok(count(closed, 'class="tree-row') < count(open, 'class="tree-row'))
    assert.ok(!closed.includes('tree-name">Baseplate<'))
  })

  it('opens the whole path to a search match', () => {
    // Regression: matches nested below the top level used to stay collapsed, so
    // searching found nothing the user could see.
    const markup = render(filterTree(buildGameTree(NODES), 'animate'), { forceExpanded: true })
    assert.equal(count(markup, 'class="tree-row'), 3, 'Place1 > Workspace > Animate')
    assert.match(markup, /tree-name">Animate</)
    assert.ok(!markup.includes('tree-name">Baseplate<'))
  })

  it('collapses a nested search match when the caller does not force expansion', () => {
    const markup = render(filterTree(buildGameTree(NODES), 'animate'))
    assert.equal(count(markup, 'class="tree-row'), 2, 'only Place1 and Workspace')
  })

  it('never renders emoji in place of an icon', () => {
    const markup = render()
    assert.ok(!/\p{Extended_Pictographic}/u.test(markup))
  })

  it('uses a distinct icon colour per service at the top level', () => {
    const markup = render()
    const colors = [...markup.matchAll(/style="color:(rgb\([^)]+\))"/g)].map((match) => match[1])
    assert.equal(new Set(colors).size, colors.length, 'no two top-level services share a colour')
  })
})

describe('row keys', () => {
  /** Copied from a real listing: Studio repeats several sibling paths. */
  const DUPLICATES: GameTreeNode[] = [
    { fullPath: 'Place1', name: 'Place1', className: 'DataModel' },
    ...Array.from({ length: 4 }, () => ({
      fullPath: 'FilteredSelection',
      name: 'FilteredSelection',
      className: 'Instance',
      parentName: 'Place1'
    })),
    { fullPath: 'PluginGuiService', name: 'PluginGuiService', className: 'PluginGuiService', parentName: 'Place1' },
    ...Array.from({ length: 3 }, () => ({
      fullPath: 'PluginGuiService.PluginGui',
      name: 'PluginGui',
      className: 'DockWidgetPluginGui',
      parentName: 'PluginGuiService'
    }))
  ]

  /** Every key the tree would hand React, in render order. */
  function keysAt(parentKey: string, nodes: ReturnType<typeof buildGameTree>): string[] {
    return nodes.flatMap((node, index) => {
      const own = treeKey(parentKey, index)
      return [own, ...keysAt(own, node.children)]
    })
  }

  it('keys every row uniquely even when Studio repeats a sibling path', () => {
    // Regression: keys used to be the fullPath, so Studio's repeated paths
    // (FilteredSelection, PluginGuiService.PluginGui, ...) collided and React
    // duplicated or stranded rows on a re-render — more rows than nodes.
    const roots = buildGameTree(DUPLICATES)
    const keys = keysAt('', roots)
    assert.equal(new Set(keys).size, keys.length, 'keys must be unique')
    assert.equal(keys.length, countTree(roots), 'one key per row')

    const paths = DUPLICATES.map((node) => node.fullPath)
    assert.ok(
      new Set(paths).size < paths.length,
      'the fixture must actually contain duplicate paths'
    )
  })

  it('renders one row per node for a duplicate-heavy listing', () => {
    const roots = buildGameTree(DUPLICATES)
    const markup = render(roots, { forceExpanded: true })
    assert.equal(count(markup, 'class="tree-row'), countTree(roots))
  })
})

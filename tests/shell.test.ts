import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it } from 'node:test'
import Breadcrumbs, { crumbLabel, crumbPaths } from '../src/renderer/src/components/Breadcrumbs'
import { buildMenus, type MenuContext, type MenuEntry } from '../src/renderer/src/components/menus'

const CONTEXT: MenuContext = {
  version: '1.2.3',
  platform: 'win32',
  activeTabs: ['explorer', 'code'],
  studioConnected: true,
  playtestRunning: false,
  sidebarVisible: true,
  hasProject: true,
  hasEditor: false
}

function items(entries: MenuEntry[]): Extract<MenuEntry, { kind: 'item' }>[] {
  return entries.filter((entry): entry is Extract<MenuEntry, { kind: 'item' }> => entry.kind === 'item')
}

function menu(id: string, context: MenuContext = CONTEXT): MenuEntry[] {
  const found = buildMenus(context).find((entry) => entry.id === id)
  assert.ok(found, `menu ${id} must exist`)
  return found.entries
}

function item(id: string, context: MenuContext = CONTEXT): Extract<MenuEntry, { kind: 'item' }> {
  const found = items(menu(id.split('.')[0], context)).find((entry) => entry.id === id)
  assert.ok(found, `menu item ${id} must exist`)
  return found
}

describe('menu bar model', () => {
  it('offers the four top-level menus in order', () => {
    assert.deepEqual(
      buildMenus(CONTEXT).map((entry) => entry.label),
      ['File', 'View', 'Run', 'Help']
    )
  })

  it('never repeats an entry id', () => {
    const ids = buildMenus(CONTEXT).flatMap((entry) => entry.entries.map((item) => item.id))
    assert.equal(new Set(ids).size, ids.length)
  })

  it('ticks the view each column is showing', () => {
    // The side-bar toggle carries a check of its own, so scope this to the tabs.
    const checked = items(
      menu('view', { ...CONTEXT, activeTabs: ['playtest', 'properties'] })
    ).filter((entry) => entry.checked && entry.id !== 'view.sidebar')
    assert.deepEqual(
      checked.map((entry) => entry.id),
      ['view.properties', 'view.playtest']
    )
  })

  it('reflects whether the side bar is showing', () => {
    assert.equal(item('view.sidebar').checked, true)
    assert.equal(item('view.sidebar', { ...CONTEXT, sidebarVisible: false }).checked, false)
  })

  it('keeps Studio commands disabled while Studio is detached', () => {
    const detached = { ...CONTEXT, studioConnected: false }
    assert.equal(item('run.startPlaytest', detached).disabled, true)
    assert.equal(item('view.refreshTree', detached).disabled, true)
  })

  it('only offers Stop Playtest while a playtest runs', () => {
    assert.equal(item('run.stopPlaytest').disabled, true)
    assert.equal(item('run.stopPlaytest', { ...CONTEXT, playtestRunning: true }).disabled, false)
    assert.equal(item('run.startPlaytest', { ...CONTEXT, playtestRunning: true }).disabled, true)
  })

  it('disables the project and editor commands that need one', () => {
    assert.equal(item('file.newSession', { ...CONTEXT, hasProject: false }).disabled, true)
    assert.equal(item('file.closeEditor').disabled, true)
    assert.equal(item('file.closeEditor', { ...CONTEXT, hasEditor: true }).disabled, false)
  })

  it('names the key bindings the window actually listens for', () => {
    assert.equal(item('view.sidebar').hint, 'Ctrl+B')
    assert.equal(item('view.explorer').hint, 'Ctrl+Shift+E')
  })

  it('prints the running version in Help', () => {
    const label = menu('help').find((entry) => entry.kind === 'label')
    assert.ok(label && label.kind === 'label')
    assert.match(label.text, /1\.2\.3/)
    assert.match(label.text, /win32/)
  })
})

describe('breadcrumbs', () => {
  it('splits an instance path into cumulative prefixes', () => {
    assert.deepEqual(crumbPaths('Workspace.Camera'), ['Workspace', 'Workspace.Camera'])
    assert.deepEqual(crumbPaths('Place1.Workspace.CloudAura.Animate'), [
      'Place1',
      'Place1.Workspace',
      'Place1.Workspace.CloudAura',
      'Place1.Workspace.CloudAura.Animate'
    ])
    assert.deepEqual(crumbPaths(''), [])
  })

  it('labels a crumb with the last path segment', () => {
    assert.equal(crumbLabel('Workspace.Camera'), 'Camera')
    assert.equal(crumbLabel('Camera'), 'Camera')
  })

  it('renders the trail with the class as the trailing symbol', () => {
    const markup = renderToStaticMarkup(
      createElement(Breadcrumbs, { path: 'Workspace.Camera', className: 'Camera' })
    )
    assert.match(markup, /class="crumb crumb-root">game</)
    assert.match(markup, />Workspace</)
    assert.match(markup, /class="crumb current"/)
    assert.match(markup, /class="crumb-symbol">Camera</)
  })

  it('renders nothing without a target', () => {
    assert.equal(renderToStaticMarkup(createElement(Breadcrumbs, { path: null })), '')
  })
})

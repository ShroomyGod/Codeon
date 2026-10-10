import type { InspectorTab } from '../store'

/**
 * The menu bar's shape, kept as plain data so the bar itself only maps ids to
 * actions and a test can assert on the result without a live store.
 */
export type MenuActionId =
  | 'file.newProject'
  | 'file.newSession'
  | 'file.settings'
  | 'file.closeEditor'
  | 'view.explorer'
  | 'view.code'
  | 'view.properties'
  | 'view.playtest'
  | 'view.sidebar'
  | 'view.refreshTree'
  | 'view.pullSelection'
  | 'run.startPlaytest'
  | 'run.stopPlaytest'
  | 'run.reconnect'
  | 'help.about'

export type MenuEntry =
  | { kind: 'separator'; id: string }
  | { kind: 'label'; id: string; text: string }
  | {
      kind: 'item'
      id: MenuActionId
      label: string
      /** Right-aligned key binding, as VS Code shows it. */
      hint?: string
      checked?: boolean
      disabled?: boolean
    }

export interface Menu {
  id: string
  label: string
  entries: MenuEntry[]
}

export interface MenuContext {
  version: string
  platform: string
  /** The view each column is showing, so both can be ticked at once. */
  activeTabs: InspectorTab[]
  studioConnected: boolean
  playtestRunning: boolean
  sidebarVisible: boolean
  hasProject: boolean
  hasEditor: boolean
}

/** Which editor tab each view action opens, and the key that does it. */
const VIEW_TABS: { id: MenuActionId; tab: InspectorTab; label: string; hint?: string }[] = [
  { id: 'view.explorer', tab: 'explorer', label: 'Explorer', hint: 'Ctrl+Shift+E' },
  { id: 'view.code', tab: 'code', label: 'Code' },
  { id: 'view.properties', tab: 'properties', label: 'Properties' },
  { id: 'view.playtest', tab: 'playtest', label: 'Playtest' }
]

export function buildMenus(context: MenuContext): Menu[] {
  return [
    {
      id: 'file',
      label: 'File',
      entries: [
        { kind: 'item', id: 'file.newProject', label: 'New Project…' },
        {
          kind: 'item',
          id: 'file.newSession',
          label: 'New Session',
          disabled: !context.hasProject
        },
        { kind: 'separator', id: 'file.sep1' },
        { kind: 'item', id: 'file.settings', label: 'Settings…', hint: 'Ctrl+,' },
        { kind: 'separator', id: 'file.sep2' },
        {
          kind: 'item',
          id: 'file.closeEditor',
          label: 'Close Script Editor',
          disabled: !context.hasEditor
        }
      ]
    },
    {
      id: 'view',
      label: 'View',
      entries: [
        { kind: 'label', id: 'view.tabs', text: 'Editor' },
        ...VIEW_TABS.map(
          (entry): MenuEntry => ({
            kind: 'item',
            id: entry.id,
            label: entry.label,
            hint: entry.hint,
            checked: context.activeTabs.includes(entry.tab)
          })
        ),
        { kind: 'separator', id: 'view.sep1' },
        { kind: 'label', id: 'view.appearance', text: 'Appearance' },
        {
          kind: 'item',
          id: 'view.sidebar',
          label: 'Primary Side Bar',
          hint: 'Ctrl+B',
          checked: context.sidebarVisible
        },
        { kind: 'separator', id: 'view.sep2' },
        { kind: 'label', id: 'view.datamodel', text: 'DataModel' },
        {
          kind: 'item',
          id: 'view.refreshTree',
          label: 'Refresh Tree',
          disabled: !context.studioConnected
        },
        {
          kind: 'item',
          id: 'view.pullSelection',
          label: 'Select Highlighted in Explorer',
          disabled: !context.studioConnected
        }
      ]
    },
    {
      id: 'run',
      label: 'Run',
      entries: [
        {
          kind: 'item',
          id: 'run.startPlaytest',
          label: 'Start Playtest',
          disabled: !context.studioConnected || context.playtestRunning
        },
        {
          kind: 'item',
          id: 'run.stopPlaytest',
          label: 'Stop Playtest',
          disabled: !context.playtestRunning
        },
        { kind: 'separator', id: 'run.sep1' },
        { kind: 'item', id: 'run.reconnect', label: 'Reconnect to Studio' }
      ]
    },
    {
      id: 'help',
      label: 'Help',
      entries: [
        {
          kind: 'label',
          id: 'help.version',
          text: `Codeon ${context.version || '…'} · ${context.platform || 'unknown'}`
        },
        { kind: 'item', id: 'help.about', label: 'About Codeon' }
      ]
    }
  ]
}

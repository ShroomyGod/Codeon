import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useStore } from '../store'
import { useUi } from '../ui'
import { buildMenus, type MenuActionId, type MenuEntry } from './menus'

/**
 * The menu bar VS Code draws across the top of the window. It sits in the title
 * bar, opens on click, follows the pointer while a menu is open, and closes on
 * Escape or a click anywhere else.
 */
export default function MenuBar(): React.JSX.Element {
  const [open, setOpen] = useState<string | null>(null)

  const info = useStore((state) => state.info)
  const studio = useStore((state) => state.studio)
  const leftTab = useStore((state) => state.leftTab)
  const mainTab = useStore((state) => state.mainTab)
  const editor = useStore((state) => state.editor)
  const activeProjectId = useStore((state) => state.activeProjectId)
  const playtestRunning = useStore((state) => state.playtestRunning)

  const sidebarVisible = useUi((state) => state.sidebarVisible)
  const toggleSidebar = useUi((state) => state.toggleSidebar)
  const setSettingsOpen = useUi((state) => state.setSettingsOpen)
  const setNewProjectOpen = useUi((state) => state.setNewProjectOpen)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const menus = buildMenus({
    version: info?.version ?? '',
    platform: info?.platform ?? '',
    activeTabs: [leftTab, mainTab],
    studioConnected: Boolean(studio?.connected),
    playtestRunning,
    sidebarVisible,
    hasProject: Boolean(activeProjectId),
    hasEditor: Boolean(editor)
  })

  // Typed as a complete map, so a menu entry without an action fails the build.
  const actions: Record<MenuActionId, () => void> = {
    'file.newProject': () => setNewProjectOpen(true),
    'file.newSession': () => void useStore.getState().createSession(),
    'file.settings': () => setSettingsOpen(true),
    'file.closeEditor': () => useStore.getState().closeEditor(),
    'view.explorer': () => useStore.getState().setTab('explorer'),
    'view.code': () => useStore.getState().setTab('code'),
    'view.properties': () => useStore.getState().setTab('properties'),
    'view.playtest': () => useStore.getState().setTab('playtest'),
    'view.sidebar': () => toggleSidebar(),
    'view.refreshTree': () => void useStore.getState().loadTree({ depth: 3 }),
    'view.pullSelection': () => void useStore.getState().pullSelection(),
    'run.startPlaytest': () => void useStore.getState().startPlaytest(),
    'run.stopPlaytest': () => void useStore.getState().stopPlaytest(),
    'run.reconnect': () => void useStore.getState().refreshStudio(),
    'help.about': () => setSettingsOpen(true)
  }

  const choose = (id: MenuActionId): void => {
    setOpen(null)
    actions[id]?.()
  }

  return (
    <nav className="menubar" aria-label="Application menu">
      {menus.map((menu) => (
        <div className="menubar-item" key={menu.id}>
          <button
            className={`menubar-label${open === menu.id ? ' open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={open === menu.id}
            onClick={() => setOpen((current) => (current === menu.id ? null : menu.id))}
            onMouseEnter={() => setOpen((current) => (current ? menu.id : null))}
          >
            {menu.label}
          </button>

          {open === menu.id && (
            <>
              <div className="menu-scrim" onClick={() => setOpen(null)} />
              <div className="menu menubar-menu" role="menu">
                {menu.entries.map((entry) => (
                  <MenuRow
                    key={entry.id}
                    entry={entry}
                    onChoose={choose}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ))}
    </nav>
  )
}

function MenuRow({
  entry,
  onChoose
}: {
  entry: MenuEntry
  onChoose: (id: MenuActionId) => void
}): React.JSX.Element {
  if (entry.kind === 'separator') return <div className="menu-sep" />
  if (entry.kind === 'label') return <div className="menu-label">{entry.text}</div>

  return (
    <button
      className={`menu-item${entry.checked ? ' checked' : ''}`}
      role="menuitem"
      disabled={entry.disabled}
      onClick={() => onChoose(entry.id)}
    >
      <span className="menu-check">{entry.checked ? <Check size={12} /> : null}</span>
      {entry.label}
      {entry.hint && <span className="menu-hint">{entry.hint}</span>}
    </button>
  )
}

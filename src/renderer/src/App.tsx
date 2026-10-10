import { useEffect } from 'react'
import { useStore } from './store'
import { useUi } from './ui'
import TitleBar from './components/TitleBar'
import ActivityBar from './components/ActivityBar'
import SidePanel from './components/SidePanel'
import LeftView from './components/LeftView'
import MainView from './components/MainView'
import ChatPanel from './components/ChatPanel'
import StatusBar from './components/StatusBar'
import SettingsDialog from './components/SettingsDialog'
import NewProjectDialog from './components/NewProjectDialog'
import Toasts from './components/Toasts'

export default function App(): React.JSX.Element {
  const ready = useStore((state) => state.ready)
  const bootError = useStore((state) => state.bootError)
  const init = useStore((state) => state.init)
  const settingsOpen = useUi((state) => state.settingsOpen)
  const newProjectOpen = useUi((state) => state.newProjectOpen)
  const sidebarVisible = useUi((state) => state.sidebarVisible)
  const toggleSidebar = useUi((state) => state.toggleSidebar)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()

      // The three editor commands a VS Code user reaches for by muscle memory.
      if (!event.shiftKey && key === 'b') {
        event.preventDefault()
        toggleSidebar()
        return
      }
      if (!event.shiftKey && event.key === ',') {
        event.preventDefault()
        useUi.getState().setSettingsOpen(true)
        return
      }
      if (event.shiftKey && key === 'e') {
        event.preventDefault()
        useStore.getState().setTab('explorer')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleSidebar])

  if (!ready) {
    return (
      <div className="app">
        <div className="empty">
          <div className="spinner" />
          <p>Starting Codeon…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <TitleBar />
      {bootError ? (
        <div className="empty">
          <h2>Codeon could not start</h2>
          <p>{bootError}</p>
        </div>
      ) : (
        <div className={`app-body${sidebarVisible ? '' : ' no-sidebar'}`}>
          <ActivityBar />
          {sidebarVisible && <SidePanel />}
          {/* Explorer + Playtest on the left, Code + Properties in the middle,
              the AI chat on the right. */}
          <LeftView />
          <MainView />
          <ChatPanel />
        </div>
      )}
      <StatusBar />
      {settingsOpen && <SettingsDialog />}
      {newProjectOpen && <NewProjectDialog />}
      <Toasts />
    </div>
  )
}

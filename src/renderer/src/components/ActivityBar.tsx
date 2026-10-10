import { Files, GitPullRequestArrow, Settings as SettingsIcon } from 'lucide-react'
import { useStore } from '../store'
import { useUi, type SidebarView } from '../ui'

/**
 * The narrow icon strip down the far left, as in VS Code. The top icons switch
 * the side bar; Settings sits pinned to the bottom.
 */
export default function ActivityBar(): React.JSX.Element {
  const sidebar = useUi((state) => state.sidebar)
  const setSidebar = useUi((state) => state.setSidebar)
  const setSettingsOpen = useUi((state) => state.setSettingsOpen)
  const changes = useStore((state) => state.changes)
  const activeProjectId = useStore((state) => state.activeProjectId)

  const pending = changes.filter(
    (change) => change.status === 'pending' && change.projectId === activeProjectId
  ).length

  const items: { id: SidebarView; label: string; icon: React.JSX.Element; badge?: number }[] = [
    { id: 'projects', label: 'Projects', icon: <Files size={22} strokeWidth={1.5} /> },
    {
      id: 'review',
      label: 'Review changes',
      icon: <GitPullRequestArrow size={22} strokeWidth={1.5} />,
      badge: pending
    }
  ]

  return (
    <nav className="activity-bar" aria-label="Views">
      {items.map((item) => (
        <button
          key={item.id}
          className={`activity-item${sidebar === item.id ? ' active' : ''}`}
          title={item.label}
          aria-label={item.label}
          aria-pressed={sidebar === item.id}
          onClick={() => setSidebar(item.id)}
        >
          {item.icon}
          {item.badge ? <span className="activity-badge">{item.badge}</span> : null}
        </button>
      ))}

      <div className="activity-spacer" />

      <button
        className="activity-item"
        title="Settings"
        aria-label="Settings"
        onClick={() => setSettingsOpen(true)}
      >
        <SettingsIcon size={22} strokeWidth={1.5} />
      </button>
    </nav>
  )
}

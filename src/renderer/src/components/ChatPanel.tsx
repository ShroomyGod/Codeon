import { useEffect, useMemo, useRef, useState } from 'react'
import { GitPullRequestArrow, ListTree, Rocket } from 'lucide-react'
import logo from '../assets/logo-large.png'
import { useStore } from '../store'
import { QUICK_PROMPTS } from './Composer'
import Composer from './Composer'
import MessageView from './MessageView'
import { getProvider } from '@shared/providers'
import { useUi } from '../ui'

export default function ChatPanel(): React.JSX.Element {
  const projects = useStore((state) => state.projects)
  const activeProjectId = useStore((state) => state.activeProjectId)
  const activeSessionId = useStore((state) => state.activeSessionId)
  const runs = useStore((state) => state.runs)
  const changes = useStore((state) => state.changes)
  const settings = useStore((state) => state.settings)
  const send = useStore((state) => state.send)
  const refreshChanges = useStore((state) => state.refreshChanges)
  const setSidebar = useUi((state) => state.setSidebar)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [busyChange, setBusyChange] = useState<string | null>(null)

  const project = projects.find((entry) => entry.id === activeProjectId)
  const session = project?.sessions.find((entry) => entry.id === activeSessionId)

  const changeMap = useMemo(() => {
    const map: Record<string, (typeof changes)[number]> = {}
    for (const change of changes) map[change.id] = change
    return map
  }, [changes])

  const pendingCount = changes.filter(
    (change) => change.status === 'pending' && change.projectId === activeProjectId
  ).length

  const provider = settings ? getProvider(settings.activeProviderId) : undefined

  const runKey = Object.values(runs)
    .map((run) => run.text.length)
    .join(':')

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [session?.messages.length, runKey])

  async function applyChange(id: string): Promise<void> {
    setBusyChange(id)
    try {
      await window.codeon.invoke('changes:apply', id)
      await refreshChanges()
      useStore.getState().pushToast('success', 'Change applied to Studio')
    } catch (error) {
      useStore.getState().pushToast('error', error instanceof Error ? error.message : String(error))
      await refreshChanges()
    } finally {
      setBusyChange(null)
    }
  }

  async function rejectChange(id: string): Promise<void> {
    setBusyChange(id)
    try {
      await window.codeon.invoke('changes:reject', id)
      await refreshChanges()
    } finally {
      setBusyChange(null)
    }
  }

  const messages = session?.messages ?? []

  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-title">{session?.title ?? 'Chat'}</span>
        {project && <span className="dim">· {project.name}</span>}
        <div className="panel-actions">
          <button className="btn sm ghost" onClick={() => setSidebar('review')} title="Open the review queue">
            <GitPullRequestArrow size={13} /> Review
            {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
          </button>
          <button className="btn sm ghost" onClick={() => void useStore.getState().refreshStudio()}>
            <ListTree size={13} /> Sync
          </button>
        </div>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {!project && <Welcome />}
        {project && messages.length === 0 && <Welcome onQuick={(text) => void send(text)} />}
        {messages.map((message) => (
          <MessageView
            key={message.id}
            message={message}
            run={runs[message.id]}
            changes={changeMap}
            onApply={(id) => void applyChange(id)}
            onReject={(id) => void rejectChange(id)}
          />
        ))}
      </div>

      <Composer provider={provider} />
      {busyChange && <span className="dim" style={{ padding: '0 14px 8px' }}>Applying change…</span>}
    </section>
  )
}

function Welcome({ onQuick }: { onQuick?: (text: string) => void }): React.JSX.Element {
  const studio = useStore((state) => state.studio)
  const refreshStudio = useStore((state) => state.refreshStudio)
  const setTab = useStore((state) => state.setTab)
  const startPlaytest = useStore((state) => state.startPlaytest)

  return (
    <div className="empty">
      <img className="empty-logo" src={logo} alt="" />
      <h2>Codeon is ready</h2>
      <p>
        {studio?.connected
          ? 'Studio is attached. Ask for a change and you will get a reviewable diff before anything touches your place.'
          : 'Codeon attaches through the MCP server built into Roblox Studio. Enable it under Studio → Assistant → MCP, keep a place open, then press Connect.'}
      </p>

      <div className="row" style={{ gap: 8 }}>
        {!studio?.connected && (
          <button className="btn primary" onClick={() => void refreshStudio()}>
            Connect to Studio
          </button>
        )}
        <button className="btn" onClick={() => setTab('explorer')}>
          <ListTree size={14} /> Browse the DataModel
        </button>
        <button className="btn" onClick={() => void startPlaytest()}>
          <Rocket size={14} /> Start a playtest
        </button>
      </div>

      {onQuick && (
        <div className="quick-grid">
          {QUICK_PROMPTS.map((prompt) => (
            <button className="quick-card" key={prompt.title} onClick={() => onQuick(prompt.body)}>
              <strong>{prompt.title}</strong>
              <span>{prompt.body}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

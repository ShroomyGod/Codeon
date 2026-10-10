import { CircleCheck, Database, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react'
import { useStore } from '../store'
import { useUi } from '../ui'
import { displayModelName } from './ModelPicker'

/** The violet-tinted strip along the bottom: the attached place, the tool count and the model. */
export default function StatusBar(): React.JSX.Element {
  const info = useStore((state) => state.info)
  const studio = useStore((state) => state.studio)
  const studios = useStore((state) => state.studios)
  const settings = useStore((state) => state.settings)
  const projects = useStore((state) => state.projects)
  const activeProjectId = useStore((state) => state.activeProjectId)
  const refreshStudio = useStore((state) => state.refreshStudio)
  const modelCatalog = useStore((state) => state.modelCatalog)
  const setSettingsOpen = useUi((state) => state.setSettingsOpen)

  const active = studios.find((entry) => entry.id === studio?.activeStudioId) ?? studios[0]
  const project = projects.find((entry) => entry.id === activeProjectId)

  const dotClass = studio?.connected ? 'ok' : studio?.mcpAvailable ? 'warn' : 'bad'
  const studioLabel = studio?.connected
    ? (active?.name ?? 'Studio')
    : studio?.mcpAvailable
      ? 'No place open'
      : 'Studio not found'

  return (
    <footer className="status-bar">
      <button
        className="status-item"
        title={
          studio?.connected
            ? `Attached to ${active?.name ?? 'Studio'} · ${studio.toolCount} tools`
            : 'Reconnect to Roblox Studio'
        }
        onClick={() => void refreshStudio()}
      >
        <span className={`status-dot ${dotClass}`} />
        {studioLabel}
      </button>

      <span className="status-item" title="Roblox Studio MCP tools available">
        <Database size={13} />
        {studio?.toolCount ?? 0} tools
      </span>

      {project && (
        <span className="status-item" title="Active project">
          <Sparkles size={13} />
          {project.name}
        </span>
      )}

      <span className="spacer" />

      {studio?.lastError ? (
        <span className="status-item" title={studio.lastError}>
          <TriangleAlert size={13} />
          {studio.lastError.slice(0, 60)}
        </span>
      ) : (
        <span className="status-item" title="Last handshake with Studio">
          <CircleCheck size={13} />
          {studio?.protocolVersion ? `MCP ${studio.protocolVersion}` : 'MCP'}
        </span>
      )}

      <button
        className="status-item"
        title="Change provider or model"
        onClick={() => setSettingsOpen(true)}
      >
        {settings
          ? displayModelName(
              settings.activeProviderId,
              settings.activeModel,
              modelCatalog[settings.activeProviderId]?.models ?? []
            )
          : 'No model'}
      </button>

      <span className="status-item" title="Refresh Studio state" onClick={() => void refreshStudio()} role="button" tabIndex={0}>
        <RefreshCw size={12} />
      </span>

      <span className="status-item" title={`Codeon ${info?.version ?? ''} · ${info?.platform ?? ''}`}>
        v{info?.version ?? '…'}
      </span>
    </footer>
  )
}

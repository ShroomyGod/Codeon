import { RefreshCw, Settings as SettingsIcon } from 'lucide-react'
import logo from '../assets/logo.png'
import { useStore } from '../store'
import { useUi } from '../ui'
import { describeModel } from '@shared/providers'
import StudioPicker from './StudioPicker'
import MenuBar from './MenuBar'

export default function TitleBar(): React.JSX.Element {
  const info = useStore((state) => state.info)
  const studio = useStore((state) => state.studio)
  const studios = useStore((state) => state.studios)
  const settings = useStore((state) => state.settings)
  const refreshStudio = useStore((state) => state.refreshStudio)
  const setSettingsOpen = useUi((state) => state.setSettingsOpen)

  const connected = Boolean(studio?.connected)
  const available = Boolean(studio?.mcpAvailable)
  const chipClass = connected ? 'status-chip ok' : available ? 'status-chip warn' : 'status-chip bad'
  const active = studios.find((entry) => entry.id === studio?.activeStudioId) ?? studios[0]
  const statusText = connected
    ? `${active?.name ?? 'Studio'}${studio?.mode ? ` · ${studio.mode}` : ''}`
    : available
      ? studios.length > 0
        ? 'Studio found — connecting…'
        : 'Studio MCP ready — open a place'
      : 'Studio MCP server not found'

  return (
    <header className="titlebar">
      <div className="brand">
        <img className="brand-logo" src={logo} alt="Codeon" />
        <div>
          <div className="brand-name">Codeon</div>
          <div className="brand-version">v{info?.version ?? '…'} · Roblox Studio copilot</div>
        </div>
      </div>

      <MenuBar />

      <div className="titlebar-spacer" />

      <div className="titlebar-actions">
        <StudioPicker />

        <span
          className={chipClass}
          title={
            studio?.lastError ??
            (connected
              ? `${studio?.toolCount ?? 0} Studio tools · MCP ${studio?.protocolVersion ?? '?'}`
              : statusText)
          }
          onClick={() => void refreshStudio()}
          role="button"
          tabIndex={0}
        >
          <span className="dot" />
          {statusText}
        </span>

        <button
          className="btn sm ghost"
          title={`Active model: ${
            settings ? describeModel(settings.activeProviderId, settings.activeModel) : 'unknown'
          }`}
          onClick={() => setSettingsOpen(true)}
        >
          <SettingsIcon size={13} />
          {settings?.activeModel ?? 'Model'}
        </button>

        <button className="icon-btn" title="Refresh Studio state" onClick={() => void refreshStudio()}>
          <RefreshCw size={14} />
        </button>
      </div>
    </header>
  )
}

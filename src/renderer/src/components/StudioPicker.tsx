import { useState } from 'react'
import { Check, ChevronDown, Monitor, RefreshCw } from 'lucide-react'
import type { StudioInfo } from '@shared/types'
import { useStore } from '../store'

/**
 * Picks which open Studio window Codeon drives.
 *
 * `list_roblox_studios` is the only place a place name comes from, so the list
 * is shown for the active connection and refreshed on demand rather than
 * polled aggressively.
 */
export default function StudioPicker(): React.JSX.Element | null {
  const studio = useStore((state) => state.studio)
  const studios = useStore((state) => state.studios)
  const selectStudio = useStore((state) => state.selectStudio)
  const refreshStudio = useStore((state) => state.refreshStudio)
  const [open, setOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  if (!studio?.mcpAvailable) return null

  const active = studios.find((entry) => entry.id === studio.activeStudioId) ?? studios[0]

  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      await refreshStudio()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="studio-anchor">
      <button
        className={`btn sm ghost studio-btn${studio.connected ? '' : ' offline'}`}
        onClick={() => setOpen((value) => !value)}
        title={
          studio.connected
            ? 'Choose which Roblox Studio window Codeon talks to'
            : 'Roblox Studio is not attached yet'
        }
        aria-expanded={open}
      >
        <Monitor size={13} />
        <span className="studio-btn-name">{active?.name ?? 'No Studio open'}</span>
        <ChevronDown size={13} />
      </button>

      {open && (
        <>
          <div className="picker-scrim" onClick={() => setOpen(false)} />
          <div className="picker down align-right narrow" role="dialog" aria-label="Pick Studio">
            <div className="picker-head">
              <span className="picker-head-title">Pick Studio</span>
              <button
                className="btn sm ghost"
                disabled={refreshing}
                onClick={() => void refresh()}
                title="Ask Studio for the current window list"
              >
                <RefreshCw size={12} className={refreshing ? 'spin' : undefined} />
                {refreshing ? 'Checking…' : 'Refresh'}
              </button>
            </div>

            <div className="picker-list">
              {studios.map((info) => (
                <StudioRow
                  key={info.id}
                  info={info}
                  active={info.id === studio.activeStudioId}
                  mode={studio.mode}
                  onPick={() => {
                    void selectStudio(info.id)
                    setOpen(false)
                  }}
                />
              ))}

              {studios.length === 0 && (
                <div className="picker-empty">
                  {studio.connected
                    ? 'No Studio window is open. Open or create a place, then press Refresh.'
                    : 'Not attached yet. Roblox Studio must be running with a place open.'}
                </div>
              )}
            </div>

            {studio.lastError && <div className="picker-note">{studio.lastError}</div>}
          </div>
        </>
      )}
    </div>
  )
}

function StudioRow({
  info,
  active,
  mode,
  onPick
}: {
  info: StudioInfo
  active: boolean
  mode?: string
  onPick: () => void
}): React.JSX.Element {
  // Studio usually reports the place id inside the name already; only add it
  // when it is missing so it never shows twice.
  const label =
    info.placeId && !/placeid/i.test(info.name)
      ? `${info.name} (placeId: ${info.placeId})`
      : info.name

  const subtitle = !info.placeId ? 'Local place' : active && mode ? `${mode} mode` : 'Published place'

  return (
    <button className={`picker-item${active ? ' active' : ''}`} onClick={onPick}>
      <Monitor size={14} />
      <span className="picker-item-main">
        <span className="picker-item-label">{label}</span>
        <span className="picker-item-sub">{subtitle}</span>
      </span>
      {active && <Check size={14} className="picker-check" />}
    </button>
  )
}

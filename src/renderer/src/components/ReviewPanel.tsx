import { useState } from 'react'
import { CheckCheck, XCircle } from 'lucide-react'
import { useStore } from '../store'
import ChangeCard from './ChangeCard'

export default function ReviewPanel(): React.JSX.Element {
  const changes = useStore((state) => state.changes)
  const activeProjectId = useStore((state) => state.activeProjectId)
  const refreshChanges = useStore((state) => state.refreshChanges)
  const updateSettings = useStore((state) => state.updateSettings)
  const settings = useStore((state) => state.settings)
  const [busy, setBusy] = useState(false)
  const [showResolved, setShowResolved] = useState(false)

  const projectChanges = changes.filter((change) => change.projectId === activeProjectId)
  const pending = projectChanges.filter((change) => change.status === 'pending')
  const resolved = projectChanges.filter((change) => change.status !== 'pending').slice(-40).reverse()

  async function apply(id: string): Promise<void> {
    setBusy(true)
    try {
      await window.codeon.invoke('changes:apply', id)
      useStore.getState().pushToast('success', 'Applied to Studio')
    } catch (error) {
      useStore.getState().pushToast('error', error instanceof Error ? error.message : String(error))
    } finally {
      await refreshChanges()
      setBusy(false)
    }
  }

  async function reject(id: string): Promise<void> {
    setBusy(true)
    try {
      await window.codeon.invoke('changes:reject', id)
    } finally {
      await refreshChanges()
      setBusy(false)
    }
  }

  async function applyAll(): Promise<void> {
    if (pending.length === 0) return
    setBusy(true)
    try {
      await window.codeon.invoke(
        'changes:applyMany',
        pending.map((change) => change.id)
      )
      useStore.getState().pushToast('success', `Applied ${pending.length} change(s)`)
    } catch (error) {
      useStore.getState().pushToast('error', error instanceof Error ? error.message : String(error))
    } finally {
      await refreshChanges()
      setBusy(false)
    }
  }

  async function rejectAll(): Promise<void> {
    setBusy(true)
    try {
      for (const change of pending) {
        await window.codeon.invoke('changes:reject', change.id)
      }
    } finally {
      await refreshChanges()
      setBusy(false)
    }
  }

  return (
    <>
      <div className="toolbar">
        <span className="panel-title">
          {pending.length === 0 ? 'Nothing waiting' : `${pending.length} change${pending.length === 1 ? '' : 's'} waiting`}
        </span>
        <span style={{ marginLeft: 'auto' }} />
        <label className="switch" title="When off, the agent applies changes immediately">
          <span className={`toggle${settings?.reviewChanges ? ' on' : ''}`} />
          <span className="hint" style={{ marginRight: 8 }}>
            Review
          </span>
          <input
            type="checkbox"
            checked={settings?.reviewChanges ?? true}
            style={{ display: 'none' }}
            onChange={(event) => void updateSettings({ reviewChanges: event.target.checked })}
          />
        </label>
        <button className="btn sm" disabled={busy || pending.length === 0} onClick={() => void applyAll()}>
          <CheckCheck size={13} /> Accept all
        </button>
        <button className="btn sm danger" disabled={busy || pending.length === 0} onClick={() => void rejectAll()}>
          <XCircle size={13} /> Reject all
        </button>
      </div>

      <div className="scroll-area">
        <div className="review">
          {pending.length === 0 && (
            <div className="review-empty">
              Every proposed change has been handled. Ask Codeon for an edit and it will land here as a
              diff first.
            </div>
          )}

          {pending.map((change) => (
            <ChangeCard
              key={change.id}
              change={change}
              busy={busy}
              onApply={(id) => void apply(id)}
              onReject={(id) => void reject(id)}
            />
          ))}

          {resolved.length > 0 && (
            <>
              <button className="btn sm ghost" onClick={() => setShowResolved((value) => !value)}>
                {showResolved ? 'Hide' : 'Show'} history ({resolved.length})
              </button>
              {showResolved &&
                resolved.map((change) => (
                  <ChangeCard key={change.id} change={change} onApply={() => undefined} onReject={() => undefined} />
                ))}
            </>
          )}
        </div>
      </div>
    </>
  )
}

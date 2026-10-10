import { useState } from 'react'
import { ArrowUp, ChevronDown, Square } from 'lucide-react'
import { useStore } from '../store'
import type { ProviderDef } from '@shared/types'
import ModelPicker, { displayModelName } from './ModelPicker'

const QUICK_PROMPTS = [
  { title: 'Explore the place', body: 'List the services and the most important scripts in this place.' },
  { title: 'Review a script', body: 'Read the main server script and tell me what it does and what could break.' },
  { title: 'Add a feature', body: 'Add a leaderboard that tracks player scores in ServerScriptService.' },
  { title: 'Fix a bug', body: 'The output log shows an error — find the cause and propose a fix.' }
]

export default function Composer({
  provider,
  placeholder
}: {
  provider?: ProviderDef
  placeholder?: string
}): React.JSX.Element {
  const draft = useStore((state) => state.composerDraft)
  const setDraft = useStore((state) => state.setDraft)
  const send = useStore((state) => state.send)
  const cancelRun = useStore((state) => state.cancelRun)
  const runs = useStore((state) => state.runs)
  const settings = useStore((state) => state.settings)
  const studio = useStore((state) => state.studio)
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const activeRun = Object.values(runs)[0]
  const catalog = useStore((state) => (provider ? state.modelCatalog[provider.id]?.models : undefined))

  async function submit(): Promise<void> {
    if (!draft.trim() || busy) return
    setBusy(true)
    try {
      await send(draft)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="composer">
      <div className="composer-box">
        <textarea
          value={draft}
          placeholder={placeholder ?? 'Ask Codeon to read, change, or test something in your place…'}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
        />
        <div className="composer-row">
          <div className="model-anchor">
            <button
              className="btn sm ghost model-btn"
              onClick={() => setPickerOpen((open) => !open)}
              title="Choose a provider and model"
              aria-expanded={pickerOpen}
            >
              {settings
                ? displayModelName(settings.activeProviderId, settings.activeModel, catalog ?? [])
                : 'No model'}
              <ChevronDown size={13} />
            </button>
            {pickerOpen && <ModelPicker onClose={() => setPickerOpen(false)} />}
          </div>
          {!studio?.connected && <span className="composer-hint">Studio offline</span>}
          <span className="composer-hint">Shift+Enter for a new line</span>
          {activeRun ? (
            <button className="btn sm danger" onClick={() => void cancelRun()}>
              <Square size={12} /> Stop
            </button>
          ) : (
            <button className="btn sm primary" disabled={!draft.trim() || busy} onClick={() => void submit()}>
              <ArrowUp size={13} /> Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export { QUICK_PROMPTS }

import { AlertCircle, Bot, User } from 'lucide-react'
import type { ChatMessage, Change } from '@shared/types'
import type { RunState } from '../store'
import { RichText } from './RichText'
import ChangeCard from './ChangeCard'

export default function MessageView({
  message,
  run,
  changes,
  onApply,
  onReject
}: {
  message: ChatMessage
  run?: RunState
  changes: Record<string, Change>
  onApply: (id: string) => void
  onReject: (id: string) => void
}): React.JSX.Element {
  const streaming = Boolean(run)
  const text = run?.text ? run.text : message.content
  const steps = run?.steps?.length ? run.steps : message.steps ?? []
  const changeIds = run?.changeIds ?? []

  const attached = changeIds.map((id) => changes[id]).filter((change): change is Change => Boolean(change))

  const klass = ['msg', message.role === 'user' ? 'user' : 'assistant', message.errored ? 'error' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={klass}>
      <div className="msg-avatar">
        {message.role === 'user' ? <User size={14} /> : message.errored ? <AlertCircle size={14} /> : <Bot size={14} />}
      </div>
      <div className="msg-stack">
        <div className="msg-head">
          <span>{message.role === 'user' ? 'You' : 'Codeon'}</span>
          {message.model && <span className="dim mono">{message.model}</span>}
          <span className="dim">{new Date(message.createdAt).toLocaleTimeString()}</span>
          {streaming && <span className="spinner" />}
        </div>

        {(text || streaming) && (
          <div className="msg-body">
            {text ? <RichText text={text} /> : <span className="dim">Thinking…</span>}
            {streaming && <span className="cursor" />}
          </div>
        )}

        {steps.length > 0 && (
          <div className="steps">
            {steps.map((step) => (
              <div
                className={`step ${step.type === 'error' || step.ok === false ? 'fail' : step.type === 'note' ? 'note' : ''}`}
                key={step.id}
              >
                {step.name && <span className="step-name">{step.name}</span>}
                <span className="step-result">{step.result}</span>
              </div>
            ))}
          </div>
        )}

        {attached.map((change) => (
          <div key={change.id} style={{ marginTop: 10 }}>
            <ChangeCard change={change} onApply={onApply} onReject={onReject} />
          </div>
        ))}
      </div>
    </div>
  )
}

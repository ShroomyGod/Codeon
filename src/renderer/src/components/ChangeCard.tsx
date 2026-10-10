import { Check, Clock, X } from 'lucide-react'
import type { Change } from '@shared/types'
import { buildDiff, summarize, type DiffRow } from '../lib/diff'

function displayTarget(change: Change): string {
  return change.target.startsWith('file:') ? change.target.slice('file:'.length) : change.target
}

/** Turns a change into the rows the diff viewer paints. */
function rowsFor(change: Change): DiffRow[] {
  const before = change.before ?? ''
  const after = change.after ?? ''

  if (change.kind === 'create') {
    const pretty = prettyJson(after)
    return pretty.split('\n').map((text, index) => ({
      type: 'add' as const,
      text,
      oldLine: null,
      newLine: index + 1
    }))
  }
  if (change.kind === 'delete') {
    const pretty = prettyJson(before)
    return pretty.split('\n').map((text, index) => ({
      type: 'del' as const,
      text,
      oldLine: index + 1,
      newLine: null
    }))
  }
  return buildDiff(before, after)
}

function prettyJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

export default function ChangeCard({
  change,
  onApply,
  onReject,
  busy
}: {
  change: Change
  onApply: (id: string) => void
  onReject: (id: string) => void
  busy?: boolean
}): React.JSX.Element {
  const rows = rowsFor(change)
  const summary = summarize(change.before ?? '', change.after ?? '')
  const pending = change.status === 'pending'

  return (
    <div className="review-card">
      <div className="review-head">
        <span className={`badge ${change.kind}`}>{change.kind}</span>
        <span className="review-target" title={displayTarget(change)}>
          {displayTarget(change)}
          {change.property ? `.${change.property}` : ''}
        </span>
        <span className="review-meta">
          {change.appliedAutomatically && (
            <span title="Applied automatically by your review settings">
              <Clock size={12} /> auto
            </span>
          )}
          {!summary.identical && (
            <span className="mono">
              <span style={{ color: 'var(--green)' }}>+{summary.added}</span>{' '}
              <span style={{ color: 'var(--red)' }}>-{summary.removed}</span>
            </span>
          )}
          <span className={`badge ${change.status}`}>{change.status}</span>
        </span>
      </div>

      {change.note && <div className="review-note">{change.note}</div>}

      {rows.length > 0 && (
        <div className="diff">
          {rows.map((row, index) => (
            <div className={`diff-row ${row.type}`} key={index}>
              <span className="diff-gutter">{row.oldLine ?? ''}</span>
              <span className="diff-gutter">{row.newLine ?? ''}</span>
              <span className="diff-sign">
                {row.type === 'add' ? '+' : row.type === 'del' ? '-' : row.type === 'gap' ? '⋯' : ''}
              </span>
              <span className="diff-text">{row.type === 'gap' ? '' : row.text}</span>
            </div>
          ))}
        </div>
      )}

      {change.error && <div className="review-error">{change.error}</div>}

      {pending && (
        <div className="review-actions">
          <button className="btn sm primary" disabled={busy} onClick={() => onApply(change.id)}>
            <Check size={13} /> Accept
          </button>
          <button className="btn sm danger" disabled={busy} onClick={() => onReject(change.id)}>
            <X size={13} /> Reject
          </button>
          <span className="dim" style={{ marginLeft: 'auto', fontSize: 11.5 }}>
            {new Date(change.createdAt).toLocaleTimeString()}
          </span>
        </div>
      )}
    </div>
  )
}

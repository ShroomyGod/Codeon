import { useEffect, useState } from 'react'
import { Code2, RefreshCw, Trash2 } from 'lucide-react'
import { useStore } from '../store'

const SCRIPT_CLASSES = new Set(['Script', 'LocalScript', 'ModuleScript'])

/** Studio returns property values as JSON, so render anything as text. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

export default function PropertiesView(): React.JSX.Element {
  const studio = useStore((state) => state.studio)
  const instance = useStore((state) => state.instance)
  const loading = useStore((state) => state.instanceLoading)
  const error = useStore((state) => state.instanceError)
  const selectedPath = useStore((state) => state.selectedPath)
  const saveProperty = useStore((state) => state.saveProperty)
  const deleteInstance = useStore((state) => state.deleteInstance)
  const selectPath = useStore((state) => state.selectPath)
  const setTab = useStore((state) => state.setTab)
  const openScript = useStore((state) => state.openScript)

  if (!studio?.connected) {
    return (
      <div className="empty">
        <h2>Nothing to inspect</h2>
        <p>Attach to Studio, then pick an instance in the Explorer to read and edit its properties.</p>
      </div>
    )
  }

  if (!selectedPath) {
    return (
      <div className="empty">
        <h2>No instance selected</h2>
        <p>Choose an instance in the Explorer tab. Every readable property is listed here.</p>
      </div>
    )
  }

  const children = instance?.children?.immediateChildren ?? []
  const properties = Object.entries(instance?.properties ?? {})

  return (
    <div className="scroll-area">
      <div className="props">
        <div className="props-head">
          <div className="grow">
            <div className="mono">{instance?.path ?? selectedPath}</div>
            <div className="props-class">{instance?.className ?? '…'}</div>
          </div>
          <button className="btn sm ghost" title="Reload" onClick={() => void selectPath(selectedPath)}>
            <RefreshCw size={13} />
          </button>
          {instance && SCRIPT_CLASSES.has(instance.className) && (
            <button
              className="btn sm"
              onClick={() => {
                void openScript(instance.path, instance.className)
                setTab('code')
              }}
            >
              <Code2 size={13} /> Edit code
            </button>
          )}
          <button
            className="btn sm danger"
            title="Delete this instance"
            onClick={() => void deleteInstance(selectedPath)}
          >
            <Trash2 size={13} />
          </button>
        </div>

        {loading && <div className="dim">Reading properties…</div>}
        {error && <div className="review-error">{error}</div>}

        {!loading && !error && properties.length === 0 && (
          <div className="dim" style={{ padding: 8 }}>
            {instance?.propertiesError ?? 'Studio reported no properties for this instance.'}
          </div>
        )}

        {properties.map(([key, value]) => (
          <PropertyRow
            key={key}
            label={key}
            value={formatValue(value)}
            onCommit={(next) => void saveProperty(instance!.path, key, next)}
          />
        ))}

        {children.length > 0 && (
          <>
            <div className="prop-attrs-title">
              Children ({instance?.children?.childrenCount ?? children.length}
              {typeof instance?.children?.totalDescendants === 'number'
                ? ` · ${instance.children.totalDescendants} descendants`
                : ''}
              )
            </div>
            {children.map((child) => (
              <div className="prop-row" key={child.path}>
                <span className="prop-key" style={{ paddingLeft: 8 }}>
                  {child.className}
                </span>
                <button
                  className="btn sm ghost"
                  onClick={() => void selectPath(child.path, child.className)}
                >
                  {child.path.split('.').pop()}
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function PropertyRow({
  label,
  value,
  onCommit
}: {
  label: string
  value: string
  onCommit: (next: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setDraft(value)
    setDirty(false)
  }, [value, label])

  const commit = () => {
    if (!dirty) return
    onCommit(draft)
    setDirty(false)
  }

  return (
    <div className="prop-row">
      <span className="prop-key" title={label}>
        {label}
      </span>
      <input
        className="prop-input"
        value={draft}
        spellCheck={false}
        onChange={(event) => {
          setDraft(event.target.value)
          setDirty(true)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            setDraft(value)
            setDirty(false)
            event.currentTarget.blur()
          }
        }}
        style={dirty ? { borderColor: 'var(--accent)' } : undefined}
      />
    </div>
  )
}

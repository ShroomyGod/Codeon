import { useEffect, useRef } from 'react'
import { RotateCcw, Save, X } from 'lucide-react'
import type * as Monaco from 'monaco-editor'
import { shouldPushSource } from '../lib/editor'
import monaco from '../lib/monaco'
import { useStore } from '../store'

export default function CodeView(): React.JSX.Element {
  const editor = useStore((state) => state.editor)
  const updateSource = useStore((state) => state.updateEditorSource)
  const save = useStore((state) => state.saveEditor)
  const close = useStore((state) => state.closeEditor)

  const hostRef = useRef<HTMLDivElement>(null)
  const codeRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const lastPathRef = useRef<string | null>(null)
  const saveRef = useRef(save)

  saveRef.current = save

  /** CodeView is mounted for the whole Code tab, but its host div exists only
   * while a file is open — so the editor is created when that first happens
   * rather than on mount, which found a null host and gave up for good. */
  const open = editor !== null

  useEffect(() => {
    const host = hostRef.current
    if (!open || !host) return
    const instance = monaco.editor.create(host, {
      value: '',
      language: 'lua',
      theme: 'codeon',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 12.5,
      tabSize: 4,
      renderWhitespace: 'selection',
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      // Kept in step with `--mono` in styles.css, which the rest of the app now uses.
      fontFamily: 'ui-monospace, "Cascadia Code", "JetBrains Mono", Consolas, "Courier New", monospace'
    })
    codeRef.current = instance
    lastPathRef.current = null

    const subscription = instance.onDidChangeModelContent(() => {
      updateSource(instance.getValue())
    })
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void saveRef.current()
    })

    return () => {
      subscription.dispose()
      instance.dispose()
      codeRef.current = null
      lastPathRef.current = null
    }
    // One editor per open buffer: kept across re-renders (so the caret, scroll
    // position and undo stack survive typing) and rebuilt only when the file
    // closes and another opens. Source sync happens below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    const instance = codeRef.current
    if (!instance || !editor) return
    if (
      shouldPushSource({
        path: lastPathRef.current,
        showing: instance.getValue(),
        buffer: editor
      })
    ) {
      instance.setValue(editor.source)
      instance.setPosition({ lineNumber: 1, column: 1 })
      instance.revealLine(1)
    }
    // Remembered even when nothing was pushed, so the file that is showing is
    // known before its source arrives.
    lastPathRef.current = editor.path
  }, [editor])

  if (!editor) {
    return (
      <div className="empty">
        <h2>No file open</h2>
        <p>
          Click a script in the Explorer (or press "Edit code" in Properties) to load its source here.
          Saves go straight to Studio and are undoable with Ctrl+Z in the editor.
        </p>
      </div>
    )
  }

  return (
    <div className="editor-wrap">
      <div className="editor-toolbar">
        <span className={`badge ${editor.className === 'ModuleScript' ? 'script' : 'script'}`}>{editor.className}</span>
        <span className="editor-path" title={editor.path}>
          {editor.path}
        </span>
        {editor.dirty && <span className="editor-dot" />}
        <span style={{ marginLeft: 'auto' }} />
        <button
          className="btn sm"
          disabled={!editor.dirty || editor.loading}
          onClick={() => void save()}
          title="Save to Studio (Ctrl+S)"
        >
          <Save size={13} /> Save
        </button>
        <button
          className="btn sm ghost"
          disabled={!editor.dirty}
          onClick={() => updateSource(editor.original)}
          title="Revert local edits"
        >
          <RotateCcw size={13} />
        </button>
        <button className="btn sm ghost" onClick={close} title="Close editor">
          <X size={13} />
        </button>
      </div>

      {editor.error && <div className="review-error">{editor.error}</div>}
      {editor.loading && <div className="dim" style={{ padding: '8px 12px' }}>Loading source…</div>}
      <div className="editor-host" ref={hostRef} />
    </div>
  )
}

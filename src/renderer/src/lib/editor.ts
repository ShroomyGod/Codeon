/**
 * When the store's buffer should be written into the Monaco editor.
 *
 * The store is the source of truth, but the editor must not be overwritten
 * while the user is typing in it (that would fight the caret), and an empty
 * buffer that is still loading must not blank a file that is already open.
 */
export interface EditorSyncState {
  /** Path the editor was last populated from, or null before it holds a file. */
  path: string | null
  /** Text Monaco is showing right now. */
  showing: string
  /** The buffer the store holds for the open file. */
  buffer: { path: string; source: string; loading: boolean }
}

export function shouldPushSource(state: EditorSyncState): boolean {
  // A different file always replaces what is showing, even while its source is
  // still in flight — leaving the previous file's text on screen would be worse
  // than watching it fill in.
  if (state.path !== state.buffer.path) return true
  // The same file is being re-read: `openScript` clears the source first, so
  // pushing now would blank text the user is still reading.
  if (state.buffer.loading) return false
  // Same file, loaded: push only what the editor is not already showing. Source
  // that arrives after the first render lands here — the case a path-only check
  // missed, which left the editor blank. While the user types the store was
  // updated *from* the editor, so the two match and nothing is pushed back.
  return state.showing !== state.buffer.source
}

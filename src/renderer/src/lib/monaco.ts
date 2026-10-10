import * as monaco from 'monaco-editor'
// monaco-editor's exports map rewrites `monaco-editor/<path>` to `esm/vs/<path>`.
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'

/**
 * Luau is close enough to Lua that Monaco's built-in Lua tokenizer gives good
 * highlighting; the editor worker is all we need for the basic languages.
 */
;(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker: () => new EditorWorker()
}

/**
 * The editor wears the shell's palette, not one of its own: `--accent-strong`
 * for the caret, the active line number and keywords, `--bg` for the surface,
 * and `--text`/`--text-faint` for the type. Anything here that drifts warmer
 * than the app reads as a different product.
 */
monaco.editor.defineTheme('codeon', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6d7482', fontStyle: 'italic' },
    { token: 'string', foreground: 'cbe9ba' },
    { token: 'keyword', foreground: 'b79bff' },
    { token: 'number', foreground: 'e5c07b' },
    { token: 'type', foreground: '7aa2ff' }
  ],
  colors: {
    'editor.background': '#0d0f12',
    'editor.foreground': '#d8dbe2',
    'editorLineNumber.foreground': '#6d7482',
    'editorLineNumber.activeForeground': '#b79bff',
    'editor.selectionBackground': '#332a52',
    'editor.lineHighlightBackground': '#14161d',
    'editorCursor.foreground': '#b79bff',
    'editorIndentGuide.background1': '#22262e',
    // Bracket pair colourisation inherits gold from `vs-dark`, which reads as the
    // old orange; cycle the palette's violet, blue and mint instead.
    'editorBracketHighlight.foreground1': '#b79bff',
    'editorBracketHighlight.foreground2': '#7aa2ff',
    'editorBracketHighlight.foreground3': '#4dd4ac',
    'editorBracketHighlight.foreground4': '#c9b4ff',
    'editorBracketHighlight.foreground5': '#9fb6ff',
    'editorBracketHighlight.foreground6': '#7fe3cf',
    'editorBracketHighlight.unexpectedBracket.foreground': '#ff6b81'
  }
})

export default monaco

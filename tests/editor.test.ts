import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { shouldPushSource } from '../src/renderer/src/lib/editor'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (relative: string): string => readFileSync(join(root, relative), 'utf8')

const styles = read('src/renderer/src/styles.css')
const themeSource = read('src/renderer/src/lib/monaco.ts')
const codeView = read('src/renderer/src/components/CodeView.tsx')

/** Reads a custom property from the `:root` block. */
function cssVar(source: string, name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(source)
  assert.ok(match, `--${name} should be declared in styles.css`)
  return match[1].trim()
}

function themeColor(key: string): string {
  const match = new RegExp(`'${key}':\\s*'(#[0-9a-fA-F]+)'`).exec(themeSource)
  assert.ok(match, `${key} should be set in the Codeon Monaco theme`)
  return match[1].toLowerCase()
}

describe('shouldPushSource', () => {
  const buffer = { path: 'StarterGui.CoreUi', source: 'print("hi")', loading: false }

  it('pushes the source that arrives after a file is opened', () => {
    // The regression: the buffer is created empty, the read fills it in later
    // under the same path, and the editor used to stay blank.
    assert.equal(
      shouldPushSource({ path: buffer.path, showing: '', buffer: { ...buffer, source: 'local x = 1' } }),
      true
    )
  })

  it('pushes a newly opened file even while its source is still loading', () => {
    assert.equal(
      shouldPushSource({
        path: 'Workspace.Old',
        showing: 'old text',
        buffer: { ...buffer, source: '', loading: true }
      }),
      true
    )
  })

  it('leaves a reloading file on screen instead of blanking it', () => {
    assert.equal(
      shouldPushSource({
        path: buffer.path,
        showing: 'edits in progress',
        buffer: { ...buffer, source: '', loading: true }
      }),
      false
    )
  })

  it('stays out of the way while the user types', () => {
    // Typing updates the store from the editor, so the two agree and no text is
    // pushed back under the caret.
    assert.equal(
      shouldPushSource({ path: buffer.path, showing: 'print("hi")', buffer }),
      false
    )
  })

  it('restores the stored source when the editor drifts from it', () => {
    assert.equal(
      shouldPushSource({
        path: buffer.path,
        showing: 'unsaved scribble',
        buffer: { ...buffer, source: 'original' }
      }),
      true
    )
  })
})

describe('Codeon Monaco theme', () => {
  it('uses the shell vignette rather than a palette of its own', () => {
    assert.equal(themeColor('editor.background'), cssVar(styles, 'bg'))
    assert.equal(themeColor('editor.foreground'), cssVar(styles, 'text').toLowerCase())
    assert.equal(themeColor('editorLineNumber.foreground'), cssVar(styles, 'text-faint').toLowerCase())
  })

  it('marks the caret, the active line number and keywords with the violet accent', () => {
    const accent = cssVar(styles, 'accent-strong').toLowerCase()
    assert.equal(themeColor('editorCursor.foreground'), accent)
    assert.equal(themeColor('editorLineNumber.activeForeground'), accent)
    assert.match(themeSource, new RegExp(`token: 'keyword', foreground: '${accent.slice(1)}'`, 'i'))
  })

  it('keeps the inherited bracket colours off the warm side of the palette', () => {
    // `vs-dark` hands out gold brackets, which was most of the orange left in
    // the editor once the accent moved to violet.
    const brackets = [1, 2, 3, 4, 5, 6].map((n) => themeColor(`editorBracketHighlight.foreground${n}`))
    assert.equal(brackets.length, 6)
    for (const colour of brackets) {
      const red = parseInt(colour.slice(1, 3), 16)
      const blue = parseInt(colour.slice(5, 7), 16)
      assert.ok(blue > red, `${colour} should be cool, not warm`)
    }
  })
})

describe('app typography', () => {
  it('sets body text in the code editor typeface', () => {
    const sans = cssVar(styles, 'sans')
    assert.ok(
      sans === 'var(--mono)' || sans === cssVar(styles, 'mono'),
      `--sans should be the editor font, got ${sans}`
    )
    assert.match(cssVar(styles, 'mono'), /monospace/)
  })

  it('keeps the editor and the shell on one stack', () => {
    const match = /fontFamily: '([^']+)'/.exec(codeView)
    assert.ok(match, 'CodeView should set a fontFamily')
    assert.equal(match[1], cssVar(styles, 'mono'))
  })
})

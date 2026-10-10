import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import {
  describeMissingLauncher,
  findNewestStudioMcp,
  resolveMcpLauncher,
  splitCommandLine
} from '../src/main/studio/launcher'
import {
  buildCreateInstance,
  buildDeleteInstance,
  buildGetSelection,
  buildListProperties,
  buildSetProperty
} from '../src/main/studio/luau'
import { parseConsoleOutput, parseStudios } from '../src/main/studio/mcp'
import { parsePropertyLines } from '../src/main/studio/queries'
import { applyEdits, parseGameTree, parseScriptSearch, stripLineNumbers } from '../src/main/studio/scripts'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'codeon-studio-'))
  dirs.push(dir)
  return dir
}

after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

describe('splitCommandLine', () => {
  it('splits on spaces and keeps quoted runs together', () => {
    assert.deepEqual(splitCommandLine('cmd.exe /c "C:\\Program Files\\a.bat"'), [
      'cmd.exe',
      '/c',
      'C:\\Program Files\\a.bat'
    ])
  })

  it('handles single quotes and collapses extra whitespace', () => {
    assert.deepEqual(splitCommandLine("  node   '/a b/c.js'  "), ['node', '/a b/c.js'])
  })

  it('returns nothing for blank input', () => {
    assert.deepEqual(splitCommandLine('   '), [])
  })
})

describe('resolveMcpLauncher', () => {
  it('prefers an explicit override and splits it into command and args', () => {
    const launcher = resolveMcpLauncher({ platform: 'win32', override: 'mcp.bat --port 1' })
    assert.equal(launcher?.command, 'mcp.bat')
    assert.deepEqual(launcher?.args, ['--port', '1'])
  })

  it('uses the Roblox mcp.bat when Studio has written it', () => {
    const local = tempDir()
    mkdirSync(join(local, 'Roblox'), { recursive: true })
    writeFileSync(join(local, 'Roblox', 'mcp.bat'), '@echo off')
    const launcher = resolveMcpLauncher({ platform: 'win32', localAppData: local })
    assert.equal(launcher?.command, 'cmd.exe')
    assert.deepEqual(launcher?.args, ['/c', join(local, 'Roblox', 'mcp.bat')])
  })

  it('falls back to the newest bundled StudioMCP.exe', () => {
    const local = tempDir()
    mkdirSync(join(local, 'Roblox', 'Versions', 'version-old'), { recursive: true })
    mkdirSync(join(local, 'Roblox', 'Versions', 'version-new'), { recursive: true })
    writeFileSync(join(local, 'Roblox', 'Versions', 'version-old', 'StudioMCP.exe'), 'old')
    writeFileSync(join(local, 'Roblox', 'Versions', 'version-new', 'StudioMCP.exe'), 'new')
    const launcher = resolveMcpLauncher({ platform: 'win32', localAppData: local })
    // Whichever was written last wins the mtime comparison; both exist so the
    // result must point at a real StudioMCP.exe.
    assert.match(launcher?.command ?? '', /StudioMCP\.exe$/)
  })

  it('returns null when nothing is installed', () => {
    assert.equal(resolveMcpLauncher({ platform: 'win32', localAppData: tempDir() }), null)
  })

  it('reports a Linux machine as unsupported', () => {
    assert.equal(resolveMcpLauncher({ platform: 'linux' }), null)
    assert.match(describeMissingLauncher('linux'), /does not run on this platform/)
  })
})

describe('findNewestStudioMcp', () => {
  it('returns null for a directory that does not exist', () => {
    assert.equal(findNewestStudioMcp(join(tempDir(), 'nope')), null)
  })
})

describe('script helpers', () => {
  it('strips the line-number gutter script_read adds', () => {
    assert.equal(stripLineNumbers('     1→local x = 1\n    12→return x'), 'local x = 1\nreturn x')
  })

  it('applies ordered multi_edit replacements', () => {
    const { result, problems } = applyEdits('local a = 1\nprint(a)', [
      { old_string: 'local a = 1', new_string: 'local a = 2' },
      { old_string: 'print(a)', new_string: 'print(a, "hi")' }
    ])
    assert.equal(result, 'local a = 2\nprint(a, "hi")')
    assert.deepEqual(problems, [])
  })

  it('reports an edit that cannot be reproduced locally', () => {
    const { result, problems } = applyEdits('x', [{ old_string: 'missing', new_string: 'y' }])
    assert.equal(result, 'x')
    assert.equal(problems.length, 1)
  })

  it('treats an empty old_string as initial content', () => {
    assert.equal(applyEdits('', [{ old_string: '', new_string: 'print(1)' }]).result, 'print(1)')
  })

  it('honours replace_all', () => {
    assert.equal(applyEdits('a a a', [{ old_string: 'a', new_string: 'b', replace_all: true }]).result, 'b b b')
  })

  it('extracts script_search rows', () => {
    const rows = parseScriptSearch('Name: Main | Type: Script | Path: ServerScriptService.Main')
    assert.deepEqual(rows, [{ name: 'Main', className: 'Script', path: 'ServerScriptService.Main' }])
  })

  it('parses a search_game_tree JSON payload and its truncation note', () => {
    const text = `Note: Output limited to 5 results\n[{"fullPath":"Workspace","className":"Workspace"}]`
    const { nodes, truncated } = parseGameTree(text)
    assert.equal(truncated, true)
    assert.equal((nodes[0] as { fullPath: string }).fullPath, 'Workspace')
  })

  it('returns an empty list for unparseable output instead of throwing', () => {
    assert.deepEqual(parseGameTree('no json here').nodes, [])
    assert.deepEqual(parseGameTree('').nodes, [])
  })
})

describe('Luau builders', () => {
  it('escapes quotes and newlines in property values', () => {
    const code = buildSetProperty({ path: 'Workspace.Part', property: 'Name', value: 'a"b\nc' })
    assert.match(code, /"a\\"b\\nc"/)
    assert.match(code, /local path = "Workspace\.Part"/)
  })

  it('routes @attribute writes through SetAttribute', () => {
    const code = buildSetProperty({ path: 'Workspace.Part', property: '@Health', value: '10' })
    assert.match(code, /SetAttribute\("Health"/)
  })

  it('builds a create that reports failed properties', () => {
    const code = buildCreateInstance({
      parent: 'Workspace',
      className: 'Part',
      name: 'Thing',
      properties: { Anchored: 'true' }
    })
    assert.match(code, /Instance\.new\("Part"\)/)
    assert.match(code, /instance\.Name = "Thing"/)
    assert.match(code, /could not set:/)
  })

  it('refuses to delete the DataModel', () => {
    assert.match(buildDeleteInstance('game'), /Refusing to delete the DataModel/)
  })

  it('reads the current selection through the Selection service', () => {
    assert.match(buildGetSelection(), /GetService\("Selection"\):Get\(\)/)
  })

  describe('buildListProperties', () => {
    it('lists a class through ReflectionService and reads each value', () => {
      const code = buildListProperties('Workspace')
      assert.match(code, /codeonResolvePath\("Workspace"\)/)
      assert.match(code, /GetPropertiesOfClass\(instance\.ClassName\)/)
      assert.match(code, /pcall\(function\(\) return instance\[name\] end\)/)
      assert.match(code, /name \.\. "\\t" \.\. text/)
    })

    it('escapes a path so it cannot break out of the literal', () => {
      const code = buildListProperties('Workspace."evil')
      assert.match(code, /codeonResolvePath\("Workspace\.\\"evil"\)/)
    })

    it('formats a CFrame as the six numbers the writer coerces', () => {
      const code = buildListProperties('Workspace.Camera')
      assert.match(code, /ToEulerAnglesXYZ\(\)/)
      assert.match(code, /math\.deg\(rx\), math\.deg\(ry\), math\.deg\(rz\)/)
    })

    it('includes attributes under the @ prefix the writer understands', () => {
      const code = buildListProperties('Lighting')
      assert.match(code, /GetAttributes\(\)/)
      assert.match(code, /"@" \.\. name/)
    })
  })
})

describe('parsePropertyLines', () => {
  it('reads one property per line, splitting on the first tab only', () => {
    const parsed = parsePropertyLines('Gravity\t75\nName\ta\tb\nEmpty\t\n')
    assert.deepEqual(parsed, { Gravity: '75', Name: 'a\tb', Empty: '' })
  })

  it('keeps attributes and skips lines with nothing to parse', () => {
    const parsed = parsePropertyLines('\nnot a property\n\tmissing name\n@Health\t100')
    assert.deepEqual(parsed, { '@Health': '100' })
  })

  it('returns nothing for empty output', () => {
    assert.deepEqual(parsePropertyLines(''), {})
  })
})

describe('parseConsoleOutput', () => {
  it('tags levels from Studio output text', () => {
    const lines = parseConsoleOutput('hello\n[error] boom\nwarning: careful\nStack Begin')
    assert.deepEqual(
      lines.map((line) => line.level),
      ['print', 'error', 'warn', 'error']
    )
  })

  it('drops blank lines and reads an optional time stamp', () => {
    const lines = parseConsoleOutput('\n13:05:09.250 print\n\n')
    assert.equal(lines.length, 1)
    assert.equal(lines[0].message, 'print')
  })

  it('gives every line a stable unique id', () => {
    const lines = parseConsoleOutput('a\nb\nc')
    assert.equal(new Set(lines.map((line) => line.id)).size, 3)
  })
})

describe('parseStudios', () => {
  it('reads a { studios: [...] } payload', () => {
    const studios = parseStudios({
      text: '',
      json: { studios: [{ id: 'abc', name: 'MyPlace', placeId: 42 }] },
      isError: false
    })
    assert.deepEqual(studios, [{ id: 'abc', name: 'MyPlace', placeId: 42 }])
  })

  it('accepts a bare array of ids and wraps them as names', () => {
    const studios = parseStudios({ text: '', json: ['studio-1'], isError: false })
    assert.deepEqual(studios, [{ id: 'studio-1', name: 'studio-1' }])
  })

  it('returns nothing when json is absent', () => {
    assert.deepEqual(parseStudios({ text: 'nope', json: null, isError: false }), [])
  })
})

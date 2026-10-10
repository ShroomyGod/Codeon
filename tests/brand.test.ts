import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { ACTION_BLOCK } from '../src/main/ai/prompt'
import { parseActions } from '../src/main/ai/protocol'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (relative: string): string => readFileSync(join(root, relative), 'utf8')

const pkg = JSON.parse(read('package.json')) as { name: string; productName: string }

/** The previous product name, spelled indirectly so this file cannot match itself. */
const previousName = 'Shroom' + 'AI'
/** The GitHub repository kept its original name, so links to it stay valid. */
const repoPath = `ShroomyGod/${previousName}`

/** Every text file under the given directories, so a rename cannot leave strays. */
function textFiles(dirs: string[]): string[] {
  const skip = new Set(['node_modules', 'out', 'dist', '.git'])
  const found: string[] = []
  for (const dir of dirs) {
    const walk = (relative: string): void => {
      for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
        if (skip.has(entry.name)) continue
        const next = join(relative, entry.name)
        if (entry.isDirectory()) walk(next)
        else if (/\.(ts|tsx|js|mjs|json|md|yml|html|css)$/.test(entry.name)) found.push(next)
      }
    }
    walk(dir)
  }
  return found
}

describe('brand', () => {
  it('names the app Codeon everywhere a name is shown', () => {
    assert.equal(pkg.name, 'codeon')
    assert.equal(pkg.productName, 'Codeon')
    assert.match(read('src/renderer/index.html'), /<title>Codeon<\/title>/)
    assert.match(read('src/main/index.ts'), /title: 'Codeon'/)
    assert.match(read('src/main/ai/prompt.ts'), /You are Codeon,/)
  })

  it('left the previous product name nowhere but where it is still needed', () => {
    // Two uses stay on purpose: the GitHub repository never changed name, and
    // the data migration has to look for the folder the old name created.
    const strip = (text: string): string =>
      text
        .split(repoPath)
        .join('')
        .split(`'${previousName}'`)
        .join('')
        .split(`'${previousName.toLowerCase()}'`)
        .join('')

    const strays = textFiles(['src', 'tests', 'docs']).filter((file) =>
      new RegExp(previousName, 'i').test(strip(read(file)))
    )
    assert.deepEqual(strays, [], 'the previous product name still appears in these files')
  })

  it('builds the action fence from one exported tag', () => {
    // Regression: the fence was a literal in three places, so a rename could
    // leave the prompt asking for one tag and the parser looking for another.
    for (const file of ['src/main/ai/agent.ts', 'src/main/ai/protocol.ts']) {
      const text = read(file)
      assert.ok(text.includes('ACTION_BLOCK'), `${file} should use the exported tag`)
      assert.ok(!text.includes('```' + ACTION_BLOCK), `${file} should not hard-code the fence`)
    }

    const parsed = parseActions('```' + ACTION_BLOCK + '\n{"tool":"studio_status"}\n```')
    assert.equal(parsed.actions.length, 1)
    assert.equal(parsed.actions[0].tool, 'studio_status')
  })

  it('ships the brand marks', () => {
    for (const file of [
      'build/icon-source.png',
      'build/icon.png',
      'build/icon.ico',
      'resources/icon.png',
      'src/renderer/src/assets/logo.png',
      'src/renderer/src/assets/logo-large.png'
    ]) {
      assert.ok(existsSync(join(root, file)), `${file} is missing`)
    }
  })
})

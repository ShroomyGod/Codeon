#!/usr/bin/env node
/**
 * Codeon release automation — `npm run release`.
 *
 * Version rules for this project:
 *   - `--bump patch` (default) is a BUG FIX release:      1.0.0 -> 1.0.1
 *   - `--bump minor` is a WHOLE feature release:          1.0.0 -> 1.1.0
 *
 * Tags follow the line, not the patch:
 *   1.0.0, 1.0.1 and 1.0.2 are all published under the tag `v1.0.0`.
 *   A feature release opens a new tag (`v1.1.0`) and a new GitHub release.
 *   Every later patch appends its notes and installer to that same release.
 *
 * Typical use:
 *   npm run release -- --bump minor --title "Projects and playtests"
 *   npm run release -- --bump patch --notes "Fixed the explorer crashing on Models"
 *
 * Options:
 *   --bump <patch|minor>   which version field to bump (default: patch)
 *   --title <text>         headline for the GitHub release
 *   --notes <text>         highlight / summary paragraph
 *   --version <x.y.z>      force an exact version instead of bumping
 *   --dry-run              do everything except build, commit, tag and upload
 *   --skip-build           reuse the existing installer in dist/
 *   --no-push              commit and tag locally, do not touch GitHub
 *   --prerelease           mark the GitHub release as a pre-release
 *   --token <token>        GitHub token (defaults to $GITHUB_TOKEN / $GH_TOKEN)
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bumpVersion, formatVersion, isLineStart, parseVersion, tagForVersion } from '../src/shared/version.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGE = join(root, 'package.json')
const CHANGELOG = join(root, 'CHANGELOG.md')
const DIST = join(root, 'dist')

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const color = {
  dim: (text) => `\u001b[2m${text}\u001b[0m`,
  bold: (text) => `\u001b[1m${text}\u001b[0m`,
  green: (text) => `\u001b[32m${text}\u001b[0m`,
  yellow: (text) => `\u001b[33m${text}\u001b[0m`,
  red: (text) => `\u001b[31m${text}\u001b[0m`
}

function step(message) {
  console.log(`\n${color.bold('▸')} ${message}`)
}
function ok(message) {
  console.log(`  ${color.green('✓')} ${message}`)
}
function warn(message) {
  console.log(`  ${color.yellow('!')} ${message}`)
}
function fail(message) {
  console.error(`  ${color.red('✗')} ${message}`)
}

const isWindows = process.platform === 'win32'

/** Runs a command, inheriting stdio, and throws on a non-zero exit. */
function run(command, args, options = {}) {
  const printable = [command, ...args].join(' ')
  if (options.echo !== false) console.log(color.dim(`  $ ${printable}`))
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options })
  if (result.error) throw new Error(`Could not run ${printable}: ${result.error.message}`)
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${printable}`)
  }
  return result
}

/**
 * Runs npm without a shell. npm re-exports its own entry point, which lets us
 * invoke it through the current Node binary on every platform.
 */
function npmRun(args) {
  const execPath = process.env.npm_execpath
  if (execPath && !execPath.endsWith('.cmd')) {
    return run(process.execPath, [execPath, ...args])
  }
  return run(isWindows ? 'npm.cmd' : 'npm', args, isWindows ? { shell: true } : {})
}

/** Runs a command and returns trimmed stdout. */
function capture(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' })
  if (result.error) throw new Error(`Could not run ${command}: ${result.error.message}`)
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}\n${result.stderr ?? ''}`)
  }
  return (result.stdout ?? '').trim()
}

function tryCapture(command, args) {
  try {
    return capture(command, args)
  } catch {
    return null
  }
}

function parseArgs(argv) {
  const options = {
    bump: 'patch',
    title: '',
    notes: '',
    version: '',
    dryRun: false,
    skipBuild: false,
    noPush: false,
    prerelease: false,
    token: process.env.CODEON_GITHUB_TOKEN || process.env.SHROOM_GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      index += 1
      if (index >= argv.length) throw new Error(`${arg} needs a value`)
      return argv[index]
    }
    switch (arg) {
      case '--bump':
      case '-b': {
        const value = next()
        if (value !== 'patch' && value !== 'minor' && value !== 'major') {
          throw new Error(`--bump must be patch, minor or major (got "${value}")`)
        }
        options.bump = value
        break
      }
      case '--title':
        options.title = next()
        break
      case '--notes':
        options.notes = next()
        break
      case '--version':
        options.version = next()
        break
      case '--token':
        options.token = next()
        break
      case '--dry-run':
        options.dryRun = true
        break
      case '--skip-build':
        options.skipBuild = true
        break
      case '--no-push':
        options.noPush = true
        break
      case '--prerelease':
        options.prerelease = true
        break
      case '--help':
      case '-h':
        console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0])
        process.exit(0)
        break
      default:
        throw new Error(`Unknown option: ${arg}`)
    }
  }
  return options
}

/* ------------------------------------------------------------------ */
/* Repository helpers                                                  */
/* ------------------------------------------------------------------ */

function git(...args) {
  return capture('git', args)
}

function gitSafe(...args) {
  return tryCapture('git', args)
}

function parseRemote(url) {
  const https = /github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?\/?$/.exec(url)
  if (!https) return null
  return { owner: https[1], repo: https[2] }
}

function detectRepo() {
  const remote = process.env.CODEON_REPO || process.env.SHROOM_REPO || gitSafe('remote', 'get-url', 'origin')
  if (!remote) return { owner: 'ShroomyGod', repo: 'Codeon', fromRemote: false }
  const parsed = parseRemote(remote)
  if (!parsed) return { owner: 'ShroomyGod', repo: 'Codeon', fromRemote: false }
  return { ...parsed, fromRemote: true }
}

function commitsSince(ref) {
  const range = ref ? `${ref}..HEAD` : 'HEAD'
  const output = gitSafe('log', range, '--no-merges', '--pretty=format:%h|%s')
  if (!output) return []
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, ...rest] = line.split('|')
      return { hash, subject: rest.join('|') }
    })
}

/** Classifies commits so the release notes read like a changelog. */
function categorize(commits) {
  const buckets = { feature: [], fix: [], perf: [], docs: [], chore: [] }
  for (const commit of commits) {
    const subject = commit.subject
    if (/^release:/i.test(subject)) continue
    const entry = `- ${subject} (${commit.hash})`
    if (/^(feat|feature|add)(\(|:|\s)/i.test(subject)) buckets.feature.push(entry)
    else if (/^(fix|bugfix|patch)(\(|:|\s)/i.test(subject)) buckets.fix.push(entry)
    else if (/^(perf|optimi[sz]e)(\(|:|\s)/i.test(subject)) buckets.perf.push(entry)
    else if (/^(docs?|readme)(\(|:|\s)/i.test(subject)) buckets.docs.push(entry)
    else buckets.chore.push(entry)
  }
  return buckets
}

/* ------------------------------------------------------------------ */
/* Changelog                                                           */
/* ------------------------------------------------------------------ */

const CHANGELOG_HEADER = `# Changelog

Every Codeon release is documented here.

Version scheme: a **bug-fix** release bumps the patch (1.0.0 → 1.0.1), a **feature**
release bumps the minor (1.0.0 → 1.1.0). Tags follow the line — every patch of a
line is published under that line's first tag (1.0.2 lives under \`v1.0.0\`).
`

function today() {
  return new Date().toISOString().slice(0, 10)
}

function buildEntry(version, notes, buckets) {
  const lines = [`### ${version} — ${today()}`]
  if (notes) lines.push('', notes.trim())
  if (buckets.feature.length) lines.push('', '**Features**', ...buckets.feature)
  if (buckets.fix.length) lines.push('', '**Fixes**', ...buckets.fix)
  if (buckets.perf.length) lines.push('', '**Performance**', ...buckets.perf)
  if (buckets.docs.length) lines.push('', '**Docs**', ...buckets.docs)
  if (buckets.chore.length) lines.push('', '**Other**', ...buckets.chore)
  if (
    !buckets.feature.length &&
    !buckets.fix.length &&
    !buckets.perf.length &&
    !buckets.docs.length &&
    !buckets.chore.length &&
    !notes
  ) {
    lines.push('', '- Maintenance release.')
  }
  return lines.join('\n')
}

/**
 * Inserts the new version at the top of its line's section, opening that
 * section (and therefore the tag it belongs to) when this is the line's first
 * release. Everything already in the file is preserved verbatim.
 */
function updateChangelog(version, notes, buckets) {
  const existing = existsSync(CHANGELOG) ? readFileSync(CHANGELOG, 'utf8') : CHANGELOG_HEADER
  const tag = tagForVersion(version)
  const heading = `## ${tag}`
  const entry = buildEntry(version, notes, buckets)
  const start = existing.indexOf(heading)

  if (start === -1) {
    const firstSection = existing.indexOf('\n## ')
    const preamble = (firstSection === -1 ? existing : existing.slice(0, firstSection)).trimEnd()
    const rest = firstSection === -1 ? '' : existing.slice(firstSection).trim()
    const updated = `${preamble}\n\n${heading}\n\n${entry}${rest ? `\n\n${rest}` : ''}\n`
    writeFileSync(CHANGELOG, updated, 'utf8')
    return { created: true }
  }

  const afterHeading = start + heading.length
  const rest = existing.slice(afterHeading)
  const nextSection = rest.indexOf('\n## ')
  const body = (nextSection === -1 ? rest : rest.slice(0, nextSection)).trim()
  const tail = nextSection === -1 ? '' : rest.slice(nextSection).trim()

  const rebuilt = `${heading}\n\n${entry}${body ? `\n\n${body}` : ''}`
  const updated = `${existing.slice(0, start)}${rebuilt}${tail ? `\n\n${tail}` : ''}\n`
  writeFileSync(CHANGELOG, updated, 'utf8')
  return { created: false }
}

/** Pulls the changelog body for one version back out, for the release page. */
function changelogSectionFor(version) {
  if (!existsSync(CHANGELOG)) return ''
  const text = readFileSync(CHANGELOG, 'utf8')
  const marker = `### ${version} —`
  const start = text.indexOf(marker)
  if (start === -1) return ''
  const rest = text.slice(start)
  const nextVersion = rest.indexOf('\n### ', marker.length)
  const nextTag = rest.indexOf('\n## ', marker.length)
  const ends = [nextVersion, nextTag].filter((index) => index > 0)
  const end = ends.length ? Math.min(...ends) : rest.length
  return rest.slice(0, end).trim()
}

/* ------------------------------------------------------------------ */
/* Build + artifacts                                                   */
/* ------------------------------------------------------------------ */

/**
 * Deletes every stale installer from dist/ before the build runs, so the
 * folder always holds exactly one installer: the one this release just made.
 * Old exe/dmg/AppImage files (and their .blockmap companions) are removed,
 * while release notes, sha tables and the win-unpacked preview are kept.
 */
function clearStaleInstallers() {
  if (!existsSync(DIST)) return
  const removed = []
  for (const name of readdirSync(DIST)) {
    if (!/\.(exe|dmg|AppImage|blockmap|zip)$/i.test(name)) continue
    const file = join(DIST, name)
    try {
      rmSync(file)
      removed.push(name)
    } catch (error) {
      warn(`could not delete ${name}: ${error.message ?? error}`)
    }
  }
  if (removed.length) ok(`cleared ${removed.length} old artifact${removed.length === 1 ? '' : 's'} from dist/`)
  else ok('dist/ already clean')
}

function installerFor(version) {
  if (!existsSync(DIST)) return null
  const candidates = readdirSync(DIST)
    .filter((name) => /\.(exe|dmg|AppImage)$/i.test(name))
    .filter((name) => !/\.blockmap$/i.test(name))
    .map((name) => ({
      name,
      path: join(DIST, name),
      // Prefer an artifact that actually carries the new version.
      versionMatch: name.includes(version) ? 1 : 0,
      mtime: statSync(join(DIST, name)).mtimeMs
    }))
    .sort((a, b) => b.versionMatch - a.versionMatch || b.mtime - a.mtime)
  return candidates[0] ?? null
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/* ------------------------------------------------------------------ */
/* GitHub                                                              */
/* ------------------------------------------------------------------ */

function githubApi(token) {
  const base = 'https://api.github.com'
  return async function request(method, path, body) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Codeon-release-script',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    })
    const text = await response.text()
    let parsed = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = { raw: text }
    }
    if (!response.ok && response.status !== 404) {
      throw new Error(`GitHub ${method} ${path} failed (${response.status}): ${parsed?.message ?? text}`)
    }
    return { status: response.status, data: parsed }
  }
}

async function findRelease(api, owner, repo, tag) {
  const result = await api('GET', `/repos/${owner}/${repo}/releases/tags/${tag}`)
  return result.status === 404 ? null : result.data
}

async function deleteExistingAsset(api, owner, repo, releaseId, name) {
  const list = await api('GET', `/repos/${owner}/${repo}/releases/${releaseId}/assets?per_page=100`)
  const existing = (list.data ?? []).find((asset) => asset.name === name)
  if (!existing) return false
  await api('DELETE', `/repos/${owner}/${repo}/releases/assets/${existing.id}`)
  return true
}

async function uploadAsset(token, owner, repo, releaseId, file) {
  const name = file.split(/[/\\]/).pop()
  const bytes = readFileSync(file)
  const response = await fetch(
    `https://uploads.github.com/repos/${owner}/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(bytes.length),
        'User-Agent': 'Codeon-release-script'
      },
      body: bytes
    }
  )
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Asset upload failed (${response.status}): ${text}`)
  }
  return response.json()
}

/* ------------------------------------------------------------------ */
/* Release notes                                                       */
/* ------------------------------------------------------------------ */

function buildReleaseBody({ version, tag, title, config, changelog, host, commitList, asset }) {
  const lines = []
  const headline = title || config.title || `Codeon ${version}`
  lines.push(`# ${headline}`)
  lines.push('')
  if (config.notes) {
    lines.push(config.notes.trim())
    lines.push('')
  }

  const type = isLineStart(version) ? 'Feature release' : 'Bug-fix release'
  lines.push(`> ${type} · version **${version}** · tag \`${tag}\``)
  lines.push('')

  if (changelog) {
    lines.push(changelog.replace(/^### .*$/m, `## What's new in ${version}`))
    lines.push('')
  } else if (commitList.length) {
    lines.push(`## What's new in ${version}`)
    lines.push('')
    lines.push(...commitList)
    lines.push('')
  }

  if (asset) {
    lines.push('## Install')
    lines.push('')
    lines.push('| File | Size | SHA-256 |')
    lines.push('| --- | --- | --- |')
    lines.push(`| \`${asset.name}\` | ${humanSize(asset.bytes)} | \`${asset.sha256}\` |`)
    lines.push('')
    lines.push('Download the installer above, run it, then open Roblox Studio and click')
    lines.push('**Codeon → Connect** in the toolbar to attach the session.')
    lines.push('')
    lines.push('> Windows SmartScreen may warn about an unsigned installer — choose *More info → Run anyway*.')
    lines.push('')
  }

  lines.push('## Getting the model access')
  lines.push('')
  lines.push('- **No setup:** OpenCode Zen free models, 100 anonymous requests per day.')
  lines.push('- **Your own key:** OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, DeepSeek, Mistral,')
  lines.push('  xAI, Together, Cerebras, or a local Ollama / LM Studio server — all configured in Settings.')
  lines.push('')

  lines.push(`**Full changelog:** [CHANGELOG.md](https://github.com/${host.owner}/${host.repo}/blob/main/CHANGELOG.md)`)
  lines.push('')

  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const config = parseArgs(process.argv.slice(2))
  const pkg = JSON.parse(readFileSync(PACKAGE, 'utf8'))
  const current = pkg.version

  if (config.version) {
    parseVersion(config.version) // validate
    if (!/^\d+\.\d+\.\d+$/.test(config.version)) throw new Error('--version must look like 1.2.3')
  }
  const next = config.version || formatVersion(bumpVersion(current, config.bump))
  const tag = tagForVersion(next)
  const lineStart = isLineStart(next)
  const host = detectRepo()

  console.log(color.bold('\nCodeon release'))
  console.log(`  current version : ${current}`)
  console.log(`  next version    : ${next} (${config.bump})`)
  console.log(`  tag             : ${tag}${lineStart ? '  (new tag / new release)' : '  (appended to the existing release)'}`)
  console.log(`  repository      : ${host.owner}/${host.repo}${host.fromRemote ? '' : '  (remote not found, using defaults)'}`)
  if (config.dryRun) console.log(color.yellow('  DRY RUN — nothing will be built, committed or uploaded'))

  /* --- guard rails ------------------------------------------------- */
  const dirty = gitSafe('status', '--porcelain')
  if (!config.dryRun && dirty) {
    const tracked = dirty.split('\n').filter((line) => !line.startsWith('??')).length
    if (tracked > 0) {
      warn('You have uncommitted changes. They will be included in the release commit.')
    }
  }

  // Anchor the note range to the previous release commit rather than the tag:
  // a patch release keeps the same tag, so using the tag would re-publish the
  // commits that the earlier patch of the line already documented.
  const lastReleaseCommit = gitSafe('log', '--grep', '^release:', '-1', '--pretty=format:%H')
  const previousTag = gitSafe('describe', '--tags', '--abbrev=0', '--match', 'v*')
  const since = lastReleaseCommit || previousTag || undefined
  const commits = commitsSince(since)
  const commitList = commits.map((commit) => `- ${commit.subject} (${commit.hash})`)
  const buckets = categorize(commits)
  console.log(
    `  changes since   : ${since ? `${since.slice(0, 7)} (${commits.length} commit${commits.length === 1 ? '' : 's'})` : 'the beginning of history'}`
  )

  /* --- changelog --------------------------------------------------- */
  step('Updating CHANGELOG.md')
  if (config.dryRun) {
    ok(`would write the ${next} entry under ${tag}`)
  } else {
    const result = updateChangelog(next, config.notes, buckets)
    ok(result.created ? `opened changelog section ${tag}` : `appended ${next} to ${tag}`)
  }

  /* --- version bump ------------------------------------------------ */
  if (!config.dryRun && pkg.version !== next) {
    step('Bumping package.json')
    pkg.version = next
    writeFileSync(PACKAGE, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
    ok(`version ${current} → ${next}`)
  }

  /* --- build ------------------------------------------------------- */
  let asset = null
  if (config.skipBuild) {
    step('Skipping the build (--skip-build)')
    asset = installerFor(next)
    if (asset) ok(`found existing ${asset.name}`)
    else warn('no installer found in dist/ — the release will have no download attached')
  } else {
    step('Building the installer')
    if (config.dryRun) {
      ok('would run: npm run build && electron-builder --win')
    } else {
      clearStaleInstallers()
      npmRun(['run', 'build'])
      npmRun(['exec', '--', 'electron-builder', '--win', '--config', 'electron-builder.yml'])
      ok('installer built')
    }
  }

  if (asset && !config.dryRun) {
    asset.bytes = statSync(asset.path).size
    asset.sha256 = sha256(asset.path)
    ok(`${asset.name} · ${humanSize(asset.bytes)}`)
  }
  if (asset && config.dryRun) {
    asset.bytes = 0
    asset.sha256 = '(dry run)'
  }

  /* --- release notes ----------------------------------------------- */
  const section = config.dryRun ? '' : changelogSectionFor(next)
  const body = buildReleaseBody({
    version: next,
    tag,
    title: config.title,
    config,
    changelog: section,
    host,
    commitList,
    asset
  })

  step('Release notes')
  console.log(
    color.dim(
      body
        .split('\n')
        .map((line) => `  │ ${line}`)
        .join('\n')
    )
  )

  if (config.dryRun) {
    console.log(color.yellow('\nDry run complete — no changes were made.\n'))
    return
  }

  const notesFile = join(DIST, `RELEASE_NOTES_${next}.md`)
  mkdirSync(DIST, { recursive: true })
  writeFileSync(notesFile, body, 'utf8')
  ok(`wrote ${notesFile}`)

  /* --- commit + tag ------------------------------------------------ */
  step('Committing and tagging')
  const hasHistory = Boolean(gitSafe('rev-parse', '--verify', '--quiet', 'HEAD'))
  if (hasHistory) {
    run('git', ['add', 'package.json', 'CHANGELOG.md'])
  } else {
    // Brand new repository: the release commit also has to seed the history.
    warn('no commits yet — this release commit will include the whole project')
    run('git', ['add', '-A'])
  }

  const commitMessage = [
    `release: v${next}${config.title ? ` — ${config.title}` : ''}`,
    '',
    `🤖 Generated with Codebuff`,
    `Co-Authored-By: Codebuff <noreply@codebuff.com>`
  ].join('\n')
  run('git', ['commit', '-m', commitMessage])
  ok(`committed v${next}`)

  const tagExistsLocally = gitSafe('rev-parse', '--verify', '--quiet', `refs/tags/${tag}`) !== null

  if (lineStart) {
    if (tagExistsLocally) {
      warn(`tag ${tag} already exists locally — leaving it alone`)
    } else {
      run('git', ['tag', '-a', tag, '-m', `Codeon ${next}`])
      ok(`created tag ${tag}`)
    }
  } else if (tagExistsLocally) {
    ok(`publishing under the existing tag ${tag}`)
  } else {
    // A patch release reuses its line's tag. Pull the published one down rather
    // than inventing a conflicting local tag at this commit.
    warn(`tag ${tag} is not in this clone — fetching it from origin`)
    const fetched = gitSafe('fetch', '--quiet', 'origin', `refs/tags/${tag}:refs/tags/${tag}`)
    if (fetched === null) {
      warn(`origin has no ${tag} either — creating it at this commit`)
      run('git', ['tag', '-a', tag, '-m', `Codeon ${tag}`])
    } else {
      ok(`using the published tag ${tag}`)
    }
  }

  /* --- push -------------------------------------------------------- */
  if (config.noPush) {
    warn('--no-push set: skipping git push and the GitHub release')
    console.log('')
    return
  }

  step('Pushing to GitHub')
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
  run('git', ['push', 'origin', branch])
  run('git', ['push', 'origin', `refs/tags/${tag}`])
  ok(`pushed ${branch} and ${tag}`)

  /* --- GitHub release --------------------------------------------- */
  if (!config.token) {
    warn('No GitHub token found — skipping the release upload.')
    console.log('')
    console.log('  Set one of GITHUB_TOKEN / GH_TOKEN / CODEON_GITHUB_TOKEN, or pass --token.')
    console.log('  The commit and tag are already pushed; create the release manually if you prefer.')
    console.log('')
    return
  }

  step(`Publishing the GitHub release for ${tag}`)
  const api = githubApi(config.token)

  let release = await findRelease(api, host.owner, host.repo, tag)
  if (release) {
    const updated = await api('PATCH', `/repos/${host.owner}/${host.repo}/releases/${release.id}`, {
      name: config.title ? `Codeon ${tag} — ${config.title}` : release.name,
      body,
      prerelease: config.prerelease
    })
    release = updated.data
    ok(`updated the existing release ${tag}`)
  } else {
    const created = await api('POST', `/repos/${host.owner}/${host.repo}/releases`, {
      tag_name: tag,
      name: config.title ? `Codeon ${next} — ${config.title}` : `Codeon ${next}`,
      body,
      draft: false,
      prerelease: config.prerelease
    })
    release = created.data
    ok(`created the release ${tag}`)
  }

  if (asset) {
    step('Uploading the installer')
    const name = asset.path.split(/[/\\]/).pop()
    if (await deleteExistingAsset(api, host.owner, host.repo, release.id, name)) {
      ok(`replaced the previous ${name}`)
    }
    const uploaded = await uploadAsset(config.token, host.owner, host.repo, release.id, asset.path)
    ok(`uploaded ${uploaded.name ?? name}`)
  }

  console.log('')
  console.log(color.green(color.bold(`Released Codeon ${next} under ${tag}`)))
  console.log(`  ${release.html_url}`)
  console.log('')
}

main().catch((error) => {
  console.error('')
  fail(error instanceof Error ? error.message : String(error))
  console.error('')
  process.exit(1)
})

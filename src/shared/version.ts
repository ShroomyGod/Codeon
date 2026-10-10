/**
 * Version rules for Codeon releases.
 *
 * The scheme the project uses:
 *   - a bug-fix release bumps the PATCH field     1.0.0 -> 1.0.1
 *   - a feature ("whole") release bumps the MINOR  1.0.0 -> 1.1.0
 *   - tags only ever point at the FIRST version of a line, i.e. `vX.Y.0`.
 *     A patch release therefore updates the release that already exists for
 *     its line: 1.0.2 is published under the `v1.0.0` tag.
 */

export interface Semver {
  major: number
  minor: number
  patch: number
}

export type BumpType = 'patch' | 'minor' | 'major'

export function formatVersion(version: Semver): string {
  return `${version.major}.${version.minor}.${version.patch}`
}

export function parseVersion(input: string): Semver {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(input).trim())
  if (!match) throw new Error(`Not a valid semver version: "${input}"`)
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

/** Applies a bump. `minor` is a feature release, `patch` is a bug fix. */
export function bumpVersion(current: string | Semver, type: BumpType): Semver {
  const version = typeof current === 'string' ? parseVersion(current) : current
  switch (type) {
    case 'major':
      return { major: version.major + 1, minor: 0, patch: 0 }
    case 'minor':
      return { major: version.major, minor: version.minor + 1, patch: 0 }
    case 'patch':
      return { major: version.major, minor: version.minor, patch: version.patch + 1 }
    default:
      throw new Error(`Unknown bump type: ${type}`)
  }
}

/**
 * The tag a version is published under. Every patch of a line shares the tag
 * created for the line's first release.
 *
 *   1.0.0 -> v1.0.0
 *   1.0.2 -> v1.0.0
 *   1.1.0 -> v1.1.0
 */
export function tagForVersion(version: string | Semver): string {
  const { major, minor } = typeof version === 'string' ? parseVersion(version) : version
  return `v${major}.${minor}.0`
}

/** True when this version is the first of its line and owns its tag. */
export function isLineStart(version: string | Semver): boolean {
  const { patch } = typeof version === 'string' ? parseVersion(version) : version
  return patch === 0
}

/** Comparator for sorting version strings ascending. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch
}

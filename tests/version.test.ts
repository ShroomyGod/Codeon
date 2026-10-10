import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bumpVersion,
  compareVersions,
  formatVersion,
  isLineStart,
  parseVersion,
  tagForVersion
} from '../src/shared/version'

describe('parseVersion', () => {
  it('parses plain and v-prefixed versions', () => {
    assert.deepEqual(parseVersion('1.2.3'), { major: 1, minor: 2, patch: 3 })
    assert.deepEqual(parseVersion('v2.0.10'), { major: 2, minor: 0, patch: 10 })
  })

  it('rejects nonsense', () => {
    assert.throws(() => parseVersion('not-a-version'))
  })
})

describe('bumpVersion', () => {
  it('treats a patch bump as a bug-fix release', () => {
    assert.deepEqual(bumpVersion('1.0.0', 'patch'), { major: 1, minor: 0, patch: 1 })
    assert.deepEqual(bumpVersion('1.0.9', 'patch'), { major: 1, minor: 0, patch: 10 })
  })

  it('treats a minor bump as a whole feature release and resets the patch', () => {
    assert.deepEqual(bumpVersion('1.0.3', 'minor'), { major: 1, minor: 1, patch: 0 })
  })

  it('formats back to a dotted string', () => {
    assert.equal(formatVersion(bumpVersion('1.0.2', 'minor')), '1.1.0')
  })
})

describe('tagForVersion', () => {
  it('keeps every patch of a line on the line-opening tag', () => {
    assert.equal(tagForVersion('1.0.0'), 'v1.0.0')
    assert.equal(tagForVersion('1.0.1'), 'v1.0.0')
    assert.equal(tagForVersion('1.0.2'), 'v1.0.0')
  })

  it('opens a fresh tag for a feature release', () => {
    assert.equal(tagForVersion('1.1.0'), 'v1.1.0')
    assert.equal(tagForVersion('1.1.4'), 'v1.1.0')
    assert.equal(tagForVersion('2.0.0'), 'v2.0.0')
  })
})

describe('isLineStart', () => {
  it('is true only for the first version of a line', () => {
    assert.equal(isLineStart('1.0.0'), true)
    assert.equal(isLineStart('1.0.1'), false)
    assert.equal(isLineStart('1.1.0'), true)
  })
})

describe('compareVersions', () => {
  it('orders by major, then minor, then patch', () => {
    assert.ok(compareVersions('1.0.1', '1.0.2') < 0)
    assert.ok(compareVersions('1.1.0', '1.0.9') > 0)
    assert.ok(compareVersions('2.0.0', '1.99.99') > 0)
    assert.equal(compareVersions('1.0.0', '1.0.0'), 0)
  })
})

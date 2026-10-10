import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { looksTruncated, parseActions } from '../src/main/ai/protocol'

describe('parseActions', () => {
  it('returns prose untouched when there are no action blocks', () => {
    const result = parseActions('The script looks fine to me.')
    assert.equal(result.prose, 'The script looks fine to me.')
    assert.deepEqual(result.actions, [])
    assert.deepEqual(result.errors, [])
  })

  it('extracts a single action and strips it from the prose', () => {
    const reply = [
      'Let me read that script first.',
      '',
      '```codeon-action',
      '{"tool":"get_script","args":{"path":"ServerScriptService/Main"}}',
      '```'
    ].join('\n')

    const result = parseActions(reply)
    assert.equal(result.actions.length, 1)
    assert.equal(result.actions[0].tool, 'get_script')
    assert.deepEqual(result.actions[0].args, { path: 'ServerScriptService/Main' })
    assert.equal(result.prose, 'Let me read that script first.')
  })

  it('extracts several actions in order', () => {
    const reply = [
      'Doing two things.',
      '```codeon-action',
      '{"tool":"get_script","args":{"path":"A"}}',
      '```',
      '```codeon-action',
      '{"tool":"set_script","args":{"path":"A","source":"print(1)"}}',
      '```'
    ].join('\n')

    const result = parseActions(reply)
    assert.deepEqual(
      result.actions.map((action) => action.tool),
      ['get_script', 'set_script']
    )
  })

  it('reports malformed JSON instead of throwing', () => {
    const result = parseActions('```codeon-action\n{"tool": }```')
    assert.equal(result.actions.length, 0)
    assert.equal(result.errors.length, 1)
    assert.match(result.errors[0], /not valid JSON/)
  })

  it('reports a block that forgets the tool field', () => {
    const result = parseActions('```codeon-action\n{"args":{"path":"A"}}```')
    assert.equal(result.actions.length, 0)
    assert.match(result.errors[0], /missing a "tool"/)
  })

  it('defaults missing args to an empty object', () => {
    const result = parseActions('```codeon-action\n{"tool":"studio_status"}```')
    assert.deepEqual(result.actions[0], { tool: 'studio_status', args: {} })
  })
})

describe('looksTruncated', () => {
  it('detects an unterminated fence', () => {
    assert.equal(looksTruncated('text\n```codeon-action\n{"tool":"x"}'), true)
    assert.equal(looksTruncated('text\n```codeon-action\n{"tool":"x"}\n```'), false)
  })
})

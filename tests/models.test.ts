import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { isFreeModelId, modelIdsFromPayload, prettifyModelId } from '../src/shared/models'
import { PROVIDERS, getProvider } from '../src/shared/providers'

const root = fileURLToPath(new URL('..', import.meta.url))

/** Every source file, so a removed feature cannot linger in one of them. */
function sourceFiles(dir = 'src'): string[] {
  const found: string[] = []
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const next = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...sourceFiles(next))
    else if (/\.(ts|tsx|css)$/.test(entry.name)) found.push(next)
  }
  return found
}

describe('model payloads', () => {
  it('reads an OpenAI-compatible listing', () => {
    const payload = { object: 'list', data: [{ id: 'gpt-5.1' }, { id: 'gpt-5-mini' }] }
    assert.deepEqual(modelIdsFromPayload('openai', payload), ['gpt-5.1', 'gpt-5-mini'])
  })

  it('accepts a gateway that answers with `models`', () => {
    assert.deepEqual(modelIdsFromPayload('openai', { models: [{ id: 'kimi-k2' }] }), ['kimi-k2'])
  })

  it('reads an Anthropic listing', () => {
    const payload = { data: [{ id: 'claude-sonnet-4-5', display_name: 'Claude Sonnet 4.5' }] }
    assert.deepEqual(modelIdsFromPayload('anthropic', payload), ['claude-sonnet-4-5'])
  })

  it('reads a Gemini listing and keeps only chat models', () => {
    const payload = {
      models: [
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent', 'countTokens'] }
      ]
    }
    assert.deepEqual(modelIdsFromPayload('google', payload), ['gemini-2.5-flash', 'gemini-2.5-pro'])
  })

  it('drops duplicates, blanks and malformed entries', () => {
    const payload = {
      data: [{ id: 'a' }, { id: 'a' }, { id: '' }, { nope: true }, 'b', null, { id: 'models/c' }]
    }
    assert.deepEqual(modelIdsFromPayload('openai', payload), ['a', 'b', 'c'])
  })

  it('returns nothing for a payload it does not recognise', () => {
    assert.deepEqual(modelIdsFromPayload('openai', { error: 'nope' }), [])
    assert.deepEqual(modelIdsFromPayload('openai', null), [])
    assert.deepEqual(modelIdsFromPayload('google', { models: 'not-an-array' }), [])
  })
})

describe('model labels', () => {
  it('turns a gateway id into a readable name', () => {
    assert.equal(prettifyModelId('deepseek/deepseek-chat-v3.1:free'), 'Deepseek Chat V3.1')
    assert.equal(prettifyModelId('openai/gpt-5.1'), 'GPT 5.1')
    assert.equal(prettifyModelId('qwen/qwen3-coder-480b'), 'Qwen3 Coder 480B')
    assert.equal(prettifyModelId('meta/llama-3.3-70b-instruct'), 'Llama 3.3 70B Instruct')
    assert.equal(prettifyModelId('gemini-2.5-flash'), 'Gemini 2.5 Flash')
    assert.equal(prettifyModelId('local-model'), 'Local Model')
  })

  it('falls back to the raw id rather than nothing', () => {
    assert.equal(prettifyModelId('///'), '///')
  })

  it('spots the free tier of a gateway', () => {
    assert.equal(isFreeModelId('qwen/qwen3-coder:free'), true)
    assert.equal(isFreeModelId('Qwen/Qwen3-Coder:FREE'), true)
    assert.equal(isFreeModelId('qwen/qwen3-coder'), false)
  })
})

describe('provider catalog', () => {
  it('gives every provider a unique id and a listing URL', () => {
    const ids = PROVIDERS.map((provider) => provider.id)
    assert.equal(new Set(ids).size, ids.length)
    for (const provider of PROVIDERS) {
      assert.ok(provider.id && provider.label, `${provider.id} needs an id and a label`)
      assert.ok(
        provider.baseUrl.startsWith('http') || provider.id === 'custom',
        `${provider.id} needs a base URL before it can be listed`
      )
    }
  })

  it('keeps a starting list for every provider except the bring-your-own one', () => {
    for (const provider of PROVIDERS) {
      if (provider.id === 'custom') continue
      assert.ok(provider.models.length > 0, `${provider.id} should ship starter models`)
    }
  })

  it('offers OpenCode Zen both without and with a key', () => {
    const free = getProvider('opencode-zen')
    const keyed = getProvider('opencode-zen-api')
    assert.ok(free && keyed, 'both Zen entries should exist')
    assert.equal(free?.requiresKey, false)
    assert.equal(keyed?.requiresKey, true)
    assert.equal(keyed?.baseUrl, free?.baseUrl)
    assert.ok(keyed?.keyUrl, 'the keyed entry needs a link to the key page')
    // The keyless tier must not advertise the paid catalog as if it were free.
    assert.equal(free?.liveModels, false)
    assert.notEqual(keyed?.liveModels, false)
  })

  it('points Groq at GroqCloud and adds the NVIDIA NIM endpoint', () => {
    const groq = getProvider('groq')
    assert.match(groq?.label ?? '', /Groq/)
    assert.equal(groq?.baseUrl, 'https://api.groq.com/openai/v1')
    assert.equal(groq?.keyUrl, 'https://console.groq.com/keys')

    const nvidia = getProvider('nvidia')
    assert.equal(nvidia?.baseUrl, 'https://integrate.api.nvidia.com/v1')
    assert.equal(nvidia?.requiresKey, true)
    assert.ok(nvidia?.models.length, 'NVIDIA needs a starter list for when listing fails')
  })

  it('has dropped the unconfirmed free-request counter', () => {
    const strays = sourceFiles().filter((file) => {
      const text = readFileSync(join(root, file), 'utf8')
      return /quotas|anonymous|free left/i.test(text)
    })
    assert.deepEqual(strays, [], 'the anonymous quota counter should be gone')
  })
})

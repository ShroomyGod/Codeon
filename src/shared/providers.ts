import type { ProviderDef, ProviderSettings, Settings } from './types'

/**
 * The provider catalog.
 *
 * Every entry speaks an OpenAI-compatible, Anthropic or Google protocol at the
 * listed base URL, and the picker lists whatever models that endpoint reports
 * (`GET /models`). The `models` arrays here are only a starting point for
 * endpoints that need a key before they will list anything, or that are offline.
 *
 * Keys live on this machine only; nothing here ever leaves it except to the
 * provider being called.
 */
export const PROVIDERS: ProviderDef[] = [
  {
    id: 'opencode-zen',
    label: 'OpenCode Zen (free)',
    kind: 'openai',
    baseUrl: 'https://opencode.ai/zen/v1',
    defaultModel: 'grok-code',
    requiresKey: false,
    keyUrl: 'https://opencode.ai/zen',
    docsUrl: 'https://opencode.ai/docs/zen/',
    // Zen's /models lists the paid catalog without saying what the keyless tier
    // serves, so this entry keeps its own list rather than promising models
    // that will come back unauthorised.
    liveModels: false,
    notes: 'Works with no account at all. Add a Zen key under OpenCode Zen (API key) for the paid catalog.',
    models: [
      { id: 'grok-code', label: 'Grok Code (free)', free: true },
      { id: 'qwen3-coder', label: 'Qwen3 Coder (free)', free: true },
      { id: 'kimi-k2', label: 'Kimi K2 (free)', free: true },
      { id: 'glm-4.6', label: 'GLM 4.6 (free)', free: true },
      { id: 'minimax-m2', label: 'MiniMax M2 (free)', free: true },
      { id: 'code-supernova', label: 'Code Supernova', free: true }
    ]
  },
  {
    id: 'opencode-zen-api',
    label: 'OpenCode Zen (API key)',
    kind: 'openai',
    baseUrl: 'https://opencode.ai/zen/v1',
    defaultModel: 'grok-code',
    requiresKey: true,
    keyLabel: 'Zen API key',
    keyUrl: 'https://opencode.ai/auth',
    docsUrl: 'https://opencode.ai/docs/zen/',
    notes: 'Sign in at opencode.ai, add credits and copy a key to reach the whole Zen catalog.',
    models: [
      { id: 'grok-code', label: 'Grok Code' },
      { id: 'qwen3-coder', label: 'Qwen3 Coder' },
      { id: 'kimi-k2', label: 'Kimi K2' },
      { id: 'glm-4.6', label: 'GLM 4.6' },
      { id: 'minimax-m2', label: 'MiniMax M2' }
    ]
  },
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5-mini',
    requiresKey: true,
    keyLabel: 'OpenAI API key',
    keyUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-5.1', label: 'GPT-5.1' },
      { id: 'gpt-5', label: 'GPT-5' },
      { id: 'gpt-5-mini', label: 'GPT-5 mini' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
      { id: 'o4-mini', label: 'o4-mini' }
    ]
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-5',
    requiresKey: true,
    keyLabel: 'Anthropic API key',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      { id: 'claude-opus-4-1', label: 'Claude Opus 4.1' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' }
    ]
  },
  {
    id: 'google',
    label: 'Google Gemini',
    kind: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    requiresKey: true,
    keyLabel: 'Google AI Studio key',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }
    ]
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openrouter/auto',
    requiresKey: true,
    keyLabel: 'OpenRouter API key',
    keyUrl: 'https://openrouter.ai/keys',
    notes: 'One key, hundreds of models — including several free ones.',
    models: [
      { id: 'openrouter/auto', label: 'Auto (router picks)' },
      { id: 'deepseek/deepseek-chat-v3.1:free', label: 'DeepSeek V3.1 (free)', free: true },
      { id: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder (free)', free: true },
      { id: 'z-ai/glm-4.6:free', label: 'GLM 4.6 (free)', free: true },
      { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5' }
    ]
  },
  {
    id: 'groq',
    label: 'Groq (GroqCloud)',
    kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'moonshotai/kimi-k2-instruct',
    requiresKey: true,
    keyLabel: 'GroqCloud API key',
    keyUrl: 'https://console.groq.com/keys',
    docsUrl: 'https://console.groq.com/docs/models',
    notes: 'Extremely fast inference. The key is required before GroqCloud will list its models.',
    models: [
      { id: 'moonshotai/kimi-k2-instruct', label: 'Kimi K2 Instruct' },
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
      { id: 'qwen/qwen3-32b', label: 'Qwen3 32B' }
    ]
  },
  {
    id: 'nvidia',
    label: 'NVIDIA (NIM)',
    kind: 'openai',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'meta/llama-3.3-70b-instruct',
    requiresKey: true,
    keyLabel: 'NVIDIA API key',
    keyUrl: 'https://build.nvidia.com/settings/api-keys',
    docsUrl: 'https://docs.api.nvidia.com/nim/',
    notes: 'NVIDIA NIM hosts a large catalog on one OpenAI-compatible endpoint; the model list is public.',
    models: [
      { id: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B Instruct' },
      { id: 'deepseek-ai/deepseek-r1', label: 'DeepSeek R1' },
      { id: 'qwen/qwen2.5-coder-32b-instruct', label: 'Qwen2.5 Coder 32B' }
    ]
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    requiresKey: true,
    keyLabel: 'DeepSeek API key',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' }
    ]
  },
  {
    id: 'mistral',
    label: 'Mistral',
    kind: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    requiresKey: true,
    keyLabel: 'Mistral API key',
    keyUrl: 'https://console.mistral.ai/api-keys',
    models: [
      { id: 'mistral-large-latest', label: 'Mistral Large' },
      { id: 'devstral-medium-latest', label: 'Devstral Medium' },
      { id: 'codestral-latest', label: 'Codestral' }
    ]
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    kind: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4',
    requiresKey: true,
    keyLabel: 'xAI API key',
    keyUrl: 'https://console.x.ai/',
    models: [
      { id: 'grok-4', label: 'Grok 4' },
      { id: 'grok-code-fast-1', label: 'Grok Code Fast 1' }
    ]
  },
  {
    id: 'together',
    label: 'Together AI',
    kind: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'moonshotai/Kimi-K2-Instruct',
    requiresKey: true,
    keyLabel: 'Together API key',
    keyUrl: 'https://api.together.ai/settings/api-keys',
    models: [
      { id: 'moonshotai/Kimi-K2-Instruct', label: 'Kimi K2 Instruct' },
      { id: 'Qwen/Qwen3-Coder-480B-A35B-Instruct', label: 'Qwen3 Coder 480B' }
    ]
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    kind: 'openai',
    baseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'qwen-3-coder-480b',
    requiresKey: true,
    keyLabel: 'Cerebras API key',
    keyUrl: 'https://cloud.cerebras.ai/',
    models: [
      { id: 'qwen-3-coder-480b', label: 'Qwen3 Coder 480B' },
      { id: 'llama3.1-8b', label: 'Llama 3.1 8B' }
    ]
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    kind: 'openai',
    baseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'qwen2.5-coder:14b',
    requiresKey: false,
    local: true,
    docsUrl: 'https://ollama.com/download',
    notes: 'Runs on your machine. No key, no quota, no internet.',
    models: [
      { id: 'qwen2.5-coder:14b', label: 'Qwen2.5 Coder 14B' },
      { id: 'llama3.1:8b', label: 'Llama 3.1 8B' }
    ]
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (local)',
    kind: 'openai',
    baseUrl: 'http://127.0.0.1:1234/v1',
    defaultModel: 'local-model',
    requiresKey: false,
    local: true,
    docsUrl: 'https://lmstudio.ai/',
    notes: 'Point this at LM Studio\'s OpenAI-compatible server.',
    models: [{ id: 'local-model', label: 'Currently loaded model' }]
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    kind: 'openai',
    baseUrl: '',
    defaultModel: '',
    requiresKey: false,
    notes: 'Any OpenAI-compatible endpoint: a gateway, a proxy, or your own server.',
    models: []
  }
]

export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((provider) => provider.id === id)
}

export interface ResolvedProvider {
  provider: ProviderDef
  model: string
  baseUrl: string
  apiKey: string
}

/** Merge catalog defaults with the user's saved overrides. */
export function resolveProvider(settings: Settings, providerId?: string): ResolvedProvider {
  const id = providerId ?? settings.activeProviderId
  const provider = getProvider(id)
  if (!provider) throw new Error(`Unknown provider: ${id}`)
  const saved: ProviderSettings = settings.providers[id] ?? {}
  const model = (id === settings.activeProviderId ? settings.activeModel : saved.model) || saved.model || provider.defaultModel
  return {
    provider,
    model,
    baseUrl: (saved.baseUrl || provider.baseUrl || '').replace(/\/+$/, ''),
    apiKey: saved.apiKey ?? ''
  }
}

/** Human-readable label for a provider + model pair. */
export function describeModel(providerId: string, model: string): string {
  const provider = getProvider(providerId)
  return provider ? `${provider.label} · ${model}` : `${providerId} · ${model}`
}


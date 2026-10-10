import { modelIdsFromPayload, type ModelListKind } from '../../shared/models'
import type { ProviderKind } from '../../shared/types'

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamChatOptions {
  kind: ProviderKind
  baseUrl: string
  apiKey: string
  model: string
  messages: ChatTurn[]
  signal: AbortSignal
  temperature?: number
  maxTokens?: number
  onDelta?: (text: string) => void
  /** Injectable for tests. */
  fetchImpl?: typeof fetch
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly providerBody?: string
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

const DEFAULT_TIMEOUT_MS = 180_000

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`
}

/** Turns a raw provider error body into something a human can act on. */
function describeHttpError(status: number, body: string): string {
  let detail = body.slice(0, 600)
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string }
    const nested = typeof parsed.error === 'object' ? parsed.error?.message : parsed.error
    detail = nested || parsed.message || detail
  } catch {
    /* body was not JSON — keep the raw text */
  }
  switch (status) {
    case 401:
      return `Rejected the API key (401). Double-check it in Settings. ${detail}`
    case 402:
      return `Provider says the account is out of credit (402). ${detail}`
    case 403:
      return `Access denied (403). The key may not be allowed to use ${'this model'}. ${detail}`
    case 404:
      return `Model or endpoint not found (404) — check the model id and base URL. ${detail}`
    case 429:
      return `Rate limited (429). Wait a moment or switch provider. ${detail}`
    default:
      return `Provider returned ${status}. ${detail}`
  }
}

/** Parses a `text/event-stream` body, yielding each `data:` payload. */
async function* iterateSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE events are separated by a blank line.
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        for (const line of rawEvent.split('\n')) {
          const trimmed = line.trim()
          if (trimmed.startsWith('data:')) yield trimmed.slice(5).trim()
        }
        boundary = buffer.indexOf('\n\n')
      }
    }
    // Handle a trailing event without a final blank line.
    for (const line of buffer.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('data:')) yield trimmed.slice(5).trim()
    }
  } finally {
    reader.releaseLock()
  }
}

async function readTextSafely(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return '<no body>'
  }
}

/* ------------------------------------------------------------------ */
/* OpenAI-compatible (OpenCode Zen, OpenAI, OpenRouter, Groq, Ollama…) */
/* ------------------------------------------------------------------ */

async function streamOpenAi(options: StreamChatOptions, fetchImpl: typeof fetch): Promise<string> {
  const { baseUrl, apiKey, model, messages, signal, onDelta } = options
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const response = await fetchImpl(joinUrl(baseUrl, '/chat/completions'), {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens
    })
  })

  if (!response.ok) {
    throw new ProviderError(
      describeHttpError(response.status, await readTextSafely(response)),
      response.status
    )
  }
  if (!response.body) throw new ProviderError('Provider returned an empty stream.')

  let full = ''
  for await (const payload of iterateSse(response.body)) {
    if (payload === '[DONE]') break
    try {
      const parsed = JSON.parse(payload) as {
        choices?: { delta?: { content?: string | null } }[]
        error?: { message?: string }
      }
      if (parsed.error?.message) throw new ProviderError(parsed.error.message)
      const delta = parsed.choices?.[0]?.delta?.content
      if (delta) {
        full += delta
        onDelta?.(delta)
      }
    } catch (error) {
      if (error instanceof ProviderError) throw error
      // Ignore keep-alive/comment frames that are not JSON.
    }
  }
  return full
}

/* ------------------------------------------------------------------ */
/* Anthropic                                                           */
/* ------------------------------------------------------------------ */

async function streamAnthropic(options: StreamChatOptions, fetchImpl: typeof fetch): Promise<string> {
  const { baseUrl, apiKey, model, messages, signal, onDelta } = options
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')

  const response = await fetchImpl(joinUrl(baseUrl, '/messages'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    signal,
    body: JSON.stringify({
      model,
      system: system || undefined,
      max_tokens: options.maxTokens ?? 8192,
      temperature: options.temperature ?? 0.2,
      stream: true,
      messages: messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({ role: message.role, content: message.content }))
    })
  })

  if (!response.ok) {
    throw new ProviderError(
      describeHttpError(response.status, await readTextSafely(response)),
      response.status
    )
  }
  if (!response.body) throw new ProviderError('Anthropic returned an empty stream.')

  let full = ''
  for await (const payload of iterateSse(response.body)) {
    try {
      const parsed = JSON.parse(payload) as {
        type?: string
        delta?: { text?: string }
        error?: { message?: string }
      }
      if (parsed.type === 'error') throw new ProviderError(parsed.error?.message ?? 'Anthropic error')
      if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
        full += parsed.delta.text
        onDelta?.(parsed.delta.text)
      }
    } catch (error) {
      if (error instanceof ProviderError) throw error
    }
  }
  return full
}

/* ------------------------------------------------------------------ */
/* Google Gemini                                                       */
/* ------------------------------------------------------------------ */

async function streamGoogle(options: StreamChatOptions, fetchImpl: typeof fetch): Promise<string> {
  const { baseUrl, apiKey, model, messages, signal, onDelta } = options
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')

  const contents = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }]
    }))

  const url = `${joinUrl(baseUrl, `/models/${encodeURIComponent(model)}:streamGenerateContent`)}?alt=sse&key=${encodeURIComponent(apiKey)}`
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      contents,
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxTokens
      }
    })
  })

  if (!response.ok) {
    throw new ProviderError(
      describeHttpError(response.status, await readTextSafely(response)),
      response.status
    )
  }
  if (!response.body) throw new ProviderError('Gemini returned an empty stream.')

  let full = ''
  for await (const payload of iterateSse(response.body)) {
    try {
      const parsed = JSON.parse(payload) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
      }
      for (const part of parsed.candidates?.[0]?.content?.parts ?? []) {
        if (part.text) {
          full += part.text
          onDelta?.(part.text)
        }
      }
    } catch {
      /* ignore non-JSON frames */
    }
  }
  return full
}

/**
 * Stream a chat completion and resolve with the full assistant text.
 * Throws `ProviderError` with an actionable message on failure.
 */
export async function streamChat(options: StreamChatOptions): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch
  if (!options.baseUrl) {
    throw new ProviderError('No base URL configured for this provider. Add one in Settings.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  const abort = () => controller.abort()
  options.signal.addEventListener('abort', abort, { once: true })

  const patched: StreamChatOptions = { ...options, signal: controller.signal }
  try {
    switch (options.kind) {
      case 'openai':
        return await streamOpenAi(patched, fetchImpl)
      case 'anthropic':
        return await streamAnthropic(patched, fetchImpl)
      case 'google':
        return await streamGoogle(patched, fetchImpl)
      default:
        throw new ProviderError(`Unsupported provider kind: ${options.kind}`)
    }
  } catch (error) {
    if (options.signal.aborted) throw new Error('Request cancelled.')
    if (error instanceof ProviderError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProviderError('The provider took too long to respond (3 minute timeout).')
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new ProviderError(`Could not reach the provider: ${message}`)
  } finally {
    clearTimeout(timeout)
    options.signal.removeEventListener('abort', abort)
  }
}

/**
 * The provider's own model catalog.
 *
 * All three families expose `GET /models`, but they differ on the path, the
 * auth header and the response shape — Gemini wants the key in the query, gets
 * paginated, and names models `models/<id>`. Failures are thrown so the picker
 * can fall back to the catalog defaults and say why.
 */
export async function listModels(
  baseUrl: string,
  apiKey: string,
  kind: ModelListKind = 'openai',
  fetchImpl: typeof fetch = fetch
): Promise<string[]> {
  const url = new URL(joinUrl(baseUrl, '/models'))
  const headers: Record<string, string> = {}

  if (kind === 'anthropic') {
    if (apiKey) headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
    url.searchParams.set('limit', '1000')
  } else if (kind === 'google') {
    if (apiKey) url.searchParams.set('key', apiKey)
    url.searchParams.set('pageSize', '1000')
  } else if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  let response: Response
  try {
    response = await fetchImpl(url.toString(), { headers })
  } catch (error) {
    // A local server that is not running is the common case here, so name the
    // host instead of passing along fetch's bare "fetch failed".
    const reason = error instanceof Error ? error.message : String(error)
    throw new ProviderError(`Could not reach ${url.host} — ${reason}`)
  }

  if (!response.ok) {
    throw new ProviderError(describeHttpError(response.status, await readTextSafely(response)), response.status)
  }

  const payload: unknown = await response.json()
  return modelIdsFromPayload(kind, payload).sort((a, b) => a.localeCompare(b))
}

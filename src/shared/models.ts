/**
 * Helpers for reading a provider's model catalog.
 *
 * Every provider that speaks the OpenAI protocol answers `GET /models`, but the
 * three families disagree about the response shape and about how the id is
 * spelled. Parsing and labelling live here so the main process (which fetches)
 * and the renderer (which lists) agree on what a catalog entry is.
 */
export type ModelListKind = 'openai' | 'anthropic' | 'google'

/** Words that read as acronyms rather than words in a model name. */
const ACRONYMS = new Set(['gpt', 'glm', 'ai', 'llm', 'vl', 'vlm', 'ocr', 'tts', 'stt', 'sdxl', 'moe'])

/**
 * Pulls model ids out of whichever shape the provider returned, keeping the
 * provider's own ordering and dropping duplicates.
 *
 * - OpenAI-compatible: `{ data: [{ id }] }` (some gateways answer `models`)
 * - Anthropic:         `{ data: [{ id }] }`
 * - Google Gemini:     `{ models: [{ name: 'models/gemini-2.5-flash' }] }`
 */
export function modelIdsFromPayload(kind: ModelListKind, payload: unknown): string[] {
  const record = payload as { data?: unknown; models?: unknown } | null | undefined
  const entries = Array.isArray(record?.data)
    ? record.data
    : Array.isArray(record?.models)
      ? record.models
      : []

  const ids: string[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    let id: string | undefined

    if (typeof entry === 'string') {
      id = entry
    } else if (entry && typeof entry === 'object') {
      const model = entry as Record<string, unknown>
      const candidate = kind === 'google' ? model.name : model.id
      if (typeof candidate === 'string') {
        // Embedding and tuning endpoints are not chat models.
        const methods = model.supportedGenerationMethods
        const chat =
          !Array.isArray(methods) ||
          methods.some((method) => typeof method === 'string' && method.startsWith('generateContent'))
        if (chat) id = candidate
      }
    }

    if (!id) continue
    // Gemini names models as `models/gemini-2.5-flash`; the API wants the tail.
    const cleaned = id.replace(/^models\//, '').trim()
    if (!cleaned || cleaned.startsWith('models/') || seen.has(cleaned)) continue
    seen.add(cleaned)
    ids.push(cleaned)
  }

  return ids
}

/** True for an id a gateway marks as costing nothing (`…:free`). */
export function isFreeModelId(id: string): boolean {
  return /:free$/i.test(id)
}

/**
 * A readable name for a model id: `deepseek/deepseek-chat-v3.1:free` becomes
 * `DeepSeek Chat V3.1`. The raw id stays available as the row's tooltip, so a
 * wrong guess here never hides the real identifier.
 */
export function prettifyModelId(id: string): string {
  const bare = id.replace(/:free$/i, '')
  const tail = bare.split('/').filter(Boolean).pop() ?? bare
  // Separators become spaces; a dot inside a version (`v3.1`) is left alone.
  const words = tail.replace(/[\s_-]+/g, ' ').split(' ').filter(Boolean)

  const pretty = words
    .map((word) => {
      const lower = word.toLowerCase()
      if (ACRONYMS.has(lower)) return lower.toUpperCase()
      // A letter straight after a digit is a size suffix: `70b` -> `70B`.
      const shifted = lower.replace(/(\d)([a-z])/g, (_match, digit: string, letter: string) => digit + letter.toUpperCase())
      return shifted.charAt(0).toUpperCase() + shifted.slice(1)
    })
    .join(' ')

  return pretty || id
}

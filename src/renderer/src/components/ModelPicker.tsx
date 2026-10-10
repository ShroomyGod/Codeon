import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, RefreshCw, Search, SlidersHorizontal } from 'lucide-react'
import { PROVIDERS } from '@shared/providers'
import { isFreeModelId, prettifyModelId } from '@shared/models'
import type { ProviderDef } from '@shared/types'
import { useStore } from '../store'
import { useUi } from '../ui'

/** Rows drawn per provider before asking the user to narrow the search. */
const MAX_ROWS = 40
/** Rows allowed once a query is typed — high enough for a full sweep. */
const MAX_SEARCHED_ROWS = 150

/** `Grok Code (free)` reads better as `Grok Code` next to a Free badge. */
export function cleanLabel(label: string): string {
  return label.replace(/\s*\((free|local)\)\s*$/i, '').trim() || label
}

/**
 * The name shown on the composer button: the provider's own label when we have
 * one, otherwise the id made readable.
 */
export function displayModelName(providerId: string, modelId: string, catalog: string[] = []): string {
  const provider = PROVIDERS.find((entry) => entry.id === providerId)
  const known = provider?.models.find((model) => model.id === modelId)
  if (known) return `${cleanLabel(known.label)}${known.free ? ' Free' : ''}`
  if (catalog.includes(modelId)) return `${prettifyModelId(modelId)}${isFreeModelId(modelId) ? ' Free' : ''}`
  return modelId
    .replace(/:free$/i, '')
    .replace(/^[^/]+\//, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

/** A provider is usable when it needs no key, is local, or already has one. */
function isUsable(provider: ProviderDef, hasKey: boolean): boolean {
  return !provider.requiresKey || provider.local === true || hasKey
}

interface Row {
  id: string
  label: string
  free: boolean
}

export default function ModelPicker({ onClose }: { onClose: () => void }): React.JSX.Element {
  const settings = useStore((state) => state.settings)
  const updateSettings = useStore((state) => state.updateSettings)
  const modelCatalog = useStore((state) => state.modelCatalog)
  const loadAllModels = useStore((state) => state.loadAllModels)
  const setSettingsOpen = useUi((state) => state.setSettingsOpen)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Listing is best effort and cached, so a second open costs nothing.
  useEffect(() => {
    void loadAllModels()
  }, [loadAllModels])

  const needle = query.trim().toLowerCase()

  const groups = useMemo(() => {
    const rowsFor = (provider: ProviderDef): { rows: Row[]; live: boolean; hidden: number } => {
      const catalog = modelCatalog[provider.id]
      const live = (catalog?.models.length ?? 0) > 0
      const source: Row[] = live
        ? catalog!.models.map((id) => ({ id, label: prettifyModelId(id), free: isFreeModelId(id) }))
        : provider.models.map((model) => ({
            id: model.id,
            label: cleanLabel(model.label),
            free: model.free === true
          }))

      // A model the user typed in Settings should still be selectable.
      const saved = settings?.providers[provider.id]
      const activeModel = settings?.activeProviderId === provider.id ? settings.activeModel : saved?.model
      if (activeModel && !source.some((row) => row.id === activeModel)) {
        source.unshift({ id: activeModel, label: prettifyModelId(activeModel), free: false })
      }

      const matched = needle
        ? source.filter(
            (row) =>
              row.id.toLowerCase().includes(needle) ||
              row.label.toLowerCase().includes(needle) ||
              provider.label.toLowerCase().includes(needle)
          )
        : source

      // Free models first: on a gateway with hundreds of entries they are the
      // ones a new user can actually run.
      const ordered = [...matched].sort((a, b) =>
        a.free === b.free ? a.label.localeCompare(b.label) : a.free ? -1 : 1
      )

      const limit = needle ? MAX_SEARCHED_ROWS : MAX_ROWS
      return { rows: ordered.slice(0, limit), live, hidden: Math.max(0, ordered.length - limit) }
    }

    return PROVIDERS.map((provider) => ({
      provider,
      hasKey: settings?.providers[provider.id]?.hasKey ?? false,
      catalog: modelCatalog[provider.id],
      ...rowsFor(provider)
    }))
      .filter((group) => group.rows.length > 0)
      .sort((a, b) => {
        // Providers that work right now come first; the rest stay reachable below.
        const usable = Number(isUsable(b.provider, b.hasKey)) - Number(isUsable(a.provider, a.hasKey))
        return usable
      })
  }, [needle, settings, modelCatalog])

  const total = groups.reduce((sum, group) => sum + group.rows.length, 0)
  const listing = Object.values(modelCatalog).some((entry) => entry.status === 'loading')

  const choose = (provider: ProviderDef, row: Row): void => {
    void updateSettings({ activeProviderId: provider.id, activeModel: row.id })
    onClose()
  }

  return (
    <>
      <div className="picker-scrim" onClick={onClose} />
      <div className="picker" role="dialog" aria-label="Choose a model">
        <div className="picker-search">
          <Search size={14} />
          <input
            ref={inputRef}
            className="picker-search-input"
            placeholder="Search every provider's models"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose()
            }}
          />
          <button
            className="picker-refresh"
            title="Reload the model lists from each provider"
            onClick={() => void loadAllModels({ refresh: true })}
          >
            <RefreshCw size={13} className={listing ? 'spin' : undefined} />
          </button>
        </div>

        <div className="picker-list">
          {groups.map(({ provider, hasKey, rows, hidden, live, catalog }) => (
            <div className="picker-group" key={provider.id}>
              <div className="picker-group-head">
                <span>{provider.label}</span>
                {live && <span className="picker-count">{catalog?.models.length} models</span>}
                {!live && catalog?.status === 'loading' && <span className="picker-count">listing…</span>}
                {!provider.requiresKey && <span className="badge free">no key</span>}
                {provider.local && <span className="badge">local</span>}
                {!isUsable(provider, hasKey) && <span className="badge">needs key</span>}
              </div>

              {rows.map((row) => {
                const active = settings?.activeProviderId === provider.id && settings?.activeModel === row.id
                return (
                  <button
                    className={`picker-item${active ? ' active' : ''}`}
                    key={`${provider.id}:${row.id}`}
                    title={row.id}
                    onClick={() => choose(provider, row)}
                  >
                    <span className="picker-item-label">{cleanLabel(row.label)}</span>
                    {row.free && <span className="badge free">free</span>}
                    {active && <Check size={14} className="picker-check" />}
                  </button>
                )
              })}

              {hidden > 0 && (
                <div className="picker-more">
                  {hidden} more — type to narrow {live ? `this list` : `${provider.label}'s models`}
                </div>
              )}

              {!live && catalog?.status === 'error' && (
                <div className="picker-note">
                  {provider.requiresKey && !hasKey
                    ? 'Add a key to list every model; showing the built-in picks for now.'
                    : catalog.error}
                </div>
              )}
            </div>
          ))}

          {total === 0 && (
            <div className="picker-empty">
              {listing ? 'Asking each provider for its models…' : `No model matches “${query.trim()}”.`}
            </div>
          )}
        </div>

        <button
          className="picker-manage"
          onClick={() => {
            setSettingsOpen(true)
            onClose()
          }}
        >
          <SlidersHorizontal size={13} /> Manage models &amp; providers
        </button>
      </div>
    </>
  )
}

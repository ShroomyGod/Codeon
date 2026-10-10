import { useState } from 'react'
import { ExternalLink, RefreshCw, X } from 'lucide-react'
import { PROVIDERS, describeModel } from '@shared/providers'
import { prettifyModelId } from '@shared/models'
import type { ProviderDef } from '@shared/types'
import { useStore } from '../store'
import { useUi } from '../ui'

export default function SettingsDialog(): React.JSX.Element {
  const setSettingsOpen = useUi((state) => state.setSettingsOpen)
  const info = useStore((state) => state.info)
  const settings = useStore((state) => state.settings)
  const studio = useStore((state) => state.studio)
  const updateSettings = useStore((state) => state.updateSettings)
  const setProviderKey = useStore((state) => state.setProviderKey)
  const refreshStudio = useStore((state) => state.refreshStudio)
  const modelCatalog = useStore((state) => state.modelCatalog)

  if (!settings || !info) return <></>

  const activeProvider = PROVIDERS.find((provider) => provider.id === settings.activeProviderId)
  const catalog = modelCatalog[settings.activeProviderId]

  return (
    <div className="backdrop" onClick={() => setSettingsOpen(false)}>
      <div className="dialog" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <h2>Settings</h2>
          <span className="dim">v{info.version}</span>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={() => setSettingsOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <div className="dialog-body">
          <div className="field">
            <span className="field-label">Model</span>
            <div className="row wrap">
              <select
                className="select grow"
                value={settings.activeProviderId}
                onChange={(event) => {
                  const provider = PROVIDERS.find((entry) => entry.id === event.target.value)
                  if (!provider) return
                  void updateSettings({
                    activeProviderId: provider.id,
                    activeModel: settings.providers[provider.id]?.model || provider.defaultModel
                  })
                }}
              >
                {PROVIDERS.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </select>

              <input
                className="input grow"
                list="codeon-models"
                value={settings.activeModel}
                onChange={(event) => void updateSettings({ activeModel: event.target.value })}
              />
              <datalist id="codeon-models">
                {(catalog?.models.length
                  ? catalog.models.map((id) => ({ id, label: prettifyModelId(id) }))
                  : (activeProvider?.models ?? [])
                ).map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </datalist>
            </div>
            <span className="hint">
              Active: {describeModel(settings.activeProviderId, settings.activeModel)}
              {catalog?.status === 'ready' && ` · ${catalog.models.length} models listed from the provider`}
              {catalog?.status === 'loading' && ' · listing models…'}
            </span>
          </div>

          <div className="field">
            <span className="field-label">Providers</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PROVIDERS.map((provider) => (
                <ProviderRow
                  key={provider.id}
                  provider={provider}
                  active={provider.id === settings.activeProviderId}
                  hasKey={settings.providers[provider.id]?.hasKey ?? false}
                  savedBaseUrl={settings.providers[provider.id]?.baseUrl ?? ''}
                  savedModel={settings.providers[provider.id]?.model ?? ''}
                  onActivate={() =>
                    void updateSettings({
                      activeProviderId: provider.id,
                      activeModel: settings.providers[provider.id]?.model || provider.defaultModel
                    })
                  }
                  onSave={(payload) => void setProviderKey({ providerId: provider.id, ...payload })}
                  onOpenDocs={() => void window.codeon.invoke('shell:openExternal', provider.keyUrl ?? provider.docsUrl ?? '')}
                />
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">Change review</span>
            <Toggle
              label="Review changes before they touch Studio"
              hint="Recommended. Every agent edit becomes a diff you accept or reject."
              value={settings.reviewChanges}
              onChange={(value) => void updateSettings({ reviewChanges: value })}
            />
            <Toggle
              label="Auto-accept script changes"
              hint="Only used when review is off."
              value={settings.autoApproveScripts}
              onChange={(value) => void updateSettings({ autoApproveScripts: value })}
            />
            <Toggle
              label="Auto-accept Luau execution"
              hint="Only used when review is off. Scripts and code runs stay reviewable."
              value={settings.autoApproveLuau}
              onChange={(value) => void updateSettings({ autoApproveLuau: value })}
            />
            <Toggle
              label="Stream responses"
              hint="Show the model's text as it arrives."
              value={settings.streamResponses}
              onChange={(value) => void updateSettings({ streamResponses: value })}
            />
            <div className="prop-row" style={{ marginTop: 6 }}>
              <span className="prop-key">Max agent steps</span>
              <input
                className="prop-input"
                type="number"
                min={1}
                max={30}
                value={settings.maxAgentSteps}
                onChange={(event) => void updateSettings({ maxAgentSteps: Number(event.target.value) || 8 })}
              />
            </div>
          </div>

          <div className="field">
            <span className="field-label">Studio attachment</span>
            <div className="row">
              <span className={`status-chip ${studio?.connected ? 'ok' : 'warn'}`}>
                <span className="dot" />
                {studio?.connected
                  ? `Attached to ${studio.studios.find((entry) => entry.id === studio.activeStudioId)?.name ?? 'Studio'}`
                  : studio?.mcpAvailable
                    ? 'Waiting for a place'
                    : 'Studio MCP server not found'}
              </span>
              <span className="hint">{studio?.toolCount ?? 0} tools · MCP {studio?.protocolVersion ?? '?'}</span>
            </div>
            <span className="hint">
              Codeon drives Studio through the MCP server Roblox ships with Studio itself — no plugin to
              install. Enable it once under Studio&nbsp;→&nbsp;Assistant&nbsp;→&nbsp;MCP, then keep a place open.
            </span>
            {studio?.launcher && (
              <span className="hint mono" style={{ wordBreak: 'break-all' }}>
                {studio.launcher}
              </span>
            )}
            {studio?.lastError && <span className="hint">{studio.lastError}</span>}
            <div className="row">
              <button className="btn sm" onClick={() => void refreshStudio()}>
                <RefreshCw size={13} /> Reconnect
              </button>
              <button
                className="btn sm ghost"
                onClick={() => void window.codeon.invoke('shell:openExternal', info.studioDocsUrl)}
              >
                <ExternalLink size={13} /> MCP setup guide
              </button>
            </div>
          </div>

          <div className="field">
            <span className="field-label">About</span>
            <span className="hint">
              Codeon {info.version} · {info.platform} · {info.isPackaged ? 'packaged build' : 'development build'}
            </span>
            <span className="hint mono" style={{ wordBreak: 'break-all' }}>
              {info.userData}
            </span>
            <button className="btn sm ghost" onClick={() => void window.codeon.invoke('shell:openExternal', info.repoUrl)}>
              <ExternalLink size={13} /> github.com/ShroomyGod/Codeon
            </button>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="btn primary" onClick={() => setSettingsOpen(false)}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function Toggle({
  label,
  hint,
  value,
  onChange
}: {
  label: string
  hint?: string
  value: boolean
  onChange: (value: boolean) => void
}): React.JSX.Element {
  return (
    <label className="switch" style={{ alignItems: 'flex-start' }}>
      <input
        type="checkbox"
        checked={value}
        style={{ display: 'none' }}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={`toggle${value ? ' on' : ''}`} style={{ marginTop: 2 }} />
      <span>
        <span>{label}</span>
        {hint && (
          <>
            <br />
            <span className="hint">{hint}</span>
          </>
        )}
      </span>
    </label>
  )
}

function ProviderRow({
  provider,
  active,
  hasKey,
  savedBaseUrl,
  savedModel,
  onActivate,
  onSave,
  onOpenDocs
}: {
  provider: ProviderDef
  active: boolean
  hasKey: boolean
  savedBaseUrl: string
  savedModel: string
  onActivate: () => void
  onSave: (payload: { apiKey?: string; baseUrl?: string; model?: string }) => void
  onOpenDocs: () => void
}): React.JSX.Element {
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(savedBaseUrl)
  const [model, setModel] = useState(savedModel)
  const [dirty, setDirty] = useState(false)
  const loadModels = useStore((state) => state.loadModels)
  const pushToast = useStore((state) => state.pushToast)
  const listed = useStore((state) => state.modelCatalog[provider.id]?.models.length ?? 0)

  async function refreshList(): Promise<void> {
    await loadModels(provider.id, { refresh: true })
    const models = useStore.getState().modelCatalog[provider.id]?.models ?? []
    if (models.length > 0) pushToast('success', `${provider.label}: ${models.length} models`)
    else pushToast('info', `${provider.label} did not return a model list`)
  }

  return (
    <div className={`provider-item${active ? ' active' : ''}`}>
      <div className="provider-head">
        <span className="provider-name">{provider.label}</span>
        {!provider.requiresKey && <span className="badge free">no key needed</span>}
        {provider.local && <span className="badge">local</span>}
        {listed > 0 && <span className="badge">{listed} models</span>}
        <span style={{ marginLeft: 'auto' }} />
        {!active && (
          <button className="btn sm ghost" onClick={onActivate}>
            Use
          </button>
        )}
        {active && <span className="badge script">active</span>}
      </div>

      {provider.notes && <div className="provider-notes">{provider.notes}</div>}

      {provider.requiresKey || provider.keyUrl ? (
        <div className="row">
          <input
            className="input grow"
            type="password"
            placeholder={hasKey ? '•••••••• key saved — paste to replace' : (provider.keyLabel ?? 'API key')}
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value)
              setDirty(true)
            }}
          />
          <button className="btn sm" onClick={onOpenDocs} title="Open the key page">
            <ExternalLink size={13} /> Key
          </button>
        </div>
      ) : null}

      <div className="row">
        <input
          className="input grow"
          placeholder={provider.baseUrl || 'https://your-endpoint/v1'}
          value={baseUrl}
          onChange={(event) => {
            setBaseUrl(event.target.value)
            setDirty(true)
          }}
          title="Base URL"
        />
        <input
          className="input"
          style={{ width: 150 }}
          placeholder={provider.defaultModel || 'model id'}
          value={model}
          onChange={(event) => {
            setModel(event.target.value)
            setDirty(true)
          }}
          title="Default model for this provider"
        />
        <button
          className="btn sm ghost"
          title="List models from the endpoint"
          onClick={() => void refreshList()}
        >
          <RefreshCw size={13} />
        </button>
        <button
          className="btn sm"
          disabled={!dirty}
          onClick={() => {
            onSave({
              apiKey: apiKey ? apiKey : undefined,
              baseUrl,
              model
            })
            setApiKey('')
            setDirty(false)
          }}
        >
          Save
        </button>
      </div>
    </div>
  )
}

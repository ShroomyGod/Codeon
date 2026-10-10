import type {
  AgentEvent,
  Change,
  OutputLine,
  Project,
  SettingsView,
  StudioStatus
} from '@shared/types'
import type { ApiMap, AppApi, InvokeChannel } from '@shared/ipc'

declare global {
  interface Window {
    codeon: AppApi
  }
}

export const api: AppApi = window.codeon

/** Invoke a channel with payload/response types derived from the API map. */
export function invoke<K extends InvokeChannel>(
  channel: K,
  payload?: ApiMap[K]['request']
): Promise<ApiMap[K]['response']> {
  return api.invoke<ApiMap[K]['response']>(channel, payload)
}

/**
 * Wraps a typed event listener so it can be handed to the untyped bridge.
 * `never` in the parameter position accepts any concrete listener type.
 */
function bind(listener: (payload: never) => void): (payload: unknown) => void {
  return listener as unknown as (payload: unknown) => void
}

export const events = {
  onAgent(listener: (event: AgentEvent) => void): () => void {
    return api.on('agent:event', bind(listener))
  },
  onStudioStatus(listener: (status: StudioStatus) => void): () => void {
    return api.on('studio:status', bind(listener))
  },
  onStudioConsole(listener: (lines: OutputLine[]) => void): () => void {
    return api.on('studio:console', bind(listener))
  },
  onChanges(listener: (change: Change) => void): () => void {
    return api.on('changes:changed', bind(listener))
  },
  onProjects(listener: (projects: Project[]) => void): () => void {
    return api.on('projects:changed', bind(listener))
  },
  onSettings(listener: (settings: SettingsView) => void): () => void {
    return api.on('settings:changed', bind(listener))
  }
}

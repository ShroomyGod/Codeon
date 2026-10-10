import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  EVENT_CHANNELS,
  INVOKE_CHANNELS,
  type AppApi,
  type EventChannel,
  type InvokeChannel
} from '../shared/ipc'

const invokeSet = new Set<string>(INVOKE_CHANNELS)
const eventSet = new Set<string>(EVENT_CHANNELS)

const api: AppApi = {
  invoke<T = unknown>(channel: InvokeChannel, payload?: unknown): Promise<T> {
    if (!invokeSet.has(channel)) {
      return Promise.reject(new Error(`Blocked unknown IPC channel: ${channel}`))
    }
    return ipcRenderer.invoke(channel, payload) as Promise<T>
  },

  on(channel: EventChannel, listener: (payload: unknown) => void): () => void {
    if (!eventSet.has(channel)) return () => undefined
    const handler = (_event: IpcRendererEvent, payload: unknown) => listener(payload)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  }
}

contextBridge.exposeInMainWorld('codeon', api)

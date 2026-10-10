import { app, BrowserWindow, Menu, shell } from 'electron'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { OutputLine, StudioStatus } from '../shared/types'
import { Agent } from './ai/agent'
import { ToolRunner } from './ai/tools'
import { ChangeService } from './changes'
import { registerIpc } from './ipc'
import { Store } from './store'
import { StudioMcpClient } from './studio/mcp'

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
app.setAppUserModelId('com.codeon.app')

const resourcesDir = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')

let mainWindow: BrowserWindow | null = null
let store: Store
let mcp: StudioMcpClient
let agent: Agent

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
}

/**
 * Carry the previous install's data across the rename.
 *
 * Electron derives the userData folder from the app name, so the first launch
 * under the new name would open an empty database while every project sat in
 * the folder the old name created. Copy it over once, and leave the original
 * untouched so a rollback still finds its data.
 */
function adoptLegacyUserData(): void {
  // Electron creates the new userData folder itself before the app is ready,
  // so the database is what tells us whether this install has any data yet.
  const database = join(app.getPath('userData'), 'state', 'db.json')
  if (existsSync(database)) return

  const legacy = ['ShroomAI', 'shroomai']
    .map((name) => join(app.getPath('appData'), name, 'state', 'db.json'))
    .find((file) => existsSync(file))
  if (!legacy) return

  try {
    mkdirSync(dirname(database), { recursive: true })
    copyFileSync(legacy, database)
    console.log(`[store] adopted the settings and projects from ${legacy}`)
  } catch (error) {
    console.warn('[store] could not adopt the previous database:', error)
  }
}

function emit(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 940,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    backgroundColor: '#0d0f12',
    title: 'Codeon',
    icon: join(resourcesDir, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) void mainWindow.loadURL(devUrl)
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

async function bootstrap(): Promise<void> {
  adoptLegacyUserData()
  store = new Store(app.getPath('userData'))
  store.pruneChanges()

  mcp = new StudioMcpClient({ launcherOverride: store.settings.mcpLauncherOverride })

  const changes = new ChangeService(store, mcp, (change) => emit('changes:changed', change))
  const tools = new ToolRunner(store, mcp, changes)
  agent = new Agent({
    store,
    mcp,
    tools,
    emit: (event) => emit('agent:event', event)
  })

  mcp.on('status', (status: StudioStatus) => emit('studio:status', status))
  mcp.on('console', (lines: OutputLine[]) => emit('studio:console', lines))
  mcp.on('diagnostic', (text: string) => console.log(`[studio] ${text.trim()}`))
  mcp.on('tools', (toolsList: { name: string }[]) =>
    console.log(`[studio] ${toolsList.length} tools available`)
  )

  registerIpc({ store, mcp, changes, tools, agent, emit, resourcesDir })

  createWindow()

  // Attaching is a separate concern from starting the app: if Studio is closed
  // or its MCP server is disabled, the window still opens and the UI explains
  // what to turn on.
  void mcp.ensureStarted().catch((error) => {
    console.warn('[studio] initial attach failed:', error instanceof Error ? error.message : error)
  })
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  bootstrap().catch((error) => {
    console.error('[codeon] failed to start:', error)
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  agent?.cancelAll()
  try {
    store?.flush()
  } catch (error) {
    console.error('[store] flush on quit failed:', error)
  }
  void mcp?.stop()
})

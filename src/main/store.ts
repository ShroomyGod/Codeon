import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Change, Project, Settings } from '../shared/types'

/**
 * A tiny, dependency-free JSON store.
 *
 * Everything the app persists lives in one file under Electron's userData
 * directory. Writes are debounced and go through a temp file + rename so a
 * crash mid-save can never leave a half-written database behind.
 */
export interface Database {
  version: number
  settings: Settings
  projects: Project[]
  changes: Change[]
}

const DB_VERSION = 1

export function defaultSettings(): Settings {
  return {
    activeProviderId: 'opencode-zen',
    activeModel: 'grok-code',
    providers: {},
    theme: 'dark',
    reviewChanges: true,
    autoApproveScripts: false,
    autoApproveLuau: false,
    maxAgentSteps: 12,
    streamResponses: true,
    showInternalServices: false,
    telemetry: false
  }
}

function emptyDatabase(): Database {
  return { version: DB_VERSION, settings: defaultSettings(), projects: [], changes: [] }
}

export class Store {
  private readonly file: string
  private data: Database
  private timer: NodeJS.Timeout | null = null

  constructor(userDataDir: string) {
    this.file = join(userDataDir, 'state', 'db.json')
    mkdirSync(dirname(this.file), { recursive: true })
    this.data = this.load()
  }

  private load(): Database {
    if (!existsSync(this.file)) return emptyDatabase()
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Database>
      return {
        version: DB_VERSION,
        settings: { ...defaultSettings(), ...(parsed.settings ?? {}) },
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        changes: Array.isArray(parsed.changes) ? parsed.changes : []
      }
    } catch (error) {
      console.error('[store] database is corrupt, starting fresh:', error)
      return emptyDatabase()
    }
  }

  /** Cancel any pending debounced write. Call on shutdown, or in tests before
   * removing the data directory, so a late timer cannot fire against it. */
  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /** Flush to disk. Safe to call at any time. */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
    renameSync(tmp, this.file)
  }

  /** Schedule a save shortly; coalesces bursts of edits. */
  private persist(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      try {
        this.flush()
      } catch (error) {
        console.error('[store] failed to persist:', error)
      }
    }, 250)
  }

  get settings(): Settings {
    return this.data.settings
  }

  updateSettings(patch: Partial<Settings>): Settings {
    this.data.settings = { ...this.data.settings, ...patch }
    this.persist()
    return this.data.settings
  }

  get projects(): Project[] {
    return this.data.projects
  }

  getProject(id: string): Project | undefined {
    return this.data.projects.find((project) => project.id === id)
  }

  saveProject(project: Project): Project {
    const index = this.data.projects.findIndex((existing) => existing.id === project.id)
    if (index >= 0) this.data.projects[index] = project
    else this.data.projects.push(project)
    this.persist()
    return project
  }

  updateProject(id: string, mutate: (project: Project) => void): Project | undefined {
    const project = this.getProject(id)
    if (!project) return undefined
    mutate(project)
    project.updatedAt = Date.now()
    this.persist()
    return project
  }

  deleteProject(id: string): boolean {
    const before = this.data.projects.length
    this.data.projects = this.data.projects.filter((project) => project.id !== id)
    this.data.changes = this.data.changes.filter((change) => change.projectId !== id)
    this.persist()
    return this.data.projects.length !== before
  }

  get changes(): Change[] {
    return this.data.changes
  }

  getChangesForSession(sessionId: string): Change[] {
    return this.data.changes.filter((change) => change.sessionId === sessionId)
  }

  saveChange(change: Change): Change {
    const index = this.data.changes.findIndex((existing) => existing.id === change.id)
    if (index >= 0) this.data.changes[index] = change
    else this.data.changes.push(change)
    this.persist()
    return change
  }

  getChange(id: string): Change | undefined {
    return this.data.changes.find((change) => change.id === id)
  }

  /** Drop resolved changes older than `keepMs` so the file does not grow forever. */
  pruneChanges(keepMs = 1000 * 60 * 60 * 24 * 7): void {
    const cutoff = Date.now() - keepMs
    const before = this.data.changes.length
    this.data.changes = this.data.changes.filter(
      (change) => change.status === 'pending' || (change.resolvedAt ?? change.createdAt) > cutoff
    )
    if (this.data.changes.length !== before) this.persist()
  }
}

export function createProject(name: string, description = ''): Project {
  const now = Date.now()
  const sessionId = randomUUID()
  const palette = ['#e8823c', '#76b900', '#4c9ee8', '#c05ce0', '#e0b23c', '#3cc9b0']
  return {
    id: randomUUID(),
    name: name.trim() || 'Untitled project',
    description,
    createdAt: now,
    updatedAt: now,
    sessions: [
      {
        id: sessionId,
        title: 'First session',
        createdAt: now,
        updatedAt: now,
        messages: [],
        changeIds: []
      }
    ],
    activeSessionId: sessionId,
    files: [],
    color: palette[Math.floor(Math.random() * palette.length)]
  }
}

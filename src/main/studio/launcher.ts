import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Roblox Studio ships its own MCP server. The desktop app does not install
 * anything into Studio — it just launches the launcher Roblox itself provides.
 */
export interface McpLauncher {
  command: string
  args: string[]
  /** Human-readable form, shown in Settings and error messages. */
  display: string
  /** Path that must exist for the launcher to be usable. */
  path: string
  platform: NodeJS.Platform
}

export interface ResolveOptions {
  platform?: NodeJS.Platform
  localAppData?: string
  /** User override from Settings; a full command line, quotes honoured. */
  override?: string
}

/** Splits a command line, respecting single and double quotes. */
export function splitCommandLine(input: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  for (const char of input.trim()) {
    if (quote) {
      if (char === quote) quote = null
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === ' ' || char === '\t') {
      if (current) parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current) parts.push(current)
  return parts
}

/**
 * Picks the newest `StudioMCP.exe` from an install, which is what `mcp.bat`
 * itself falls back to via the registry when the stable path is missing.
 */
export function findNewestStudioMcp(versionsDir: string): string | null {
  if (!existsSync(versionsDir)) return null
  let best: { path: string; mtime: number } | null = null
  for (const entry of readdirSync(versionsDir)) {
    const candidate = join(versionsDir, entry, 'StudioMCP.exe')
    if (!existsSync(candidate)) continue
    const mtime = statSync(candidate).mtimeMs
    if (!best || mtime > best.mtime) best = { path: candidate, mtime }
  }
  return best?.path ?? null
}

export function resolveMcpLauncher(options: ResolveOptions = {}): McpLauncher | null {
  const platform = options.platform ?? process.platform

  if (options.override && options.override.trim()) {
    const parts = splitCommandLine(options.override)
    if (parts.length > 0) {
      const [command, ...args] = parts
      return { command, args, display: options.override.trim(), path: command, platform }
    }
  }

  if (platform === 'win32') {
    const localAppData = options.localAppData ?? process.env.LOCALAPPDATA ?? ''
    if (!localAppData) return null

    const bat = join(localAppData, 'Roblox', 'mcp.bat')
    if (existsSync(bat)) {
      return {
        command: 'cmd.exe',
        args: ['/c', bat],
        display: `cmd.exe /c ${bat}`,
        path: bat,
        platform
      }
    }

    // `mcp.bat` is only written once Studio has run at least once, so fall back
    // to launching the bundled server binary directly.
    const exe = findNewestStudioMcp(join(localAppData, 'Roblox', 'Versions'))
    if (exe) return { command: exe, args: [], display: exe, path: exe, platform }
    return null
  }

  if (platform === 'darwin') {
    const exe = '/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP'
    if (existsSync(exe)) return { command: exe, args: [], display: exe, path: exe, platform }
    return null
  }

  // Roblox Studio is not distributed for Linux.
  return null
}

/** Explains why no launcher was found, in terms a user can act on. */
export function describeMissingLauncher(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'darwin') {
    return 'Roblox Studio was not found at /Applications/RobloxStudio.app. Install or update Studio, then reopen Codeon.'
  }
  if (platform === 'win32') {
    return 'Roblox Studio\u2019s MCP launcher was not found under %LOCALAPPDATA%\\Roblox. Install or update Studio, then reopen Codeon.'
  }
  return 'Roblox Studio does not run on this platform, so Codeon cannot attach to a live session.'
}

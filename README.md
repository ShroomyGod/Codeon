<div align="center">

<img src="build/icon.png" alt="Codeon" width="132" />

# Codeon

**An AI copilot for Roblox Studio that attaches to your live session, reviews every change as a diff, and drives playtests.**

[![Release](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FShroomyGod%2FCodeon%2Fmain%2Fpackage.json&query=%24.version&label=version&color=e8823c)](https://github.com/ShroomyGod/Codeon/releases)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-0078d4.svg)](#installation)
[![Built with](https://img.shields.io/badge/built%20with-Electron%20%2B%20React-47848f.svg)](#architecture)

[Install](#installation) · [Quick start](#quick-start) · [Features](#features) · [Providers](#ai-providers) · [Releasing](#versioning-and-releases) · [Architecture](#architecture)

</div>

---

## What is Codeon?

Codeon is a desktop app that plugs into Roblox Studio and hands the tedious parts of
building a place to an AI you can actually audit.

It connects to your **live Studio session**, not a copy on disk. It reads the real
DataModel, writes real scripts, edits real properties, and runs real playtests — and
before any of that touches your place, you get a **reviewable diff**.

Think of it as a pair programmer that knows what is in your Explorer right now.

### Highlights

| | |
|---|---|
| 🔌 **Live Studio attachment** | No plugin. Codeon drives the MCP server Roblox ships inside Studio, so it talks to the open place directly. |
| 🧾 **Review every change** | Script rewrites, property edits, instance creation and deletion all become diffs you accept or reject. Batch-approve when you trust it. |
| 🌳 **Explorer + Properties + Code** | Browse the DataModel, edit instances and their properties, and open scripts in a real Monaco editor with Luau highlighting. |
| ▶️ **Playtests the AI can drive** | Start and stop Studio's Run mode from the app and from the agent, with the full Output stream captured for analysis. |
| 🗂️ **Projects, not just chats** | Group sessions, file snapshots and review history per place, so switching work does not lose context. |
| 🆓 **Free by default** | OpenCode Zen's keyless tier works out of the box: a hand-picked list of free coding models, no account and no sign-up. Bring your own key for anything else. |
| 🧩 **Twelve providers** | OpenAI, Anthropic, Gemini, OpenRouter, Groq, DeepSeek, Mistral, xAI, Together, Cerebras, Ollama and LM Studio — plus any OpenAI-compatible endpoint. |
| 🚀 **One-command releases** | `npm run release` bumps the version by this project's rules, builds the installer, tags it, and publishes the GitHub release. |

---

## Installation

### Download the installer

Grab `Codeon-Setup-x.y.z.exe` from the [releases page](https://github.com/ShroomyGod/Codeon/releases)
and run it.

> **Windows SmartScreen** may warn about an unsigned installer the first time. Choose
> *More info → Run anyway*. The installer is a standard NSIS package: it can install
> per-user, lets you pick a directory, and creates desktop and Start-menu shortcuts.

### Build from source

```bash
git clone https://github.com/ShroomyGod/Codeon.git
cd Codeon
npm install          # also generates the app icons
npm run dev          # hot-reloading Electron window
npm run build:win    # produces dist/Codeon-Setup-<version>.exe
```

Requires **Node.js 20.19+** on Windows, macOS or Linux builds.

---

## Quick start

1. **Launch Codeon.** On first run it uses OpenCode Zen's keyless free models — nothing to configure.
2. **Turn on Studio's MCP server.** In Roblox Studio open **Assistant → MCP** and enable it. This is
   Roblox's own setting and only needs doing once. There is no plugin to install.
3. **Open a place.** Codeon launches Studio's bundled MCP server, handshakes with it and lists the
   open Studio windows. The status chip in the title bar turns green and shows the place name.
4. **Create a project** in the left rail, then ask for something:
   > *"Find the script that handles player joins and add a welcome message with a sound effect."*
5. **Review the diff.** The agent reads what it needs, proposes changes, and every edit lands in
   the **Review** tab as a diff with **Accept** / **Reject** buttons.
6. **Test it.** Press **Start playtest** and watch the output stream. Copy the log into the chat
   and ask Codeon to explain the errors.

---

## Features

### Live Studio attachment — no plugin

Codeon drives Studio through the **MCP server Roblox ships inside Studio itself**. Nothing is
installed into Studio and no socket is opened; the app spawns Roblox's own launcher and speaks
JSON-RPC to it over stdio:

```
┌──────────────────────────┐   spawn (cmd.exe /c mcp.bat)   ┌──────────────────────┐
│  Roblox Studio           │ ◀───────────────────────────── │  Codeon main proc. │
│  StudioMCP.exe + place   │                                │  MCP client (stdio)  │
│  30 tools                │   JSON-RPC 2.0 over stdio      │                      │
│                          │ ─────────────────────────────▶ │  tools/call result   │
└──────────────────────────┘                                └──────────────────────┘
```

* The launcher is discovered at `%LOCALAPPDATA%\Roblox\mcp.bat`, falling back to the newest
  `StudioMCP.exe` under `Versions\`; a manual override lives in Settings.
* The tool catalog is **not hard-coded** — Codeon asks the server what it advertises and builds
  the agent's tool list and system prompt from the live response.
* `list_roblox_studios` enumerates open Studio windows, so multiple places can be switched between
  from the "Pick Studio" dropdown in the title bar.
* Reconnects are automatic; a closed Studio surfaces as a status message rather than a crash.

### Change review

Every mutation the agent wants to make is a `Change` record before it is anything else.

| Kind | What you see |
| --- | --- |
| `script` | A full line diff of the script source (`+` / `-` with context collapsing). |
| `property` | Before/after values for one instance property. |
| `create` | The instance descriptor that will be created, as added lines. |
| `delete` | The instance snapshot that will be removed, as deleted lines. |

* **Accept** replays the stored Studio tool call; **Reject** discards it with no side effects.
* **Accept all** / **Reject all** handle a whole batch.
* Turn *Review changes before they touch Studio* off in Settings and the agent applies directly
  (you can still auto-accept scripts and properties independently).

### Explorer, Properties and Code

Three columns beside the activity bar: **Explorer** and **Playtest** on the left, **Code** and
**Properties** in the middle, the **chat** on the right of the projects rail.

* **Explorer** — the live DataModel tree, with depth control, search, and a "select what
  is highlighted in Studio" button. Every class gets a vector icon drawn in Studio's own colour
  language, and the title bar carries a Studio-window dropdown whenever more than one place is
  open. Create new instances inline. A place reports 120+ services and most of them are engine
  and Studio bookkeeping (`RunService`, `NetworkClient`, the debuggers, the asset pipeline), so
  the tree lists the services Studio's own Explorer shows. The rest are one click away under
  **Internal services** in the overflow menu — the equivalent of Studio's "Show Hidden Objects
  in Explorer" setting.
* **Properties** — Studio's MCP server reports the real properties for the selected instance, so
  the panel shows what actually exists rather than a guessed catalog. Values are coerced back into
  `Vector3`, `Color3`, `UDim2`, `CFrame`, `BrickColor`, `Enum` items and attributes when saved
  (prefix a name with `@` to edit an attribute).
* **Code** — scripts open in Monaco with Lua highlighting, `Ctrl+S` to save straight to Studio,
  and one-click revert. An unsaved-changes indicator follows you across tabs.

### Playtesting

* **Start / stop Run mode** from the app or let the agent do it as a tool.
* The app polls Studio's console and mirrors every line in real time.
* **Ask Codeon to analyse** pipes the recent log into the chat with instructions to find the
  root cause and propose reviewable fixes.
* Honest limitation: Codeon starts Studio's **Run** mode; start a full character **Play** test
  manually yourself — output capture still works while you do.

### Projects and sessions

A project owns its sessions, its file snapshots, and its review history. Two places can be
worked on side by side without mixing contexts, and every session keeps its own transcript.

### The agent loop

Codeon uses a provider-agnostic action protocol instead of vendor tool-calling, so small free
models work as well as frontier ones. The model replies with prose plus fenced blocks:

````text
Let me look at that script first.

```codeon-action
{ "tool": "get_script", "args": { "path": "ServerScriptService/Main" } }
```
````

The app executes the tool, feeds the JSON result back, and loops (up to *Max agent steps*) until
the model stops asking. Streamed prose is filtered so you never see raw action JSON.

**Tools available to the agent**

`studio_status` · `list_instances` · `get_instance` · `set_property` · `get_script` ·
`set_script` · `create_instance` · `delete_instance` · `run_luau` · `start_playtest` ·
`stop_playtest` · `get_output` · `read_project_file` · `write_project_file`

---

## AI providers

The default is **OpenCode Zen**, which serves verified coding models behind an
OpenAI-compatible endpoint. Its keyless tier needs no account at all: pick one of the free
models Codeon lists and start chatting. Zen publishes no quota for that tier, so Codeon shows
no usage counter — if the provider does rate-limit you, the composer reports it as
`Rate limited (429)`. Add a Zen key for the paid catalog.

Everything else needs your own key. Keys are stored in the app's local state directory, never in
the project folder and never sent anywhere except the provider itself.

| Provider | Key required | Notes |
| --- | --- | --- |
| **OpenCode Zen** | No | Free models with no account; add a Zen key for the paid catalog |
| OpenAI | Yes | GPT-5.x, o-series |
| Anthropic | Yes | Claude Sonnet / Opus / Haiku |
| Google Gemini | Yes | 2.5 Pro / Flash |
| OpenRouter | Yes | One key, hundreds of models incl. `:free` ones |
| Groq | Yes | Very low latency |
| DeepSeek | Yes | Chat and Reasoner |
| Mistral | Yes | Large, Devstral, Codestral |
| xAI | Yes | Grok 4, Grok Code Fast |
| Together AI | Yes | Kimi K2, Qwen3 Coder |
| Cerebras | Yes | Fast Qwen3 Coder |
| Ollama / LM Studio | No | Fully local, no quota, no internet |
| Custom | Optional | Any OpenAI-compatible base URL |

All API calls happen in the **main process** — keys never enter the renderer bundle, and there
are no CORS problems. Add a key in **Settings → Providers**, and press ⟳ to pull the model list
from the endpoint.

---

## Versioning and releases

Two moving parts: the version a release gets, and the tag it lives under.

### Version rules

| Change | Bump | Example |
| --- | --- | --- |
| Bug fixes, small polish | **patch** | `1.0.0` → `1.0.1` |
| New features, whole updates | **minor** | `1.0.0` → `1.1.0` |
| Breaking rewrites | **major** | `1.0.0` → `2.0.0` |

### Tag rules

Tags follow the **line**, not the patch:

```
1.0.0  ──▶  tag v1.0.0   (new tag, new release)
1.0.1  ──▶  tag v1.0.0   (notes + installer appended to the same release)
1.0.2  ──▶  tag v1.0.0   (same release again)
1.1.0  ──▶  tag v1.1.0   (new tag, brand new release)
```

So `1.0.2` is published under the `v1.0.0` tag, exactly as the project intends.

### Making a release

```bash
npm run release                                  # bug-fix release, patch bump
npm run release -- --bump minor                  # feature release
npm run release:patch                            # shorthand
npm run release:minor                            # shorthand

npm run release -- --bump minor \
  --title "Projects and playtests" \
  --notes "Projects now keep their own sessions and review history."
```

What the script does:

1. Computes the next version and resolves the line tag.
2. Prepends a categorised entry to `CHANGELOG.md` (features / fixes / performance / docs / other,
   derived from your commits since the last tag).
3. Bumps `package.json`, builds the renderer, and packages `Codeon-Setup-<version>.exe`.
4. Computes the SHA-256 of the installer and writes `dist/RELEASE_NOTES_<version>.md`.
5. Commits, creates or reuses the tag, and pushes branch + tag.
6. Creates the GitHub release for a new line, or **updates the existing one** for a patch —
   replacing the installer asset and appending the new notes.

Authentication uses `GITHUB_TOKEN`, `GH_TOKEN` or `SHROOM_GITHUB_TOKEN` (or `--token`).
Useful flags: `--dry-run`, `--skip-build`, `--no-push`, `--version x.y.z`, `--prerelease`.

---

## Architecture

```
src/
  shared/            contract shared by every process
    types.ts           domain model (projects, changes, studio, agent events)
    ipc.ts             channel allowlist + typed request/response map
    providers.ts       the provider catalog
    version.ts         bump + tag rules (unit tested)
  main/              Node side of Electron
    index.ts           bootstrap: store, MCP client, IPC, window
    store.ts           debounced atomic JSON persistence
    changes.ts         the review queue and how a change is applied
    ipc.ts             every ipcMain handler
    ai/
      client.ts        streaming for OpenAI-compatible, Anthropic and Gemini
      prompt.ts        system prompt + per-request context block
      protocol.ts      action-block parser
      tools.ts         tool executor (live Studio MCP tools + project files)
      agent.ts         the multi-step agent loop
    studio/
      launcher.ts      finds Roblox's StudioMCP launcher (mcp.bat / StudioMCP.exe)
      mcp.ts           JSON-RPC MCP client over stdio (integration tested)
      queries.ts       typed reads/writes built on top of the MCP tools
      luau.ts          Luau builders for property/instance operations
      scripts.ts       script_read gutter + multi_edit replay helpers
  preload/           contextBridge with a channel allowlist
  renderer/          React + Zustand + Monaco UI
resources/
  icon.png           app + installer icon source
scripts/
  make-icons.mjs     PNG/ICO generation from build/icon-source.png
  release.mjs        the release pipeline
tests/               node:test suites (version, protocol, store, gametree, studio)
```

Deeper detail on the attachment — the MCP handshake, launcher resolution, tool mapping and known
failure modes — lives in [docs/STUDIO_ATTACHMENT.md](docs/STUDIO_ATTACHMENT.md).

### Security posture

* Renderer runs with `contextIsolation: true`, `nodeIntegration: false`, and a strict CSP.
* The preload script only exposes an explicit allowlist of IPC channels.
* Studio is reached only by spawning Roblox's own local MCP launcher; Codeon never opens a port
  to the network and never installs code into Studio.
* API keys live in main-process state and are never returned to the renderer (only a `hasKey`
  boolean crosses the bridge).

---

## Development

```bash
npm run dev         # Electron with HMR
npm run build       # bundle main, preload and renderer into out/
npm run typecheck   # strict TS across both projects
npm test            # node:test over version rules, protocol, store, tree and studio helpers
npm run icons       # regenerate build/icon.ico + resources/icon.png
```

The agent's tool list is not hard-coded: it is read from Studio's MCP server at connect time. The
tools Codeon adds on top of that catalog — and therefore the ones routed through the review
queue — live in [`LOCAL_TOOLS`](src/main/ai/tools.ts); everything else is a pass-through to
Roblox's own tool.

To point Codeon at a non-standard Studio install, set a launcher command line under
**Settings → Studio attachment** (it accepts quotes, e.g. `cmd.exe /c "C:\path to\mcp.bat"`).

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Status chip says "MCP server not found" | Studio has never run on this machine, so it has not written `mcp.bat`. Install or update Studio, launch it once, then press **Reconnect** (or set a launcher override in Settings). |
| Chip is amber: "Studio MCP ready — open a place" | The connection is up but no place is open. Open or create a place, then press **Refresh**. |
| Attached but tools fail | Enable Studio as an MCP server under **Assistant → Manage MCP Servers**. |
| Provider answers `Rate limited (429)` | Wait a moment, switch provider, or add a Zen key in Settings to reach the paid catalog. |
| Provider 401 | The key was rejected — re-paste it in Settings → Providers. |
| Installer blocked by SmartScreen | *More info → Run anyway*. The build is unsigned. |

---

## License

[MIT](LICENSE) © ShroomyGod

Codeon is an independent project and is not affiliated with or endorsed by Roblox Corporation.

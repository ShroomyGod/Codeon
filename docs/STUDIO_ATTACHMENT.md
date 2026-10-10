# The Codeon ↔ Studio attachment

This document explains how the desktop app talks to Roblox Studio, what each side is
responsible for, and where the sharp edges are.

## Why it works this way

There is no Codeon plugin. Roblox Studio ships its **own MCP server** — the same one that powers
Studio's built-in Assistant — and Codeon is simply another MCP client:

```
┌────────────────────────────┐        spawn (cmd.exe /c mcp.bat)        ┌────────────────────────┐
│  Roblox Studio             │ ◀─────────────────────────────────────── │  Codeon main process │
│  StudioMCP.exe + open place│                                          │  StudioMcpClient       │
│  ~30 tools                 │  initialize / tools/list / tools/call    │  (JSON-RPC over stdio) │
│                            │ ────────────────────────────────────────▶│                        │
└────────────────────────────┘        newline-delimited JSON             └────────────────────────┘
```

There is nothing to install into Studio, and no socket is opened on either side. The app:

1. resolves Roblox's launcher,
2. spawns it with `stdio: ['pipe','pipe','pipe']`,
3. performs the MCP handshake, and
4. calls tools on the user's live place.

This means the attachment survives Studio updates, works with Studio's own permission model, and
cannot break because a checked-in Lua file went stale.

## Launching the server

`resolveMcpLauncher` ([`src/main/studio/launcher.ts`](../src/main/studio/launcher.ts)) tries, in order:

| Order | Source | Notes |
| --- | --- | --- |
| 1 | **User override** | Set in **Settings → Studio attachment**. A full command line; quotes are honoured. |
| 2 | `%LOCALAPPDATA%\Roblox\mcp.bat` | Written by Studio itself. Run as `cmd.exe /c <bat>`, because a `.bat` is not directly executable. |
| 3 | Newest `Versions\*\StudioMCP.exe` | Fallback for a machine where `mcp.bat` has not been written yet. `mcp.bat` does the same registry lookup internally. |
| macOS | `/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP` | Same server, different path. |
| Linux | — | Roblox Studio is not distributed for Linux, so the UI says so instead of failing obscurely. |

If none is found, the app still starts: the window opens, the status chip turns red, and Settings
explains exactly what to install.

## Protocol

The client speaks MCP over stdio using **newline-delimited JSON-RPC 2.0** — one JSON object per
line, matching what `mcp.bat` bridges to Studio.

* **Version negotiation.** `initialize` is attempted with `2025-06-18`, then `2025-03-26`, then
  `2024-11-05`, so a future or older Studio still connects. `notifications/initialized` follows.
* **Tool discovery.** `tools/list` is read at connect time and re-read whenever the server emits
  `notifications/tools/list_changed`. The agent's tool list and system prompt are generated from
  that live response — nothing about the catalog is hard-coded.
* **Calls.** `tools/call` returns content parts whose `text` is concatenated, plus a parsed JSON
  view when the whole body is JSON. `isError: true` is raised as a real error.
* **Arguments.** Every Roblox tool requires `studio_id`, which is filled in automatically from the
  active Studio window, and most require a `datamodel_type`, defaulted to the server's first
  advertised value (`Edit`). Missing *required* arguments fail with a readable message instead of
  a server-side stack trace.
* **Timeouts.** Tool calls default to 120s (60s for Luau and play control, 15s for console polls)
  because Studio's UI thread blocks while it runs code. A timeout says so explicitly rather than
  looking like a hang.
* **Cleanup.** Requests in flight are rejected when the child exits, so a killed Studio cannot
  leave a promise pending forever. Stderr is kept in a 40-line ring and surfaces as
  `StudioStatus.lastError`.

## Talking to the right place

`list_roblox_studios` enumerates every open Studio window. `activeStudioId` is resolved once and
re-used; if that window closes, the first remaining one is selected. The title bar shows a picker
whenever more than one is open, and `activeStudioId` is re-checked on a 3-second timer.

## Console output

MCP has no console subscription, so `get_console_output` is polled every 3 seconds. The full
buffer is re-read and compared against the previous read; only a real change is parsed and
forwarded, which keeps the UI identical to Studio's own Output window without duplicating lines.
Lines are tagged `print` / `warn` / `error` from their text, and an optional `HH:MM:SS.mmm` stamp
is decoded into a real timestamp.

## Writes

Studio's MCP server exposes instance creation, deletion and property editing only through Luau, so
Codeon generates that Luau itself and runs it with `execute_luau`:

* [`luau.ts`](../src/main/studio/luau.ts) builds the code — path resolution (including
  `game:GetService` fallback for a service name), value coercion, and a readable result string.
* Value coercion reads the property's *current* type with `typeof()` and parses the incoming string:

  | Type | Accepted input |
  | --- | --- |
  | `Vector3` / `Vector2` | `10, 5, 3` |
  | `Color3` | `255, 128, 0` or `#ff8000` |
  | `UDim2` | `0.5, 0, 1, -20` |
  | `UDim` | `1, 8` |
  | `CFrame` | `0, 5, 0` or `0, 5, 0, 0, 90, 0` (degrees) |
  | `EnumItem` | the item name, e.g. `Neon` |
  | `BrickColor` | name or number |
  | `boolean` | `true` / `false` / `1` / `0` / `yes` |
  | `number` | any numeric string |

  Prefixing a property name with `@` targets an attribute via `SetAttribute`.

* Because a real property query is available, the Properties panel lists what Studio actually
  reports for the selected instance rather than a guessed catalog.

## Script edits

* `script_read` returns text with a `     1→` gutter on every line; `stripLineNumbers` removes it
  so the editor shows real source.
* `multi_edit` applies ordered `old_string` / `new_string` replacements. During review,
  [`scripts.ts`](../src/main/studio/scripts.ts) **replays those edits locally** to render the
  diff, and reports when an edit could not be reproduced instead of showing a wrong preview.
  Roblox performs the authoritative edit only when the change is accepted.
* `search_game_tree` returns a **flat** list keyed by `fullPath`; `buildGameTree`
  ([`src/shared/gametree.ts`](../src/shared/gametree.ts)) nests it for the Explorer, promoting
  orphans to roots so a truncated listing never silently drops instances.

## Security

| Concern | Mitigation |
| --- | --- |
| Remote access | Nothing listens. The app spawns a local child process and writes to its stdin. |
| Untrusted web content | The renderer never sees the launcher, the child process, or raw MCP traffic — only typed IPC results. |
| Prompt injection from the place | Tool output is data. Reviewed tools (`multi_edit`, `execute_luau`) are queued for the user instead of being applied. |
| Studio's own permissions | The server runs inside Studio and is governed by Studio's settings; Codeon cannot exceed them. |

## Failure modes worth knowing

* **Studio MCP disabled.** Studio's own setting (**Assistant → Manage MCP Servers**) must be on.
  The status chip and Settings say so; the connection simply has zero tools until then.
* **No place open.** The handshake succeeds and `connected` is true, but there is no `studio_id`,
  so a call reports "No Roblox Studio instance is attached".
* **Play tests.** Codeon starts Studio's **Run** mode (server simulation). A full character
  **Play** test is started manually — output capture still works either way.
* **Rename races.** A queued change that targets an instance renamed since review will fail and
  show its error in the review card rather than being silently retried.
* **Long tool calls.** A heavy Luau run blocks Studio's UI thread and can exceed the timeout. The
  error message says the call timed out, not that the connection dropped.

## Reconnecting

`StudioMcpClient.restart()` stops the child and starts a fresh one. It runs when the launcher
changes in Settings and whenever **Reconnect** is pressed, so a Studio restart needs no app
restart.

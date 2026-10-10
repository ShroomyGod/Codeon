# Changelog

Every Codeon release is documented here.

Version scheme: a **bug-fix** release bumps the patch (1.0.0 → 1.0.1), a **feature**
release bumps the minor (1.0.0 → 1.1.0). Tags follow the line — every patch of a
line is published under that line's first tag (1.0.2 lives under `v1.0.0`).

## v1.0.0

### 1.0.5 — 2026-10-10

- Maintenance release.

### 1.0.4 — 2026-10-10

- Maintenance release.

### 1.0.3 — 2026-10-10

- Maintenance release.

### 1.0.2 — 2026-10-10

- Maintenance release.

### 1.0.1 — 2026-10-10

- Maintenance release.

### 1.0.0 — initial release

The first public build of Codeon.

**Features**

- **Plugin-free Roblox Studio attachment.** Codeon drives the MCP server
  Roblox ships inside Studio itself, so the app reads and writes the place that
  is actually open — nothing to install into Studio, no loopback bridge, no stale
  copies.
- **Change review queue.** Script rewrites, property edits, instance creation and
  deletion all become diffs with Accept / Reject, batch approval, and an optional
  auto-apply mode. Accepting replays the exact Studio tool call that was reviewed.
- **Explorer, Properties and Code tabs.** Browse the DataModel with vector class
  icons drawn per instance family, a Studio-window dropdown in the title bar when
  more than one place is open, the real properties Studio reports (with type
  coercion and attribute support), and a Monaco editor with Luau highlighting and
  `Ctrl+S` to Studio.
- **Playtests.** Start and stop Studio's Run mode from the app or from the agent,
  with the full Output stream captured and one click to hand it to the AI for
  analysis.
- **Projects and sessions.** Group sessions, file snapshots and review history per
  place instead of losing everything in one long transcript.
- **Free by default.** OpenCode Zen's keyless tier runs a hand-picked list of free
  coding models with no account and no sign-up.
- **Model picker in the composer.** A searchable dropdown groups every model
  by provider, badges the free ones, ticks the active one, and puts providers
  that already work above ones that still need a key.
- **Twelve providers.** OpenAI, Anthropic, Google Gemini, OpenRouter, Groq,
  DeepSeek, Mistral, xAI, Together, Cerebras, Ollama, LM Studio, plus any
  OpenAI-compatible endpoint. All calls run in the main process; keys never reach
  the renderer.
- **Provider-agnostic agent tools.** The tool list is read from Studio's MCP
  server at connect time — `search_game_tree`, `inspect_instance`, `script_read`,
  `multi_edit`, `execute_luau`, `start_stop_play`, `get_console_output` and the
  rest of the ~30 tools it advertises — plus project file access.
- **One-command releases.** `npm run release` bumps by the project's version and
  tag rules, builds the NSIS installer, writes categorised release notes, tags,
  pushes, and creates or updates the GitHub release.

---
layout: default
title: Codeon — AI copilot for Roblox Studio
---

# Codeon

**An AI copilot for Roblox Studio that attaches to your live session, reviews every change as a diff, and drives playtests.**

[Download the latest installer](https://github.com/ShroomyGod/Codeon/releases/latest){: .btn} — grab `Codeon-Setup-x.y.z.exe` from the [releases page](https://github.com/ShroomyGod/Codeon/releases/latest).

## Guides

- **[Setup](setup.html)** — install the app, run it the first time, build from source.
- **[Attach Studio as an MCP server](studio-mcp.html)** — the one setting that connects Codeon to your live place. No plugin to install.
- **[Troubleshooting](troubleshooting.html)** — the app won't open, Studio isn't found, models error out.

## How it works

Codeon drives Studio through the **MCP server Roblox ships inside Studio itself**. Nothing is installed into Studio and no socket is opened — the app spawns Roblox's own launcher and speaks JSON-RPC to it. Every agent edit lands in a **review queue** as a diff you accept or reject before anything touches your place.

Questions and bug reports: [open an issue](https://github.com/ShroomyGod/Codeon/issues).

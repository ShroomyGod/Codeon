---
layout: default
title: Setup — Codeon
---

# Setup

[← Home](index.html) · [Attach Studio](studio-mcp.html) · [Troubleshooting](troubleshooting.html)

## Install the app

1. Download `Codeon-Setup-x.y.z.exe` from the [releases page](https://github.com/ShroomyGod/Codeon/releases/latest) and run it.
2. If **Windows SmartScreen** warns about an unsigned installer, choose *More info → Run anyway*. The installer is a standard NSIS package: per-user install, custom directory, desktop and Start-menu shortcuts.
3. Launch **Codeon** from the Start menu.

## First run

On first launch Codeon uses **OpenCode Zen's keyless free models** — nothing to configure. To use your own provider instead (OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, DeepSeek, Mistral, xAI, Together, Cerebras, or a local Ollama / LM Studio server), open **Settings** (gear icon, or `Ctrl+,`) and add a key under **Providers**.

Next: [attach Studio as an MCP server](studio-mcp.html) — without it, Codeon can chat but cannot see or change your place.

## Build from source

Requires **Node.js 20.19+** on Windows (macOS or Linux builds also work for development):

```bash
git clone https://github.com/ShroomyGod/Codeon.git
cd Codeon
npm install          # also generates the app icons
npm run dev          # hot-reloading Electron window
npm run build:win    # produces dist/Codeon-Setup-<version>.exe
```

## Update or uninstall

- **Update:** download the new installer and run it — it replaces the previous version in place. Your projects and settings live outside the install folder and are kept.
- **Uninstall:** Windows Settings → Apps → Codeon → Uninstall. To also wipe local data (projects, sessions, settings), delete the app-data folder shown in Codeon's **Settings → About** afterwards.

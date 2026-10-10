---
layout: default
title: Troubleshooting — Codeon
---

# Troubleshooting

[← Home](index.html) · [Setup](setup.html) · [Attach Studio](studio-mcp.html)

## The Codeon window never opens

1. Open **Task Manager** and end any lingering `Codeon` processes — a stuck first instance makes every new launch quit silently (single-instance lock).
2. Launch Codeon again. If it still shows nothing, **reinstall the latest installer** from the [releases page](https://github.com/ShroomyGod/Codeon/releases/latest) over the top.
3. Still stuck? [Open an issue](https://github.com/ShroomyGod/Codeon/issues) and mention your Windows version and which installer you ran.

## Windows SmartScreen blocks the installer

Expected for an unsigned build: choose *More info → Run anyway*.

## Studio isn't found

Codeon looks for Roblox's own launcher (`mcp.bat` that Studio writes, falling back to the newest `StudioMCP.exe`). If Studio lives somewhere unusual, paste the full launcher command line into **Settings → Studio attachment** as an override, then press **Reconnect**.

## Connected, but nothing happens in my place

- Make sure a **place is actually open** in Studio, not just the start screen.
- Check you are attached to the right window when several are open.
- Remember: script edits and code runs wait in the **Review** queue until you accept them — that is the app working as intended, not a freeze.

## Model / provider errors

| Message | Meaning | Fix |
| --- | --- | --- |
| Rejected the API key (401) | The key is wrong or revoked | Re-check it in Settings |
| Out of credit (402) | The provider account is empty | Top up or switch provider |
| Access denied (403) | The key may not use that model | Pick a model your plan covers |
| Not found (404) | Wrong model id or base URL | Check both in Settings |
| Rate limited (429) | Too many requests | Wait a moment or switch provider |
| Took too long (3 minute timeout) | The provider stalled | Retry; large requests stream for a while |

`Request cancelled` just means you pressed **Stop** (or `Esc` in the composer) — nothing broke.

## Something else

[Open an issue](https://github.com/ShroomyGod/Codeon/issues) with what you clicked, what you expected, and the exact message Codeon showed.

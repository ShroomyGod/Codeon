---
layout: default
title: Attach Studio as an MCP server — Codeon
---

# Attach Studio as an MCP server

[← Home](index.html) · [Setup](setup.html) · [Troubleshooting](troubleshooting.html)

There is **no Codeon plugin**. Roblox Studio ships its own MCP server (the same one behind Studio's built-in Assistant), and Codeon is simply another client of it. Nothing is installed into Studio and no network socket is opened — Codeon spawns Roblox's own launcher and talks to it locally.

## Steps

1. In Roblox Studio, open **Assistant → MCP** (on some versions: **Assistant → Manage MCP Servers**) and **enable the MCP server**. This only needs doing once.
2. **Open a place** in Studio — Codeon can only see places you have open.
3. In Codeon, press **Connect to Studio** (or **Reconnect** in Settings). Codeon launches Studio's bundled MCP server, handshakes with it, and lists your open Studio windows.
4. The status chip turns green and shows the place name, plus the number of available tools (around 30).

That's it. Ask for a change and you will get a **reviewable diff** before anything touches your place.

## Multiple Studio windows

If more than one place is open, Codeon attaches to one and offers a picker for the rest. Closing the attached window moves Codeon to the first remaining one automatically.

## If it doesn't connect

- **Chip says "Studio MCP server not found"** — Studio isn't installed where Codeon looks, or the bundled launcher is missing. In **Settings → Studio attachment** you can paste a full launcher command line as an override.
- **Chip says "Waiting for a place"** — the server runs but no Studio window with an open place was found. Open a place and press **Reconnect**.
- **Zero tools after connecting** — Studio's own MCP setting is off. Go back to step 1.

More: [Troubleshooting](troubleshooting.html).

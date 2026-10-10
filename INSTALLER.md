# Releasing the Codeon installer

Everything needed to ship an installer is already wired up. One command builds
it, commits, pushes, and publishes the GitHub release with the `.exe` attached.

## One-time setup: the GitHub token

The release script uses a fine-grained or classic **personal access token** to
create releases and upload the installer asset.

1. Go to <https://github.com/settings/tokens>
2. **Generate new token** (fine-grained is fine):
   - **Repository access:** *Only select repositories* → `ShroomyGod/Codeon`
   - **Permissions:** *Contents* → **Read and write** (covers commits, tags and
     releases). Everything else can stay unset.
3. Copy the token and set it in your terminal so the script picks it up:

   ```bash
   # PowerShell — persist across sessions
   setx GITHUB_TOKEN "ghp_xxxxxxxxxxxx"

   # Git Bash / WSL — current session
   export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"
   ```

   (Classic tokens with the `repo` scope work too. The script also accepts
   `GH_TOKEN`, `CODEON_GITHUB_TOKEN`, or a `--token` flag — see below.)

## Making a release

```bash
npm run release
```

That is the whole command. It:

1. Bumps the version (patch by default — see the rules below) and
   `CHANGELOG.md`.
2. Deletes every old installer from `dist/`, rebuilds, and produces exactly one
   fresh `dist/Codeon-Setup-<version>.exe`.
3. Commits the version bump and changelog, pushes to GitHub, and creates (or
   updates) the release with the installer and its SHA-256 attached.

### Version rules

| Command | Meaning | Version goes |
| --- | --- | --- |
| `npm run release` | bug fix / small polish | `1.0.0 → 1.0.1` (never `1.0.9 → 1.1.0`) |
| `npm run release:minor` | real feature update | `1.0.0 → 1.1.0` |
| `npm run release -- --bump major` | breaking rewrite | `1.0.0 → 2.0.0` |

Tags follow the **line**: `1.0.0`, `1.0.1`, `1.0.2` all publish under the `v1.0.0`
release — a patch release appends its notes + installer to the existing release
instead of making a new one. A minor bump opens `v1.1.0` as a brand-new release.

### Useful flags

```bash
npm run release -- --bump minor --title "Playtest tools" --notes "The agent can now drive Run mode."
npm run release -- --dry-run        # rehearse without touching anything
npm run release -- --no-push        # commit + tag locally, skip GitHub
npm run release -- --skip-build     # reuse the existing dist/ installer
npm run release -- --token ghp_xxx  # bypass the environment variable
```

### Providing the token without setx

```bash
PowerShell:  $env:GITHUB_TOKEN = "ghp_xxx"; npm run release
Git Bash:    GITHUB_TOKEN=ghp_xxx npm run release
```

## What lands on GitHub

- The commit and tag pushed to `main`.
- For a line start (`1.1.0`): a new release `v1.1.0`.
- For a patch (`1.0.1`): the existing `v1.0.0` release gets its notes rewritten
  and its old installer deleted and replaced with the new one.
- `dist/RELEASE_NOTES_<version>.md` — the exact body used on GitHub, plus a
  SHA-256 table for the installer.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `No GitHub token found` | Set `GITHUB_TOKEN` (see one-time setup above). |
| `GitHub POST ... failed (404)` | Wrong repo or the token lacks *Contents: read and write*. |
| `GitHub ... failed (401)` | Token expired or revoked — generate a new one. |
| SmartScreen blocks the installer | Expected for unsigned builds — *More info → Run anyway*. |
| Build fails mid-packaging | Fix the error, then rerun with `--skip-build` only if `dist/` already holds the correct-version installer; otherwise rerun `npm run release` normally (it cleans `dist/` itself). |

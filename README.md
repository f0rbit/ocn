# ocn — opencode notify

Terminal-native session notifications for [OpenCode](https://opencode.ai). Track multiple running instances with a tmux status bar widget and get notified when sessions need attention.

## What it does

- **tmux status bar**: Aggregate view of all running opencode instances
- **macOS notifications**: Native notifications when sessions complete or need input
- **Per-pane indicators**: tmux user option showing current pane's session state
- **Cross-instance**: Works across multiple opencode instances simultaneously

## Install

```jsonc
// Add to your opencode.jsonc
{
  "plugins": ["ocn@latest"]
}
```

OCN targets OpenCode 2.2.5 and `@opencode/plugin` 2.2.5. When upgrading OpenCode, bump the plugin SDK dependency to the same version and verify the event contract.

## tmux Setup

Link the status scripts and add the tmux command to your config:

```bash
# Run from the ocn package directory
mkdir -p ~/.local/bin && ln -sf "$(pwd)/scripts/ocn-tmux-status" ~/.local/bin/ocn-tmux-status && ln -sf "$(pwd)/scripts/ocn-status" ~/.local/bin/ocn-status

# Add to tmux.conf (before existing status-right content)
set -g status-right "#(~/.local/bin/ocn-tmux-status)#{?@nvim_status,#{@nvim_status},} %Y-%m-%d %H:%M"
```

Copies break module resolution by design; keep these installs as symlinks.

### Status indicators

| Symbol | Meaning | Color |
|--------|---------|-------|
| `N!` | N instances need attention (prompting/error) | Red |
| `N~` | N instances busy | Yellow |
| `N✓` | N instances idle | Green |

When all instances are idle, the status bar shows nothing (clean).

## CLI

```bash
# View all active instances
bunx ocn-status
```

## Configuration

Optional config at `~/.config/opencode/ocn.json`:

```json
{
  "notify": {
    "macos": {
      "enabled": true,
      "on_idle": true,
      "on_prompt": true,
      "on_error": true
    },
    "bell": { "enabled": false },
    "tmux_pane": { "enabled": true }
  },
  "debounce_ms": 2000,
  "theme": "tokyonight"
}
```

Themes: `tokyonight` (default), `catppuccin`, `plain`.

## How it works

Each opencode instance runs the plugin in-process via `ctx.event.subscribe()`. On state transitions, it:

1. Writes a JSON state file to `~/.local/state/ocn/<pid>.json`
2. Fires notifications (macOS, bell, tmux pane) based on config
3. Only notifies on transitions (idle→busy doesn't fire, busy→idle does)

The tmux status script reads all state files and renders an aggregate view. Stale files (from crashed processes) are cleaned up automatically via PID checks.

## Architecture

```
opencode instance A ──→ state file A ──┐
opencode instance B ──→ state file B ──├──→ tmux status script ──→ status bar
opencode instance C ──→ state file C ──┘
                                       └──→ ocn-status CLI ──→ terminal table
```

No daemon. No IPC. Just files.

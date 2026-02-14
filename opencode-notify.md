# opencode-notify: `ocn`

## Executive Summary

A **hooks-first, file-based** OpenCode plugin that monitors session states across multiple opencode instances and pushes notifications through configurable channels (tmux status bar, macOS native notifications, terminal bell, sketchybar widget). Ships as an npm package that anyone can add to their `opencode.json` plugins array.

**Key architecture shift from v1 plan**: No daemon. No SSE. No discovery layer. Each opencode instance runs the plugin in-process via the `event` hook, writes state to a shared directory (`~/.local/state/ocn/`), and fires notifications directly. A standalone tmux status script reads the state files for an aggregate cross-instance view.

**Name: `ocn`** (opencode notify).

---

## What Exists Already (and Why This Is Different)

Three community plugins already handle basic OS notifications:

| Feature | opencode-notificator | @mohak34/opencode-notifier | opencode-notify | **ocn** |
|---------|---------------------|---------------------------|-----------------|---------|
| OS notifications | Yes | Yes | Yes | Yes |
| Sound | Yes | Yes | Yes | No (defer to existing) |
| tmux status bar | No | No | No | **Yes** |
| Sketchybar widget | No | No | No | **Yes** |
| Cross-instance aggregate | No | No | No | **Yes** |
| Abstracted event sources | No | No | No | **Yes** |
| Focus detection | No | No | Yes | No (tmux handles this) |

**The gap `ocn` fills:** Terminal-native, multiplexer-aware notification with an aggregate view across all running opencode instances. OS notifications are table stakes — the tmux status line is the unique value.

---

## Architecture

```
┌──────────────────────────────────────────────┐
│          Event Sources (abstracted)           │
│                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌───────┐ │
│  │ OC Plugin A │  │ OC Plugin B │  │ SSE   │ │
│  │ (devpad)    │  │ (chamber)   │  │(future│ │
│  └──────┬──────┘  └──────┬──────┘  └───┬───┘ │
│         │                │             │      │
│         ▼                ▼             ▼      │
│  ┌─────────────────────────────────────────┐  │
│  │         State File Writer               │  │
│  │  ~/.local/state/ocn/<instance-id>.json  │  │
│  └─────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
                       │
                       ▼  (filesystem)
┌──────────────────────────────────────────────┐
│          Notification Consumers               │
│                                               │
│  ┌──────────┐  ┌────────┐  ┌──────────────┐  │
│  │ tmux     │  │ macOS  │  │ sketchybar   │  │
│  │ status   │  │ notif  │  │ widget       │  │
│  │ script   │  │        │  │              │  │
│  └──────────┘  └────────┘  └──────────────┘  │
└──────────────────────────────────────────────┘
```

### How It Works

1. **Plugin** (runs in each opencode instance): Listens to the `event` hook. On state transitions (idle/busy/prompting/error), writes a JSON state file AND fires OS notification directly.

2. **State files** (`~/.local/state/ocn/<instance-id>.json`): Each instance writes one file:
   ```json
   {
     "pid": 4405,
     "directory": "/Users/tom/dev/devpad",
     "project": "devpad",
     "status": "idle",
     "last_transition": "2026-02-14T12:34:56Z",
     "session_id": "ses_abc123"
   }
   ```

3. **tmux status script** (`ocn-tmux-status`): Reads all state files, aggregates by status, renders a tmux format string. Called from `status-right` via `#(ocn-tmux-status)`. Also cleans up stale files where the PID no longer exists.

4. **CLI** (`ocn-status`): Reads state files and prints a human-readable table.

### Why File-Based (Not a Daemon)

- No process to manage (start/stop/crash recovery)
- State is inspectable (`cat ~/.local/state/ocn/*.json | jq`)
- tmux `status-right` already supports `#(script)` for external scripts
- Adding SSE later = just another process writing to the same state dir
- Stale cleanup is trivial (check if PID is alive)

### Event Source Abstraction

The notification pipeline is **agnostic** to where events come from. Today: plugin hooks. Tomorrow: SSE from `opencode serve`. Eventually: runbook workflow events. All event sources implement the same `OcnEvent` type and write to the same state directory. Consumers (tmux script, sketchybar) don't care about the source.

---

## OpenCode Plugin System

The `event` hook is the key mechanism. A plugin exports an async function that returns hooks:

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ $, client, project, directory }) => {
  return {
    event: async ({ event }) => {
      // Receives ALL bus events:
      // session.idle, session.error, permission.updated, session.status, etc.
    }
  }
}
```

Key events:
- `session.idle` — session finished work
- `session.error` — session errored
- `permission.updated` — agent is BLOCKED, waiting for user input
- `session.status` — busy/idle/retry state change

The plugin runs **in-process** with each opencode instance. Each instance has its own plugin lifecycle.

---

## Package Structure

```
ocn/
├── src/
│   ├── plugin.ts              # OpenCode plugin entry point (event hook → state writer + notifier)
│   ├── types.ts               # Core types: OcnEvent, OcnStatus, InstanceState
│   ├── state.ts               # State file reader/writer (read all, write one, cleanup stale)
│   ├── config.ts              # Zod config schema + loader
│   │
│   ├── sources/
│   │   ├── types.ts           # EventSource interface
│   │   └── plugin-adapter.ts  # Adapts opencode plugin events → OcnEvent
│   │   # Future: sse-adapter.ts, runbook-adapter.ts
│   │
│   ├── notify/
│   │   ├── types.ts           # Notifier interface
│   │   ├── macos.ts           # osascript notifications
│   │   ├── bell.ts            # Terminal bell / OSC 9
│   │   ├── tmux.ts            # Direct tmux set-option for per-pane status
│   │   └── index.ts           # NotifierHub: routes events to enabled notifiers
│   │
│   └── util/
│       └── log.ts             # Simple structured logger
│
├── scripts/
│   ├── ocn-tmux-status        # Executable script for tmux status-right
│   ├── ocn-sketchybar.lua     # Drop-in sketchybar widget
│   └── ocn-status             # CLI: reads state files, prints table
│
├── __tests__/
│   ├── state.test.ts          # State file read/write/cleanup
│   ├── plugin-adapter.test.ts # Event adaptation
│   ├── notifiers.test.ts      # Notification dispatch
│   └── tmux-status.test.ts    # tmux format string rendering
│
├── package.json
├── tsconfig.json
├── biome.json
└── README.md
```

---

## Detailed Design

### Core Types (`src/types.ts`)

```typescript
export type OcnStatus = "idle" | "busy" | "prompting" | "error"

export type OcnEvent = {
  source: "plugin" | "sse" | "runbook"
  status: OcnStatus
  directory: string
  project: string
  pid: number
  session_id?: string
  error_message?: string
  permission_title?: string
  timestamp: string
}

export type InstanceState = {
  pid: number
  directory: string
  project: string
  status: OcnStatus
  last_transition: string
  session_id?: string
}
```

### Event Source Abstraction (`src/sources/types.ts`)

```typescript
// Any event source implements this
export type EventSource = {
  name: string
  subscribe: (handler: (event: OcnEvent) => Promise<void>) => () => void  // returns unsubscribe
}
```

### Plugin Adapter (`src/sources/plugin-adapter.ts`)

Maps opencode plugin events to OcnEvents:
- `session.idle` → status: `"idle"`
- `session.status` with status `"busy"` → status: `"busy"`
- `session.error` → status: `"error"`
- `permission.updated` → status: `"prompting"`
- `permission.replied` → status: `"busy"` (back to work)
- Everything else → return `null` (irrelevant)

### Plugin Entry Point (`src/plugin.ts`)

```typescript
import type { Plugin } from "@opencode-ai/plugin"
import { adapt_plugin_event } from "./sources/plugin-adapter"
import { write_state, cleanup_stale } from "./state"
import { create_notifier_hub } from "./notify"
import { load_config } from "./config"

export const OcnPlugin: Plugin = async ({ project, directory, $ }) => {
  const config = load_config()
  const hub = create_notifier_hub(config, $)
  const instance_id = `${process.pid}`
  const project_name = directory.split("/").pop() ?? "unknown"

  // Cleanup stale state files from dead processes on startup
  cleanup_stale()

  // Track current state to detect transitions
  let current_status: OcnStatus = "idle"

  return {
    event: async ({ event }) => {
      const ocn_event = adapt_plugin_event(event, { directory, project_name, pid: process.pid })
      if (!ocn_event) return  // Not a relevant event

      const previous = current_status
      current_status = ocn_event.status

      // Always write state file (for tmux script to read)
      write_state(instance_id, {
        pid: process.pid,
        directory,
        project: project_name,
        status: current_status,
        last_transition: new Date().toISOString(),
        session_id: ocn_event.session_id,
      })

      // Only notify on transitions (not repeated same-state events)
      if (previous !== current_status) {
        await hub.notify(ocn_event)
      }
    }
  }
}
```

### State File System (`src/state.ts`)

```typescript
const STATE_DIR = join(homedir(), ".local", "state", "ocn")

export function write_state(instance_id: string, state: InstanceState): void
export function read_all_states(): InstanceState[]
export function cleanup_stale(): void  // Remove files where PID no longer exists
export function remove_state(instance_id: string): void
```

State directory is created on first write (`mkdirSync` recursive). All functions accept an optional `state_dir` override for testing with temp directories.

### Notifier Interface (`src/notify/types.ts`)

```typescript
export type NotificationEvent = {
  type: "idle" | "prompting" | "error"
  project: string
  directory: string
  message: string
  timestamp: string
}

export type Notifier = {
  name: string
  notify: (event: NotificationEvent) => Promise<void>
}
```

### NotifierHub (`src/notify/index.ts`)

Routes events to enabled notifiers. Handles debounce (configurable, default 2s). Only fires on actionable transitions:
- busy → idle: "Session completed"
- busy → prompting: "Needs input" (high priority)
- any → error: "Session errored"

Does NOT notify on: idle → busy (that's just work starting, not actionable).

### macOS Notifier (`src/notify/macos.ts`)

```bash
osascript -e 'display notification "Session finished" with title "opencode" subtitle "devpad"'
```

### Terminal Bell (`src/notify/bell.ts`)

Writes `\x07` (BEL) or OSC 9 to stdout. Ghostty translates this into a native notification.

### tmux Pane Notifier (`src/notify/tmux.ts`)

Sets a per-pane tmux user option via `tmux set-option -p @ocn_pane_status "IDLE"`. This is the **per-instance** indicator, distinct from the aggregate status bar.

### tmux Status Script (`scripts/ocn-tmux-status`)

A standalone Bun script that:
1. Reads all `~/.local/state/ocn/*.json` files
2. Filters out stale entries (PID not alive)
3. Cleans up stale files as a side effect
4. Counts by status: idle, busy, prompting
5. Renders tmux format string with TokyoNight colors:
   - Green (`#9ece6a`): idle (only shown if there are also busy/prompting)
   - Yellow (`#e0af68`): busy
   - Red (`#f7768e`): prompting (needs attention!)
6. If everything is idle or no instances, outputs empty string (clean status bar)

User adds to tmux.conf:
```
set -g status-right "#(~/.local/bin/ocn-tmux-status)#{?@nvim_status,#{@nvim_status},} ..."
```

Supports `--json` flag for sketchybar and other consumers.

### Configuration (`src/config.ts`)

Config file: `~/.config/opencode/ocn.json` (optional — zero-config works)

```typescript
const ConfigSchema = z.object({
  notify: z.object({
    macos: z.object({
      enabled: z.boolean().default(true),
      on_idle: z.boolean().default(true),
      on_prompt: z.boolean().default(true),
      on_error: z.boolean().default(true),
    }).default({}),
    bell: z.object({
      enabled: z.boolean().default(false),
    }).default({}),
    tmux_pane: z.object({
      enabled: z.boolean().default(true),
    }).default({}),
  }).default({}),
  debounce_ms: z.number().default(2000),
  state_dir: z.string().default("~/.local/state/ocn"),
  theme: z.enum(["tokyonight", "catppuccin", "plain"]).default("tokyonight"),
})
```

---

## Testing Strategy

All tests use in-memory fakes, no mocking:

1. **State file tests** (`__tests__/state.test.ts`): Write/read/cleanup using a temp directory. Verify stale PID detection, concurrent writes, malformed file handling.

2. **Plugin adapter tests** (`__tests__/plugin-adapter.test.ts`): Map raw opencode events → OcnEvent. Verify correct status mapping for each event type. Verify irrelevant events return null.

3. **Notifier tests** (`__tests__/notifiers.test.ts`): FakeNotifier records calls. Verify correct events are dispatched, debounce works, idle→busy doesn't fire.

4. **tmux status rendering tests** (`__tests__/tmux-status.test.ts`): Given a set of InstanceState objects, verify correct tmux format string output. Test all-idle (empty), mixed states, single instance, many instances.

---

## Phased Implementation

### Phase 0: Scaffold (~40 LOC)
**Sequential. Blocks everything.**

- `package.json` with `@opencode-ai/plugin` peer dep, `zod` dep, bun scripts
- `tsconfig.json`
- `biome.json`
- `src/types.ts` — OcnEvent, OcnStatus, InstanceState
- `src/config.ts` — Zod schema + loader

Files: `package.json`, `tsconfig.json`, `biome.json`, `src/types.ts`, `src/config.ts`

### Phase 1: State Layer + Plugin Adapter (~150 LOC, parallel)

**Agent A: State Layer** (~80 LOC)
- `src/state.ts` — write_state, read_all_states, cleanup_stale, remove_state
- `__tests__/state.test.ts` — tests with temp directory

Files: `src/state.ts`, `__tests__/state.test.ts`

**Agent B: Event Source Abstraction + Plugin Adapter** (~70 LOC)
- `src/sources/types.ts` — EventSource interface
- `src/sources/plugin-adapter.ts` — Maps opencode events → OcnEvent
- `__tests__/plugin-adapter.test.ts`

Files: `src/sources/types.ts`, `src/sources/plugin-adapter.ts`, `__tests__/plugin-adapter.test.ts`

### Phase 2: Notification Layer (~120 LOC, parallel)

**Agent A: Notifier types + macOS + bell** (~80 LOC)
- `src/notify/types.ts` — Notifier interface, NotificationEvent type
- `src/notify/macos.ts` — osascript wrapper
- `src/notify/bell.ts` — BEL / OSC 9
- `__tests__/notifiers.test.ts`

Files: `src/notify/types.ts`, `src/notify/macos.ts`, `src/notify/bell.ts`, `__tests__/notifiers.test.ts`

**Agent B: Notifier hub** (~40 LOC)
- `src/notify/index.ts` — Routes events to enabled notifiers, handles debounce

Files: `src/notify/index.ts`

### Phase 3: Plugin Entry Point (~80 LOC)
**Sequential. Depends on Phase 1 + 2.**

- `src/plugin.ts` — Wires adapter → state writer → notifier hub
- `src/util/log.ts` — Simple structured logger

Files: `src/plugin.ts`, `src/util/log.ts`

### Phase 4: tmux Integration (~100 LOC, parallel)

**Agent A: tmux status script** (~60 LOC)
- `scripts/ocn-tmux-status` — Reads state files, renders tmux format string
- `__tests__/tmux-status.test.ts` — Test rendering logic

Files: `scripts/ocn-tmux-status`, `__tests__/tmux-status.test.ts`

**Agent B: tmux pane notifier** (~40 LOC)
- `src/notify/tmux.ts` — Sets per-pane `@ocn_pane_status` option via `tmux set-option -p`

Files: `src/notify/tmux.ts`

### Phase 5: CLI + Distribution (~60 LOC)
**Sequential. Depends on Phase 3 + 4.**

- `scripts/ocn-status` — CLI that reads state files, prints table
- `README.md` — Installation, tmux.conf snippet, configuration
- Update `package.json` with bin entries, npm publish config

Files: `scripts/ocn-status`, `README.md`, `package.json` (update)

### Phase 6: Sketchybar Widget (Stretch, ~60 LOC)
**Sequential. Optional.**

- `scripts/ocn-sketchybar.lua` — Drop-in Lua widget
- `scripts/ocn-tmux-status` update — add `--json` flag

Files: `scripts/ocn-sketchybar.lua`, `scripts/ocn-tmux-status` (update)

---

## Task Summary

| Phase | Tasks | Est. LOC | Parallel? | Dependencies |
|-------|-------|----------|-----------|--------------|
| 0 | Scaffold | 40 | No | None |
| 1 | State + Adapter | 150 | Yes (2) | Phase 0 |
| 2 | Notifiers | 120 | Yes (2) | Phase 0 |
| 3 | Plugin Entry | 80 | No | Phase 1, 2 |
| 4 | tmux Integration | 100 | Yes (2) | Phase 1 |
| 5 | CLI + Docs | 60 | No | Phase 3, 4 |
| 6 | Sketchybar | 60 | No | Phase 4 |
| **Total** | | **~610** | | |

Core (Phases 0-5): ~550 LOC
Stretch (Phase 6): ~60 LOC

---

## Dependencies

```json
{
  "peerDependencies": {
    "@opencode-ai/plugin": ">=1.0.0"
  },
  "dependencies": {
    "zod": "^3.x"
  },
  "devDependencies": {
    "@opencode-ai/plugin": "^1.1.39",
    "@biomejs/biome": "^1.x",
    "@types/bun": "latest",
    "typescript": "^5.x"
  }
}
```

Minimal. No runtime deps beyond zod. Plugin SDK is a peer dep.

---

## Distribution

1. **npm**: `"plugin": ["ocn@latest"]` in opencode.json
2. **tmux script**: Users copy `ocn-tmux-status` to `~/.local/bin/` and add `#(ocn-tmux-status)` to tmux.conf
3. **Sketchybar**: Users copy `ocn-sketchybar.lua` to their sketchybar items directory

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| opencode crashes | State file becomes stale. `cleanup_stale()` checks PID on next plugin startup. tmux script also checks PIDs on every render. |
| Rapid state flapping | Debounce: only notify after 2s of sustained state |
| Multiple sessions in one instance | Track by session_id in state file. Plugin updates on each transition. |
| Plugin loaded but no events fire | State file not created until first relevant event |
| State dir doesn't exist | Created on first write (`mkdirSync` recursive) |
| tmux not running | macOS notifier still works. tmux script silently does nothing. Per-pane notifier catches error and no-ops. |
| Stale files accumulate | `cleanup_stale()` on plugin startup + tmux script filters by live PID |
| Malformed state file | `read_all_states()` skips files that fail JSON parse |

---

## Future Event Sources (Designed For, Not Built Yet)

1. **SSE adapter** (`src/sources/sse-adapter.ts`): Connects to `opencode serve` instances, subscribes to SSE `/event`, writes to same state files. Runs as a standalone daemon process.
2. **Runbook adapter** (`src/sources/runbook-adapter.ts`): Listens to `@f0rbit/runbook` workflow events, writes state files for active workflow steps.
3. **Claude CLI adapter**: Could monitor Claude Code sessions similarly.

All adapters write to the same `~/.local/state/ocn/` directory. The tmux status script and sketchybar widget don't care where the data came from.

---

## Suggested AGENTS.md Updates

```markdown
## ocn Architecture
- Hooks-first: plugin event hook is the primary event source, NOT SSE
- File-based coordination: ~/.local/state/ocn/<pid>.json, no daemon needed
- Event source abstracted: plugin-adapter.ts today, sse-adapter.ts later
- All notification consumers read state files — they don't care about the source

## OpenCode Plugin System
- Plugin exports async fn receiving { project, client, $, directory, worktree, serverUrl }
- Returns hooks object: { event: async ({ event }) => void }
- event hook receives ALL bus events (session.idle, session.error, permission.updated, etc.)
- Plugin runs in-process with each opencode instance
- @opencode-ai/plugin is the type package (peer dep)

## Tom's tmux integration pattern
- Uses tmux user options (@nvim_status, @ocn_status) referenced in status-right
- TokyoNight palette: bg=#1a1b26, green=#9ece6a, yellow=#e0af68, red=#f7768e, purple=#9d7cd8, cyan=#7dcfff
- Pattern: tmux set-option -g @option_name "formatted_string_with_color_codes"
- Conditional display: #{?@option,#{@option},} in format strings (shows nothing when unset)
- Per-pane options: tmux set-option -p @option "value"
```

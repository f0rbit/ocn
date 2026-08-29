# OCN

OCN provides terminal-native notifications and status for OpenCode sessions.

Commands: `bun test`, `bun run typecheck`, and `bunx --bidi biome check .` (read-only; the `check` npm script uses `--write`, so do not use it for verification).

## OpenCode2 contract

`opencode2 0.0.0-beta-18684` and `@opencode-ai/plugin 0.0.0-beta-18684` must be upgraded as a pair. The entrypoint is the root `Plugin.define({ id, setup })` export from `@opencode-ai/plugin`; the documented `@opencode-ai/plugin/v2/promise` subpath does not exist in this beta. `setup` may return a Cleanup function.

`ctx.event.subscribe()` yields the whole server stream as `AsyncIterable<V2Event>` with a `type` discriminant, `data` payload, and optional `location`. OCN accepts events with undefined location, the configured directory, the project canonical directory, or a canonical-directory prefix. The entrypoint is the root `Plugin.define` default export. State transitions are tracked per session; deletion removes that session's record, and setup cleanup removes records owned by its directory.

## State

State identity is `~/.local/state/ocn/<sha256(canonicalDir\0sessionID)[0:32]>.json`, keyed by session. `pid` is the owning service PID and is only a liveness fallback. Idle records expire using `idle_ttl_ms` (30 minutes by default) and resurrect on the session's next event.

`StateRepository` and `InMemoryStateRepository` are defined in `src/state-repository.ts`; the filesystem implementation is in `src/state.ts`. Contract tests cover both.

Style: tabs, snake_case, `import type`, and no `any`.

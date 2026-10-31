# OCN

OCN provides terminal-native notifications and status for OpenCode sessions.

Commands: `bun run gate` (full local verification, fail-fast), `bun run check` (read-only contract suite), `bun run smoke`, `bun run lint`, `bun run lint:fix`, `bun test`, and `bun run typecheck`. `deploy` and `ship` are N/A for this local package; PRs ship through the repository's normal flow.

## OpenCode V2 contract

`opencode` 2.2.5 and `@opencode/plugin` 2.2.5 must be upgraded as a pair. The package is a directory plugin: its root export is the default `Plugin.define({ id, setup })` export from `@opencode/plugin`, and `setup` may return a Cleanup function. Configured local plugin paths must name the package directory, not `src/plugin.ts`.

`ctx.event.subscribe()` yields the whole server stream as `AsyncIterable<V2Event>` with a `type` discriminant, `data` payload, and optional `location`. OCN consumes `session.created`/`session.deleted`, `session.status`/`session.idle`, `session.execution.*`/`session.retry.scheduled`, `permission.asked`/`replied` and `form.created`/`replied`/`cancelled` events. Unknown types parse to null and are ignored; the `_drift` assignments in `src/sources/v2-event.ts` make `tsc` fail if a consumed event's shape diverges from `@opencode/plugin`. Child sessions are detected through `session.created.data.parentID`. OCN accepts events with undefined location, the configured directory, the project canonical directory, or a canonical-directory prefix. State transitions are tracked per session; deletion removes that session's record, and setup cleanup removes records owned by its directory.

## State

State identity is `~/.local/state/ocn/<sha256(canonicalDir\0sessionID)[0:32]>.json`, keyed by session. `pid` is the owning service PID and is only a liveness fallback for orphaned records after a service restart. Subagent (child) sessions never create records or notifications; only top-level sessions count as agents. State expiry is per class: terminal statuses (`idle`/`error`) expire after `idle_ttl_ms` (30 minutes by default), while active statuses (`busy`/`prompting`) expire after `stale_ttl_ms` (24 hours by default). State files are a derived cache and safe to clear wholesale; they regenerate from live events, and sessions resurrect on their next event.

`StateRepository` and `InMemoryStateRepository` are defined in `src/state-repository.ts`; the filesystem implementation is in `src/state.ts`. Contract tests cover both.

Style: tabs, snake_case, `import type`, and no `any`.

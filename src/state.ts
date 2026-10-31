import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { StateRepository } from "./state-repository";
import { InstanceStateSchema } from "./types";
import type { InstanceState } from "./types";

const DEFAULT_STATE_DIR = join(homedir(), ".local", "state", "ocn");
const DEFAULT_IDLE_TTL_MS = 1_800_000;
const DEFAULT_STALE_TTL_MS = 86_400_000;

export function derive_state_key(directory: string, session_id: string): string {
	return createHash("sha256").update(`${directory}\u0000${session_id}`).digest("hex").slice(0, 32);
}

export function create_file_state_repository(state_dir?: string): StateRepository {
	const dir = state_dir ?? DEFAULT_STATE_DIR;

	return {
		save(state: InstanceState): void {
			mkdirSync(dir, { recursive: true });
			writeFileSync(join(dir, `${state.id}.json`), JSON.stringify(state, null, 2));
		},

		list(): InstanceState[] {
			if (!existsSync(dir)) return [];

			return readdirSync(dir)
				.filter((file) => file.endsWith(".json"))
				.flatMap((file) => parse_state_file(join(dir, file)));
		},

		remove(id: string): void {
			remove_file(join(dir, `${id}.json`));
		},

		remove_by_directory(directory: string): void {
			for (const state of this.list()) {
				if (state.directory === directory) remove_file(join(dir, `${state.id}.json`));
			}
		},
	};
}

function parse_state_file(file_path: string): InstanceState[] {
	try {
		const raw = readFileSync(file_path, "utf-8");
		const parsed = InstanceStateSchema.safeParse(JSON.parse(raw));
		return parsed.success ? [parsed.data] : [];
	} catch {
		return [];
	}
}

function remove_file(file_path: string): void {
	try {
		unlinkSync(file_path);
	} catch {
		return;
	}
}

export function write_state(state: InstanceState, state_dir?: string): void {
	create_file_state_repository(state_dir).save(state);
}

export function read_all_states(state_dir?: string): InstanceState[] {
	return create_file_state_repository(state_dir).list();
}

export function remove_state(id: string, state_dir?: string): void {
	create_file_state_repository(state_dir).remove(id);
}

export function remove_state_by_directory(directory: string, state_dir?: string): void {
	create_file_state_repository(state_dir).remove_by_directory(directory);
}

export function is_expired(
	state: InstanceState,
	now_ms: number,
	ttls: { idle_ttl_ms: number; stale_ttl_ms: number },
): boolean {
	const updated_at = Date.parse(state.updated_at);
	if (!Number.isFinite(updated_at)) return true;

	const ttl = state.status === "idle" || state.status === "error" ? ttls.idle_ttl_ms : ttls.stale_ttl_ms;
	return now_ms - updated_at > ttl;
}

export function cleanup_stale(
	state_dir?: string,
	opts: { now?: number; idle_ttl_ms?: number; stale_ttl_ms?: number } = {},
): void {
	const dir = state_dir ?? DEFAULT_STATE_DIR;
	if (!existsSync(dir)) return;

	const now = opts.now ?? Date.now();
	const idle_ttl_ms = opts.idle_ttl_ms ?? DEFAULT_IDLE_TTL_MS;
	const stale_ttl_ms = opts.stale_ttl_ms ?? DEFAULT_STALE_TTL_MS;

	for (const file of readdirSync(dir).filter((entry) => entry.endsWith(".json"))) {
		const file_path = join(dir, file);
		const states = parse_state_file(file_path);
		const state = states[0];
		if (!state || !is_pid_alive(state.pid) || is_expired(state, now, { idle_ttl_ms, stale_ttl_ms })) {
			remove_file(file_path);
		}
	}
}

function is_pid_alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

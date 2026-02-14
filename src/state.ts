import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { InstanceState } from "./types";

const DEFAULT_STATE_DIR = join(homedir(), ".local", "state", "ocn");

export function write_state(instance_id: string, state: InstanceState, state_dir?: string): void {
	const dir = state_dir ?? DEFAULT_STATE_DIR;
	mkdirSync(dir, { recursive: true });
	const file_path = join(dir, `${instance_id}.json`);
	writeFileSync(file_path, JSON.stringify(state, null, 2));
}

export function read_all_states(state_dir?: string): InstanceState[] {
	const dir = state_dir ?? DEFAULT_STATE_DIR;
	if (!existsSync(dir)) return [];

	const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
	const states: InstanceState[] = [];

	for (const file of files) {
		try {
			const raw = readFileSync(join(dir, file), "utf-8");
			const parsed = JSON.parse(raw);
			states.push(parsed as InstanceState);
		} catch {
			// Skip malformed files
		}
	}
	return states;
}

export function cleanup_stale(state_dir?: string): void {
	const dir = state_dir ?? DEFAULT_STATE_DIR;
	if (!existsSync(dir)) return;

	const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

	for (const file of files) {
		const file_path = join(dir, file);
		try {
			const raw = readFileSync(file_path, "utf-8");
			const state = JSON.parse(raw) as InstanceState;
			if (!is_pid_alive(state.pid)) {
				unlinkSync(file_path);
			}
		} catch {
			// Remove unparseable files
			try {
				unlinkSync(file_path);
			} catch {}
		}
	}
}

export function remove_state(instance_id: string, state_dir?: string): void {
	const dir = state_dir ?? DEFAULT_STATE_DIR;
	const file_path = join(dir, `${instance_id}.json`);
	try {
		unlinkSync(file_path);
	} catch {
		// File may already be removed
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

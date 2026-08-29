import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanup_stale, derive_state_key, is_expired, read_all_states, remove_state, write_state } from "../src/state";
import type { InstanceState } from "../src/types";

describe("state", () => {
	let tmp_dir: string;

	beforeEach(() => {
		tmp_dir = mkdtempSync(join(tmpdir(), "ocn-test-"));
	});

	afterEach(() => {
		rmSync(tmp_dir, { recursive: true, force: true });
	});

	const make_state = (overrides: Partial<InstanceState> = {}): InstanceState => {
		const state = {
			pid: process.pid,
			directory: "/Users/tom/dev/test",
			project: "test",
			status: "idle" as const,
			session_id: "ses_test",
			last_transition: "2026-08-29T12:00:00.000Z",
			updated_at: "2026-08-29T12:00:00.000Z",
			...overrides,
		};
		return {
			...state,
			id: overrides.id ?? derive_state_key(state.directory, state.session_id),
		};
	};

	describe("write_state + read_all_states", () => {
		it("writes and reads a single state file", () => {
			const state = make_state();
			write_state(state, tmp_dir);
			const states = read_all_states(tmp_dir);
			expect(states).toEqual([state]);
			expect(states[0].id).toBe(state.id);
			expect(states[0].session_id).toBe(state.session_id);
			expect(states[0].updated_at).toBe(state.updated_at);
		});

		it("keeps sessions sharing one PID as distinct records", () => {
			write_state(make_state({ session_id: "ses_one" }), tmp_dir);
			write_state(make_state({ session_id: "ses_two" }), tmp_dir);

			const states = read_all_states(tmp_dir);
			expect(states).toHaveLength(2);
			expect(states.map((state) => state.session_id).sort()).toEqual(["ses_one", "ses_two"]);
			expect(states[0].pid).toBe(states[1].pid);
		});

		it("keeps locations with the same project basename distinct", () => {
			write_state(make_state({ directory: "/a/test" }), tmp_dir);
			write_state(make_state({ directory: "/b/test" }), tmp_dir);

			const states = read_all_states(tmp_dir);
			expect(states).toHaveLength(2);
			expect(states.map((state) => state.project)).toEqual(["test", "test"]);
			expect(new Set(states.map((state) => state.id)).size).toBe(2);
		});

		it("returns an empty array for a non-existent directory", () => {
			expect(read_all_states(join(tmp_dir, "nope"))).toEqual([]);
		});

		it("overwrites an existing state file", () => {
			const state = make_state();
			write_state(state, tmp_dir);
			write_state({ ...state, status: "busy" }, tmp_dir);

			expect(read_all_states(tmp_dir)).toEqual([{ ...state, status: "busy" }]);
		});
	});

	describe("derive_state_key", () => {
		it("is stable for one directory and session", () => {
			const key = derive_state_key("/project", "ses_1");
			expect(key).toBe(derive_state_key("/project", "ses_1"));
			expect(key).toHaveLength(32);
		});

		it("differs by directory and session", () => {
			const key = derive_state_key("/project", "ses_1");
			expect(key).not.toBe(derive_state_key("/other", "ses_1"));
			expect(key).not.toBe(derive_state_key("/project", "ses_2"));
		});
	});

	describe("is_expired", () => {
		const now = Date.parse("2026-08-29T12:00:00.000Z");
		const old = "2026-08-29T11:00:00.000Z";

		it("expires old idle records and not other statuses", () => {
			expect(is_expired(make_state({ updated_at: old }), now, 1_000)).toBe(true);
			expect(is_expired(make_state({ status: "busy", updated_at: old }), now, 1_000)).toBe(false);
			expect(is_expired(make_state({ status: "prompting", updated_at: old }), now, 1_000)).toBe(false);
			expect(is_expired(make_state({ status: "error", updated_at: old }), now, 1_000)).toBe(false);
		});

		it("keeps fresh idle records and expires invalid timestamps", () => {
			expect(is_expired(make_state({ updated_at: "2026-08-29T11:59:59.999Z" }), now, 1_000)).toBe(false);
			expect(is_expired(make_state({ updated_at: "garbage" }), now, 1_000)).toBe(true);
		});
	});

	describe("cleanup_stale", () => {
		it("removes expired, dead, and malformed files while keeping live records", () => {
			const now = Date.parse("2026-08-29T12:00:00.000Z");
			write_state(make_state({ session_id: "expired", updated_at: "2026-08-29T11:00:00.000Z" }), tmp_dir);
			write_state(make_state({ session_id: "dead", pid: 999999, updated_at: "2026-08-29T11:00:00.000Z" }), tmp_dir);
			write_state(make_state({ session_id: "fresh", updated_at: "2026-08-29T11:59:59.999Z" }), tmp_dir);
			write_state(make_state({ session_id: "busy", status: "busy", updated_at: "2020-01-01T00:00:00.000Z" }), tmp_dir);
			writeFileSync(join(tmp_dir, "bad.json"), "not json");

			cleanup_stale(tmp_dir, { now, idle_ttl_ms: 1_000 });

			expect(
				read_all_states(tmp_dir)
					.map((state) => state.session_id)
					.sort(),
			).toEqual(["busy", "fresh"]);
		});

		it("handles a non-existent directory gracefully", () => {
			expect(() => cleanup_stale(join(tmp_dir, "nope"))).not.toThrow();
		});

		it("resurrects an expired session when it is written again", () => {
			const state = make_state({ updated_at: "2026-08-29T11:00:00.000Z" });
			write_state(state, tmp_dir);
			cleanup_stale(tmp_dir, {
				now: Date.parse("2026-08-29T12:00:00.000Z"),
				idle_ttl_ms: 1_000,
			});
			expect(read_all_states(tmp_dir)).toEqual([]);

			write_state({ ...state, updated_at: "2026-08-29T12:00:00.000Z" }, tmp_dir);
			expect(read_all_states(tmp_dir)).toHaveLength(1);
		});
	});

	describe("remove_state", () => {
		it("removes a specific state file", () => {
			const state = make_state();
			write_state(state, tmp_dir);
			remove_state(state.id, tmp_dir);
			expect(read_all_states(tmp_dir)).toEqual([]);
		});

		it("handles removing a non-existent file", () => {
			expect(() => remove_state("nope", tmp_dir)).not.toThrow();
		});
	});

	describe("malformed files", () => {
		it("skips malformed JSON files", () => {
			write_state(make_state(), tmp_dir);
			writeFileSync(join(tmp_dir, "bad.json"), "not json {{{");
			expect(read_all_states(tmp_dir)).toHaveLength(1);
		});
	});
});

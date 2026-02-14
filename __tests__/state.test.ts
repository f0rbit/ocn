import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanup_stale, read_all_states, remove_state, write_state } from "../src/state";
import type { InstanceState } from "../src/types";

describe("state", () => {
	let tmp_dir: string;

	beforeEach(() => {
		tmp_dir = mkdtempSync(join(tmpdir(), "ocn-test-"));
	});

	afterEach(() => {
		rmSync(tmp_dir, { recursive: true, force: true });
	});

	const make_state = (overrides?: Partial<InstanceState>): InstanceState => ({
		pid: process.pid,
		directory: "/Users/tom/dev/test",
		project: "test",
		status: "idle",
		last_transition: new Date().toISOString(),
		...overrides,
	});

	describe("write_state + read_all_states", () => {
		it("writes and reads a single state file", () => {
			const state = make_state();
			write_state("123", state, tmp_dir);
			const states = read_all_states(tmp_dir);
			expect(states).toHaveLength(1);
			expect(states[0]).toEqual(state);
		});

		it("reads multiple state files", () => {
			write_state("1", make_state({ project: "a" }), tmp_dir);
			write_state("2", make_state({ project: "b" }), tmp_dir);
			write_state("3", make_state({ project: "c" }), tmp_dir);
			const states = read_all_states(tmp_dir);
			expect(states).toHaveLength(3);
			const projects = states.map((s) => s.project).sort();
			expect(projects).toEqual(["a", "b", "c"]);
		});

		it("returns empty array for non-existent directory", () => {
			const states = read_all_states(join(tmp_dir, "nope"));
			expect(states).toEqual([]);
		});

		it("overwrites existing state file", () => {
			write_state("123", make_state({ status: "busy" }), tmp_dir);
			write_state("123", make_state({ status: "idle" }), tmp_dir);
			const states = read_all_states(tmp_dir);
			expect(states).toHaveLength(1);
			expect(states[0].status).toBe("idle");
		});
	});

	describe("cleanup_stale", () => {
		it("removes state files with dead PIDs", () => {
			write_state("dead", make_state({ pid: 999999 }), tmp_dir);
			write_state("alive", make_state({ pid: process.pid }), tmp_dir);
			cleanup_stale(tmp_dir);
			const states = read_all_states(tmp_dir);
			expect(states).toHaveLength(1);
			expect(states[0].pid).toBe(process.pid);
		});

		it("handles non-existent directory gracefully", () => {
			cleanup_stale(join(tmp_dir, "nope"));
			// No throw
		});
	});

	describe("remove_state", () => {
		it("removes a specific state file", () => {
			write_state("123", make_state(), tmp_dir);
			expect(read_all_states(tmp_dir)).toHaveLength(1);
			remove_state("123", tmp_dir);
			expect(read_all_states(tmp_dir)).toHaveLength(0);
		});

		it("handles removing non-existent file", () => {
			remove_state("nope", tmp_dir);
			// No throw
		});
	});

	describe("malformed files", () => {
		it("skips malformed JSON files", () => {
			write_state("good", make_state(), tmp_dir);
			writeFileSync(join(tmp_dir, "bad.json"), "not json {{{");
			const states = read_all_states(tmp_dir);
			expect(states).toHaveLength(1);
		});
	});
});

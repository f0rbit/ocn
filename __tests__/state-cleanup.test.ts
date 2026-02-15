import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { read_all_states, remove_state, write_state } from "../src/state";

const TEST_STATE_DIR = join(import.meta.dir, ".test-state-cleanup");

beforeEach(() => {
	mkdirSync(TEST_STATE_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_STATE_DIR, { recursive: true, force: true });
});

describe("remove_state", () => {
	it("removes an existing state file", () => {
		write_state(
			"1234",
			{
				pid: 1234,
				directory: "/test",
				project: "test",
				status: "busy",
				last_transition: new Date().toISOString(),
			},
			TEST_STATE_DIR,
		);

		expect(existsSync(join(TEST_STATE_DIR, "1234.json"))).toBe(true);

		remove_state("1234", TEST_STATE_DIR);

		expect(existsSync(join(TEST_STATE_DIR, "1234.json"))).toBe(false);
	});

	it("does not throw when state file does not exist", () => {
		expect(() => remove_state("9999", TEST_STATE_DIR)).not.toThrow();
	});

	it("only removes the targeted instance, leaving others intact", () => {
		write_state(
			"1111",
			{
				pid: 1111,
				directory: "/a",
				project: "a",
				status: "busy",
				last_transition: new Date().toISOString(),
			},
			TEST_STATE_DIR,
		);

		write_state(
			"2222",
			{
				pid: 2222,
				directory: "/b",
				project: "b",
				status: "idle",
				last_transition: new Date().toISOString(),
			},
			TEST_STATE_DIR,
		);

		remove_state("1111", TEST_STATE_DIR);

		const remaining = read_all_states(TEST_STATE_DIR);
		expect(remaining).toHaveLength(1);
		expect(remaining[0].pid).toBe(2222);
	});
});

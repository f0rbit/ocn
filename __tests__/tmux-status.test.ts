import { describe, expect, it } from "bun:test";
import { count_statuses, render_json_status, render_tmux_status } from "../src/tmux-status";
import type { InstanceState } from "../src/types";

const make_state = (status: InstanceState["status"], project = "test"): InstanceState => ({
	pid: 1234,
	directory: `/Users/tom/dev/${project}`,
	project,
	status,
	last_transition: new Date().toISOString(),
});

describe("count_statuses", () => {
	it("counts empty array", () => {
		expect(count_statuses([])).toEqual({ idle: 0, busy: 0, prompting: 0, error: 0 });
	});

	it("counts mixed states", () => {
		const states = [make_state("idle"), make_state("busy"), make_state("busy"), make_state("prompting")];
		expect(count_statuses(states)).toEqual({ idle: 1, busy: 2, prompting: 1, error: 0 });
	});
});

describe("render_tmux_status", () => {
	it("returns empty string for no instances", () => {
		expect(render_tmux_status([])).toBe("");
	});

	it("returns empty string when all idle", () => {
		const states = [make_state("idle"), make_state("idle")];
		expect(render_tmux_status(states)).toBe("");
	});

	it("shows busy count", () => {
		const states = [make_state("busy"), make_state("busy")];
		const result = render_tmux_status(states);
		expect(result).toContain("2~");
		expect(result).toContain("#e0af68");
		expect(result).toContain("ocn:");
	});

	it("shows prompting with attention marker", () => {
		const states = [make_state("prompting")];
		const result = render_tmux_status(states);
		expect(result).toContain("1!");
		expect(result).toContain("#f7768e");
	});

	it("shows mixed state with all segments", () => {
		const states = [make_state("idle"), make_state("busy"), make_state("prompting")];
		const result = render_tmux_status(states);
		expect(result).toContain("1!");
		expect(result).toContain("1~");
		expect(result).toContain("1✓");
	});

	it("combines prompting and error for attention count", () => {
		const states = [make_state("prompting"), make_state("error")];
		const result = render_tmux_status(states);
		expect(result).toContain("2!");
	});

	it("uses catppuccin theme colors", () => {
		const states = [make_state("busy")];
		const result = render_tmux_status(states, "catppuccin");
		expect(result).toContain("#f9e2af");
	});

	it("falls back to tokyonight for unknown theme", () => {
		const states = [make_state("busy")];
		const result = render_tmux_status(states, "unknown");
		expect(result).toContain("#e0af68");
	});
});

describe("render_json_status", () => {
	it("returns valid JSON with counts", () => {
		const states = [make_state("idle"), make_state("busy")];
		const result = JSON.parse(render_json_status(states));
		expect(result.total).toBe(2);
		expect(result.idle).toBe(1);
		expect(result.busy).toBe(1);
		expect(result.instances).toHaveLength(2);
	});

	it("includes instance details", () => {
		const states = [make_state("busy", "devpad")];
		const result = JSON.parse(render_json_status(states));
		expect(result.instances[0].project).toBe("devpad");
		expect(result.instances[0].status).toBe("busy");
	});
});

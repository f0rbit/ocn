import { describe, expect, it } from "bun:test";
import { probe_registration, strip_jsonc_comments } from "../src/doctor";
import { render_json_status } from "../src/tmux-status";
import type { InstanceState } from "../src/types";

const state: InstanceState = {
	id: "contract-state",
	pid: 1234,
	directory: "/Users/tom/dev/contract",
	project: "contract",
	status: "busy",
	session_id: "contract-session",
	last_transition: "2026-01-01T00:00:00.000Z",
	updated_at: "2026-01-01T00:00:00.000Z",
};

describe("CLI JSON contract", () => {
	it("keeps all consumer fields and instance details", () => {
		const result = JSON.parse(render_json_status([state]));

		expect(typeof result.version).toBe("string");
		expect(Object.keys(result)[0]).toBe("version");
		for (const key of ["total", "idle", "busy", "prompting", "error"]) {
			expect(result).toHaveProperty(key);
		}
		expect(result.instances).toEqual([{ project: "contract", status: "busy", pid: 1234 }]);
	});

	it("renders a valid empty-state contract", () => {
		const result = JSON.parse(render_json_status([]));

		expect(result.total).toBe(0);
		expect(result.instances).toEqual([]);
	});
});

describe("JSONC registration probe", () => {
	it("ignores comments outside strings", () => {
		const input = `{
			// plugin registration
			"plugins": ["/Users/tom/dev/ocn"],
			"url": "https://example.test/a//b", /* trailing comment */
		}`;

		expect(probe_registration(input)).toBe("registered");
		expect(strip_jsonc_comments(input)).toContain("https://example.test/a//b");
	});
});

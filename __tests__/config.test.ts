import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { ConfigSchema } from "../src/config";

describe("ConfigSchema defaults", () => {
	it("returns expected defaults from empty object", () => {
		const config = ConfigSchema.parse({});

		expect(config.debounce_ms).toBe(2000);
		expect(config.theme).toBe("tokyonight");
		expect(config.state_dir).toBe(join(homedir(), ".local", "state", "ocn"));

		expect(config.notify.macos.enabled).toBe(true);
		expect(config.notify.macos.on_idle).toBe(true);
		expect(config.notify.macos.on_prompt).toBe(true);
		expect(config.notify.macos.on_error).toBe(true);

		expect(config.notify.bell.enabled).toBe(false);
		expect(config.notify.tmux_pane.enabled).toBe(true);
	});
});

describe("ConfigSchema partial merge", () => {
	it("partial macos config preserves other defaults", () => {
		const config = ConfigSchema.parse({
			notify: { macos: { on_idle: false } },
		});

		expect(config.notify.macos.on_idle).toBe(false);
		expect(config.notify.macos.enabled).toBe(true);
		expect(config.notify.macos.on_prompt).toBe(true);
		expect(config.notify.macos.on_error).toBe(true);

		expect(config.debounce_ms).toBe(2000);
		expect(config.notify.bell.enabled).toBe(false);
		expect(config.notify.tmux_pane.enabled).toBe(true);
	});

	it("partial top-level overrides merge with defaults", () => {
		const config = ConfigSchema.parse({
			debounce_ms: 5000,
			theme: "catppuccin",
		});

		expect(config.debounce_ms).toBe(5000);
		expect(config.theme).toBe("catppuccin");
		expect(config.notify.macos.enabled).toBe(true);
		expect(config.notify.bell.enabled).toBe(false);
	});

	it("partial bell config preserves other notify defaults", () => {
		const config = ConfigSchema.parse({
			notify: { bell: { enabled: true } },
		});

		expect(config.notify.bell.enabled).toBe(true);
		expect(config.notify.macos.enabled).toBe(true);
		expect(config.notify.tmux_pane.enabled).toBe(true);
	});
});

describe("ConfigSchema validation", () => {
	it("rejects invalid debounce_ms type", () => {
		expect(() => ConfigSchema.parse({ debounce_ms: "fast" })).toThrow();
	});

	it("rejects invalid theme value", () => {
		expect(() => ConfigSchema.parse({ theme: "gruvbox" })).toThrow();
	});

	it("rejects invalid boolean for macos.enabled", () => {
		expect(() =>
			ConfigSchema.parse({
				notify: { macos: { enabled: "yes" } },
			}),
		).toThrow();
	});

	it("accepts all valid theme values", () => {
		for (const theme of ["tokyonight", "catppuccin", "plain"] as const) {
			const config = ConfigSchema.parse({ theme });
			expect(config.theme).toBe(theme);
		}
	});
});

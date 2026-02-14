import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const MacosNotifySchema = z.object({
	enabled: z.boolean().default(true),
	on_idle: z.boolean().default(true),
	on_prompt: z.boolean().default(true),
	on_error: z.boolean().default(true),
});

const BellNotifySchema = z.object({
	enabled: z.boolean().default(false),
});

const TmuxPaneNotifySchema = z.object({
	enabled: z.boolean().default(true),
});

const NotifySchema = z.object({
	macos: MacosNotifySchema.default({}),
	bell: BellNotifySchema.default({}),
	tmux_pane: TmuxPaneNotifySchema.default({}),
});

export const ConfigSchema = z.object({
	notify: NotifySchema.default({}),
	debounce_ms: z.number().default(2000),
	state_dir: z.string().default(join(homedir(), ".local", "state", "ocn")),
	theme: z.enum(["tokyonight", "catppuccin", "plain"]).default("tokyonight"),
});

export type OcnConfig = z.infer<typeof ConfigSchema>;

const CONFIG_PATH = join(homedir(), ".config", "opencode", "ocn.json");

export function load_config(config_path?: string): OcnConfig {
	const path = config_path ?? CONFIG_PATH;
	if (!existsSync(path)) {
		return ConfigSchema.parse({});
	}
	try {
		const raw = JSON.parse(readFileSync(path, "utf-8"));
		return ConfigSchema.parse(raw);
	} catch {
		return ConfigSchema.parse({});
	}
}

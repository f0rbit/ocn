import type { NotificationEvent, Notifier } from "./types";

export type ShellFn = (strings: TemplateStringsArray, ...values: unknown[]) => { quiet: () => Promise<unknown> };

export function create_macos_notifier($?: ShellFn): Notifier {
	return {
		name: "macos",
		notify: async (event: NotificationEvent) => {
			const title = "opencode";
			const subtitle = event.project;
			const message = event.message;

			const script = `display notification "${escape_applescript(message)}" with title "${escape_applescript(title)}" subtitle "${escape_applescript(subtitle)}"`;

			try {
				if ($) {
					await $`osascript -e ${script}`.quiet();
				} else {
					const proc = Bun.spawn(["osascript", "-e", script], {
						stdout: "ignore",
						stderr: "ignore",
					});
					await proc.exited;
				}
			} catch {
				// Silently fail — notifications are best-effort
			}
		},
	};
}

function escape_applescript(str: string): string {
	return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

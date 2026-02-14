import type { NotificationEvent, Notifier } from "./types";

export function create_bell_notifier(): Notifier {
	return {
		name: "bell",
		notify: async (_event: NotificationEvent) => {
			try {
				process.stdout.write("\x07");
			} catch {
				// Silently fail if stdout is not writable
			}
		},
	};
}

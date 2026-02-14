import type { NotificationEvent, Notifier } from "./types";

type StatusLabel = {
	text: string;
	color: string;
};

const STATUS_LABELS: Record<NotificationEvent["type"], StatusLabel> = {
	idle: { text: "IDLE", color: "#9ece6a" },
	prompting: { text: "WAIT", color: "#f7768e" },
	error: { text: "ERR", color: "#f7768e" },
};

export function create_tmux_pane_notifier(): Notifier {
	return {
		name: "tmux_pane",
		notify: async (event: NotificationEvent) => {
			const label = STATUS_LABELS[event.type];
			const bg = "#1a1b26";
			const formatted = `#[fg=${bg},bg=${label.color},bold] ${label.text} #[fg=${label.color},bg=${bg}]`;

			try {
				const proc = Bun.spawn(["tmux", "set-option", "-p", "@ocn_pane_status", formatted], {
					stdout: "ignore",
					stderr: "ignore",
				});
				await proc.exited;
			} catch {
				// Silently fail — tmux may not be running
			}
		},
	};
}

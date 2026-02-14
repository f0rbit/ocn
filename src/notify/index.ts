import type { OcnConfig } from "../config";
import type { OcnEvent } from "../types";
import { create_bell_notifier } from "./bell";
import type { ShellFn } from "./macos";
import { create_macos_notifier } from "./macos";
import { create_tmux_pane_notifier } from "./tmux";
import type { NotificationEvent, Notifier } from "./types";

export type NotifierHub = {
	notify: (event: OcnEvent) => Promise<void>;
};

export function create_notifier_hub(config: OcnConfig, $?: ShellFn, injected_notifiers?: Notifier[]): NotifierHub {
	const notifiers: Notifier[] = injected_notifiers ?? [];

	if (!injected_notifiers) {
		if (config.notify.macos.enabled) {
			notifiers.push(create_macos_notifier($));
		}
		if (config.notify.bell.enabled) {
			notifiers.push(create_bell_notifier());
		}
		if (config.notify.tmux_pane.enabled) {
			notifiers.push(create_tmux_pane_notifier());
		}
	}

	let last_notify_time = 0;

	return {
		notify: async (event: OcnEvent) => {
			if (event.status === "busy") return;
			if (event.is_subtask) return;

			const notification = to_notification_event(event, config);
			if (!notification) return;

			const now = Date.now();
			if (now - last_notify_time < config.debounce_ms) return;
			last_notify_time = now;

			await Promise.allSettled(notifiers.map((n) => n.notify(notification)));
		},
	};
}

function to_notification_event(event: OcnEvent, config: OcnConfig): NotificationEvent | null {
	switch (event.status) {
		case "idle":
			if (!config.notify.macos.on_idle) return null;
			return {
				type: "idle",
				project: event.project,
				directory: event.directory,
				message: "Session completed",
				timestamp: event.timestamp,
			};
		case "prompting":
			if (!config.notify.macos.on_prompt) return null;
			return {
				type: "prompting",
				project: event.project,
				directory: event.directory,
				message: event.permission_title ? `Needs input: ${event.permission_title}` : "Needs input",
				timestamp: event.timestamp,
			};
		case "error":
			if (!config.notify.macos.on_error) return null;
			return {
				type: "error",
				project: event.project,
				directory: event.directory,
				message: event.error_message ? `Session errored: ${event.error_message}` : "Session errored",
				timestamp: event.timestamp,
			};
		default:
			return null;
	}
}

import type { Plugin } from "@opencode-ai/plugin";
import { load_config } from "./config";
import { create_notifier_hub } from "./notify";
import type { ShellFn } from "./notify/macos";
import { create_plugin_adapter } from "./sources/plugin-adapter";
import { cleanup_stale, remove_state, write_state } from "./state";
import type { OcnStatus } from "./types";
import { create_logger } from "./util/log";

export const OcnPlugin: Plugin = async ({ directory, $ }) => {
	const config = load_config();
	const log = create_logger();
	const hub = create_notifier_hub(config, $ as unknown as ShellFn);
	const adapter = create_plugin_adapter();
	const instance_id = `${process.pid}`;
	const project_name = directory.split("/").pop() ?? "unknown";

	cleanup_stale(config.state_dir);

	process.on("exit", () => {
		remove_state(instance_id, config.state_dir);
	});

	log.info("initialized", { project: project_name, instance_id });

	let current_status: OcnStatus = "idle";

	return {
		event: async ({ event }) => {
			const typed = event as { type: string; properties: Record<string, unknown> };

			if (typed.type === "server.instance.disposed") {
				remove_state(instance_id, config.state_dir);
				log.info("disposed, removed state file");
				return;
			}

			const ocn_event = adapter.adapt(typed, {
				directory,
				project_name,
				pid: process.pid,
			});
			if (!ocn_event) return;

			const previous = current_status;
			current_status = ocn_event.status;

			write_state(
				instance_id,
				{
					pid: process.pid,
					directory,
					project: project_name,
					status: current_status,
					last_transition: new Date().toISOString(),
					session_id: ocn_event.session_id,
				},
				config.state_dir,
			);

			if (previous !== current_status) {
				log.debug("transition", { from: previous, to: current_status });
				await hub.notify(ocn_event);
			}
		},
	};
};

export default OcnPlugin;

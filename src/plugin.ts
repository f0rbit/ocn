import { load_config } from "./config";
import { create_notifier_hub } from "./notify";
import type { ShellFn } from "./notify/macos";
import { create_plugin_adapter } from "./sources/plugin-adapter";
import type { PluginEvent } from "./sources/plugin-adapter";
import { cleanup_stale, derive_state_key, remove_state_by_directory, write_state } from "./state";
import type { OcnStatus } from "./types";
import { create_logger } from "./util/log";

type LegacyPluginInput = {
	directory: string;
	$: ShellFn;
};

export const OcnPlugin = async ({ directory, $ }: LegacyPluginInput) => {
	const config = load_config();
	const log = create_logger();
	const hub = create_notifier_hub(config, $);
	const adapter = create_plugin_adapter();
	const project_name = directory.split("/").pop() ?? "unknown";

	cleanup_stale(config.state_dir, { idle_ttl_ms: config.idle_ttl_ms });

	process.on("exit", () => {
		remove_state_by_directory(directory, config.state_dir);
	});

	log.info("initialized", { project: project_name, pid: process.pid });

	let current_status: OcnStatus = "idle";

	return {
		event: async ({ event }: { event: PluginEvent }) => {
			const typed = event;

			if (typed.type === "server.instance.disposed") {
				remove_state_by_directory(directory, config.state_dir);
				log.info("disposed, removed state file");
				return;
			}

			const ocn_event = adapter.adapt(typed, {
				directory,
				project_name,
				pid: process.pid,
			});
			if (!ocn_event) return;
			const session_id = ocn_event.session_id;
			if (!session_id) return;

			const previous = current_status;
			current_status = ocn_event.status;

			write_state(
				{
					id: derive_state_key(directory, session_id),
					pid: process.pid,
					directory,
					project: project_name,
					status: current_status,
					last_transition: new Date().toISOString(),
					updated_at: new Date().toISOString(),
					session_id,
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

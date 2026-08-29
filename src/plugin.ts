import { Plugin } from "@opencode-ai/plugin";
import { load_config } from "./config";
import type { OcnConfig } from "./config";
import { create_notifier_hub } from "./notify";
import { create_v2_adapter } from "./sources/plugin-adapter";
import { parse_v2_event, v2_event_directory } from "./sources/v2-event";
import { cleanup_stale, create_file_state_repository, derive_state_key, remove_state_by_directory } from "./state";
import type { StateRepository } from "./state-repository";
import type { InstanceState, OcnEvent, OcnStatus } from "./types";
import { create_logger } from "./util/log";

export type EventHandlerDependencies = {
	repo: StateRepository;
	notify: (event: OcnEvent) => Promise<void>;
	config: OcnConfig;
	directory: string;
	canonical: string;
	pid: number;
	now?: () => Date;
};

export type EventHandler = {
	handle: (raw: unknown) => Promise<void>;
};

type Transition = {
	status: OcnStatus;
	last_transition: string;
};

export function create_event_handler(deps: EventHandlerDependencies): EventHandler {
	const adapter = create_v2_adapter();
	const transitions = new Map<string, Transition>();
	const log = create_logger();
	const now = deps.now ?? (() => new Date());

	return {
		async handle(raw) {
			try {
				const event = parse_v2_event(raw);
				if (!event || !is_location_allowed(v2_event_directory(event, deps.directory), deps.directory, deps.canonical))
					return;

				const record_directory = v2_event_directory(event, deps.directory);
				const adapter_context = {
					fallback_directory: deps.directory,
					pid: deps.pid,
				};
				if (event.type === "session.deleted") {
					adapter.adapt(event, adapter_context);
					const session_key = derive_state_key(record_directory, event.data.sessionID);
					deps.repo.remove(session_key);
					transitions.delete(session_key);
					return;
				}

				const ocn_event = adapter.adapt(event, adapter_context);
				if (!ocn_event || !ocn_event.session_id) return;

				const transition_time = now().toISOString();
				const session_key = derive_state_key(ocn_event.directory, ocn_event.session_id);
				const previous = transitions.get(session_key) ?? {
					status: "idle",
					last_transition: transition_time,
				};
				const state: InstanceState = {
					id: derive_state_key(ocn_event.directory, ocn_event.session_id),
					pid: ocn_event.pid,
					directory: ocn_event.directory,
					project: ocn_event.project,
					status: ocn_event.status,
					last_transition: previous.status === ocn_event.status ? previous.last_transition : transition_time,
					updated_at: transition_time,
					session_id: ocn_event.session_id,
				};
				if (ocn_event.error_message !== undefined) state.error_message = ocn_event.error_message;
				if (ocn_event.permission_title !== undefined) state.permission_title = ocn_event.permission_title;
				if (ocn_event.question_title !== undefined) state.question_title = ocn_event.question_title;

				deps.repo.save(state);
				transitions.set(session_key, {
					status: ocn_event.status,
					last_transition: state.last_transition,
				});

				if (previous.status === ocn_event.status) return;
				try {
					await deps.notify(ocn_event);
				} catch {
					log.error("notification failed", { session_id: ocn_event.session_id });
				}
			} catch {
				log.error("event handling failed");
			}
		},
	};
}

function is_location_allowed(directory: string | undefined, configured: string, canonical: string): boolean {
	if (!directory) return true;
	return directory === configured || directory === canonical || directory.startsWith(`${canonical}/`);
}

type SetupContext = Parameters<Plugin.Plugin["setup"]>[0];

export const ocn_plugin = Plugin.define({
	id: "ocn",
	setup(ctx: SetupContext) {
		const config = load_config();
		const log = create_logger();
		const hub = create_notifier_hub(config);
		const repo = create_file_state_repository(config.state_dir);
		cleanup_stale(config.state_dir, { idle_ttl_ms: config.idle_ttl_ms });
		const controller = new AbortController();
		const handle = create_event_handler({
			repo,
			notify: hub.notify,
			config,
			directory: ctx.location.directory,
			canonical: ctx.location.project.canonical,
			pid: process.pid,
		});

		const event_loop = (async () => {
			try {
				for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
					if (controller.signal.aborted) return;
					await handle.handle(event);
				}
			} catch {
				if (!controller.signal.aborted) log.error("event stream failed");
			}
		})();

		log.info("initialized", { project: ctx.location.project.directory, pid: process.pid });
		return async () => {
			controller.abort();
			await event_loop;
			// Subpath-owned records are cleaned up by their owner or by the idle TTL.
			remove_state_by_directory(ctx.location.directory, config.state_dir);
		};
	},
});

export default ocn_plugin;

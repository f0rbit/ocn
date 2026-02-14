import type { OcnEvent } from "../types";

export type PluginContext = {
	directory: string;
	project_name: string;
	pid: number;
};

// The opencode plugin event type - we use a loose shape here to avoid
// tight coupling to the SDK's internal Event union type
export type PluginEvent = {
	type: string;
	properties: Record<string, unknown>;
};

export type PluginAdapter = {
	adapt: (event: PluginEvent, ctx: PluginContext) => OcnEvent | null;
};

function str(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function obj(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function adapt_event(event: PluginEvent, ctx: PluginContext): OcnEvent | null {
	const p = event.properties;
	const base = {
		source: "plugin" as const,
		directory: ctx.directory,
		project: ctx.project_name,
		pid: ctx.pid,
		timestamp: new Date().toISOString(),
	};

	switch (event.type) {
		case "session.idle":
			return {
				...base,
				status: "idle",
				session_id: str(p.sessionID),
			};

		case "session.error":
			return {
				...base,
				status: "error",
				session_id: str(p.sessionID),
				error_message: str(obj(p.error)?.message),
			};

		case "permission.updated":
			return {
				...base,
				status: "prompting",
				session_id: str(p.sessionID),
				permission_title: str(p.title),
			};

		case "permission.replied":
			return {
				...base,
				status: "busy",
				session_id: str(p.sessionID),
			};

		case "session.status": {
			const status_type = str(obj(p.status)?.type);
			if (status_type === "busy") {
				return { ...base, status: "busy", session_id: str(p.sessionID) };
			}
			if (status_type === "idle") {
				return { ...base, status: "idle", session_id: str(p.sessionID) };
			}
			// "retry" maps to busy (still working)
			if (status_type === "retry") {
				return { ...base, status: "busy", session_id: str(p.sessionID) };
			}
			return null;
		}

		default:
			return null;
	}
}

export function create_plugin_adapter(): PluginAdapter {
	const child_sessions = new Set<string>();

	return {
		adapt(event, ctx) {
			if (event.type === "session.created") {
				const info = obj(event.properties.info);
				if (info && str(info.parentID)) {
					const id = str(info.id);
					if (id) child_sessions.add(id);
				}
				return null;
			}

			const ocn_event = adapt_event(event, ctx);
			if (!ocn_event) return null;

			if (ocn_event.session_id && child_sessions.has(ocn_event.session_id)) {
				ocn_event.is_subtask = true;
			}

			return ocn_event;
		},
	};
}

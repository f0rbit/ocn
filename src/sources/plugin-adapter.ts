import type { OcnEvent } from "../types";

type PluginContext = {
	directory: string;
	project_name: string;
	pid: number;
};

// The opencode plugin event type - we use a loose shape here to avoid
// tight coupling to the SDK's internal Event union type
type PluginEvent = {
	type: string;
	properties: Record<string, unknown>;
};

function str(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function obj(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

export function adapt_plugin_event(event: PluginEvent, ctx: PluginContext): OcnEvent | null {
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

import { basename } from "node:path";
import type { OcnEvent } from "../types";
import { v2_event_directory } from "./v2-event";
import type { ParsedV2Event } from "./v2-event";

export type AdapterContext = {
	fallback_directory: string;
	pid: number;
};

export type V2Adapter = {
	adapt: (event: ParsedV2Event, ctx: AdapterContext) => OcnEvent | null;
};

function create_base(event: ParsedV2Event, ctx: AdapterContext): Omit<OcnEvent, "status"> {
	const directory = v2_event_directory(event, ctx.fallback_directory);
	return {
		source: "plugin",
		directory,
		project: basename(directory),
		pid: ctx.pid,
		timestamp: new Date().toISOString(),
	};
}

type SessionEvent = Exclude<ParsedV2Event, { type: "session.created" | "session.deleted" | "form.created" }>;

function create_adapter_event(event: SessionEvent, ctx: AdapterContext, status: OcnEvent["status"]): OcnEvent {
	return {
		...create_base(event, ctx),
		status,
		session_id: event.data.sessionID,
	};
}

export function create_v2_adapter(): V2Adapter {
	const child_sessions = new Set<string>();

	return {
		adapt(event, ctx) {
			const directory = v2_event_directory(event, ctx.fallback_directory);
			const session_key = (session_id: string) => `${directory}\u0000${session_id}`;
			if (event.type === "session.created") {
				if (event.data.parentID) child_sessions.add(session_key(event.data.sessionID));
				return null;
			}

			if (event.type === "session.deleted") {
				child_sessions.delete(session_key(event.data.sessionID));
				return null;
			}

			const ocn_event = map_event(event, ctx);
			if (!ocn_event) return null;
			if (ocn_event.session_id && child_sessions.has(session_key(ocn_event.session_id))) ocn_event.is_subtask = true;
			return ocn_event;
		},
	};

	function map_event(
		event: Exclude<ParsedV2Event, { type: "session.created" | "session.deleted" }>,
		ctx: AdapterContext,
	): OcnEvent | null {
		switch (event.type) {
			case "session.idle":
			case "session.execution.succeeded":
			case "session.execution.interrupted":
				return create_adapter_event(event, ctx, "idle");
			case "session.execution.started":
			case "session.retry.scheduled":
			case "permission.replied":
			case "form.replied":
			case "form.cancelled":
				return create_adapter_event(event, ctx, "busy");
			case "session.status":
				return create_adapter_event(event, ctx, event.data.status.type === "idle" ? "idle" : "busy");
			case "session.execution.failed":
				return {
					...create_adapter_event(event, ctx, "error"),
					error_message: event.data.error.message,
				};
			case "permission.asked":
				return {
					...create_adapter_event(event, ctx, "prompting"),
					permission_title: event.data.action,
				};
			case "form.created":
				return {
					...create_base(event, ctx),
					status: "prompting",
					session_id: event.data.form.sessionID,
					question_title: event.data.form.title,
				};
			default:
				return null;
		}
	}
}

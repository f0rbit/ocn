import type { Plugin } from "@opencode-ai/plugin";
import { z } from "zod";

export type SetupContext = Parameters<Plugin.Plugin["setup"]>[0];
type PkgV2Event = ReturnType<SetupContext["event"]["subscribe"]> extends AsyncIterable<infer T> ? T : never;

const location = z.object({
	directory: z.string(),
	workspaceID: z.string().optional(),
});

const envelope = {
	location: location.optional(),
};

const session_created = z.object({
	type: z.literal("session.created"),
	data: z.object({
		sessionID: z.string(),
		parentID: z.string().optional(),
		location: location.optional(),
	}),
	...envelope,
});

const session_deleted = z.object({
	type: z.literal("session.deleted"),
	data: z.object({ sessionID: z.string() }),
	...envelope,
});

const session_idle = z.object({
	type: z.literal("session.idle"),
	data: z.object({ sessionID: z.string() }),
	...envelope,
});

const session_execution_succeeded = z.object({
	type: z.literal("session.execution.succeeded"),
	data: z.object({ sessionID: z.string() }),
	...envelope,
});

const session_execution_interrupted = z.object({
	type: z.literal("session.execution.interrupted"),
	data: z.object({ sessionID: z.string() }),
	...envelope,
});

const session_execution_started = z.object({
	type: z.literal("session.execution.started"),
	data: z.object({ sessionID: z.string() }),
	...envelope,
});

const session_retry_scheduled = z.object({
	type: z.literal("session.retry.scheduled"),
	data: z.object({ sessionID: z.string() }),
	...envelope,
});

const session_status = z.object({
	type: z.literal("session.status"),
	data: z.object({
		sessionID: z.string(),
		status: z.discriminatedUnion("type", [
			z.object({ type: z.literal("idle") }),
			z.object({ type: z.literal("busy") }),
			z.object({
				type: z.literal("retry"),
				attempt: z.number().optional(),
				message: z.string().optional(),
				next: z.number().optional(),
			}),
		]),
	}),
	...envelope,
});

const session_execution_failed = z.object({
	type: z.literal("session.execution.failed"),
	data: z.object({
		sessionID: z.string(),
		error: z.object({
			message: z.string(),
		}),
	}),
	...envelope,
});

const permission_asked = z.object({
	type: z.literal("permission.asked"),
	data: z.object({
		sessionID: z.string(),
		action: z.string(),
	}),
	...envelope,
});

const permission_replied = z.object({
	type: z.literal("permission.replied"),
	data: z.object({ sessionID: z.string() }),
	...envelope,
});

const form_created = z.object({
	type: z.literal("form.created"),
	data: z.object({
		form: z.object({
			sessionID: z.string(),
			title: z.string(),
		}),
	}),
	...envelope,
});

const form_replied = z.object({
	type: z.literal("form.replied"),
	data: z.object({ sessionID: z.string() }),
	...envelope,
});

const form_cancelled = z.object({
	type: z.literal("form.cancelled"),
	data: z.object({ sessionID: z.string() }),
	...envelope,
});

export const V2EventSchema = z.discriminatedUnion("type", [
	session_created,
	session_deleted,
	session_idle,
	session_execution_succeeded,
	session_execution_interrupted,
	session_execution_started,
	session_retry_scheduled,
	session_status,
	session_execution_failed,
	permission_asked,
	permission_replied,
	form_created,
	form_replied,
	form_cancelled,
]);

export type ParsedV2Event = z.infer<typeof V2EventSchema>;

export function v2_event_directory(event: ParsedV2Event, fallback_directory: string): string {
	if (event.type === "session.created") {
		return event.location?.directory ?? event.data.location?.directory ?? fallback_directory;
	}
	return event.location?.directory ?? fallback_directory;
}

type PkgSessionCreated = Extract<PkgV2Event, { type: "session.created" }>;
const _session_created_drift: (event: PkgSessionCreated) => z.infer<typeof session_created> = (event) => event;
type PkgSessionDeleted = Extract<PkgV2Event, { type: "session.deleted" }>;
const _session_deleted_drift: (event: PkgSessionDeleted) => z.infer<typeof session_deleted> = (event) => event;
type PkgSessionIdle = Extract<PkgV2Event, { type: "session.idle" }>;
const _session_idle_drift: (event: PkgSessionIdle) => z.infer<typeof session_idle> = (event) => event;
type PkgExecutionSucceeded = Extract<PkgV2Event, { type: "session.execution.succeeded" }>;
const _execution_succeeded_drift: (event: PkgExecutionSucceeded) => z.infer<typeof session_execution_succeeded> = (
	event,
) => event;
type PkgExecutionInterrupted = Extract<PkgV2Event, { type: "session.execution.interrupted" }>;
const _execution_interrupted_drift: (event: PkgExecutionInterrupted) => z.infer<typeof session_execution_interrupted> =
	(event) => event;
type PkgExecutionStarted = Extract<PkgV2Event, { type: "session.execution.started" }>;
const _execution_started_drift: (event: PkgExecutionStarted) => z.infer<typeof session_execution_started> = (event) =>
	event;
type PkgRetryScheduled = Extract<PkgV2Event, { type: "session.retry.scheduled" }>;
const _retry_scheduled_drift: (event: PkgRetryScheduled) => z.infer<typeof session_retry_scheduled> = (event) => event;
type PkgSessionStatus = Extract<PkgV2Event, { type: "session.status" }>;
const _session_status_drift: (event: PkgSessionStatus) => z.infer<typeof session_status> = (event) => event;
type PkgExecutionFailed = Extract<PkgV2Event, { type: "session.execution.failed" }>;
const _execution_failed_drift: (event: PkgExecutionFailed) => z.infer<typeof session_execution_failed> = (event) =>
	event;
type PkgPermissionAsked = Extract<PkgV2Event, { type: "permission.asked" }>;
const _permission_asked_drift: (event: PkgPermissionAsked) => z.infer<typeof permission_asked> = (event) => event;
type PkgPermissionReplied = Extract<PkgV2Event, { type: "permission.replied" }>;
const _permission_replied_drift: (event: PkgPermissionReplied) => z.infer<typeof permission_replied> = (event) => event;
type PkgFormCreated = Extract<PkgV2Event, { type: "form.created" }>;
const _form_created_drift: (event: PkgFormCreated) => z.infer<typeof form_created> = (event) => event;
type PkgFormReplied = Extract<PkgV2Event, { type: "form.replied" }>;
const _form_replied_drift: (event: PkgFormReplied) => z.infer<typeof form_replied> = (event) => event;
type PkgFormCancelled = Extract<PkgV2Event, { type: "form.cancelled" }>;
const _form_cancelled_drift: (event: PkgFormCancelled) => z.infer<typeof form_cancelled> = (event) => event;

export function parse_v2_event(raw: unknown): ParsedV2Event | null {
	const parsed = V2EventSchema.safeParse(raw);
	return parsed.success ? parsed.data : null;
}

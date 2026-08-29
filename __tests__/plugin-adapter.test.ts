import { describe, expect, it } from "bun:test";
import { create_v2_adapter } from "../src/sources/plugin-adapter";
import { parse_v2_event } from "../src/sources/v2-event";
import type { ParsedV2Event } from "../src/sources/v2-event";

const context = {
	fallback_directory: "/Users/tom/dev/test",
	pid: 1234,
};

function parse(raw: unknown): ParsedV2Event {
	const event = parse_v2_event(raw);
	if (!event) throw new Error("fixture did not parse");
	return event;
}

function adapt(raw: unknown) {
	return create_v2_adapter().adapt(parse(raw), context);
}

describe("V2 plugin adapter", () => {
	it("maps idle events", () => {
		const result = adapt({ type: "session.idle", data: { sessionID: "ses_1" } });
		expect(result?.status).toBe("idle");
		expect(result?.session_id).toBe("ses_1");
	});

	it("maps execution success and interruption to idle", () => {
		expect(adapt({ type: "session.execution.succeeded", data: { sessionID: "ses_1" } })?.status).toBe("idle");
		expect(adapt({ type: "session.execution.interrupted", data: { sessionID: "ses_1" } })?.status).toBe("idle");
	});

	it("maps execution start, retry, and replies to busy", () => {
		expect(adapt({ type: "session.execution.started", data: { sessionID: "ses_1" } })?.status).toBe("busy");
		expect(adapt({ type: "session.retry.scheduled", data: { sessionID: "ses_1" } })?.status).toBe("busy");
		expect(
			adapt({ type: "permission.replied", data: { sessionID: "ses_1", requestID: "perm_1", reply: "once" } })?.status,
		).toBe("busy");
		expect(adapt({ type: "form.replied", data: { id: "form_1", sessionID: "ses_1", answer: {} } })?.status).toBe(
			"busy",
		);
		expect(adapt({ type: "form.cancelled", data: { id: "form_1", sessionID: "ses_1" } })?.status).toBe("busy");
	});

	it("maps session status variants", () => {
		expect(adapt({ type: "session.status", data: { sessionID: "ses_1", status: { type: "idle" } } })?.status).toBe(
			"idle",
		);
		expect(adapt({ type: "session.status", data: { sessionID: "ses_1", status: { type: "busy" } } })?.status).toBe(
			"busy",
		);
		expect(
			adapt({
				type: "session.status",
				data: { sessionID: "ses_1", status: { type: "retry", attempt: 1, message: "retrying", next: 1000 } },
			})?.status,
		).toBe("busy");
	});

	it("maps failures with their message", () => {
		const result = adapt({
			type: "session.execution.failed",
			data: { sessionID: "ses_1", error: { type: "unknown", message: "boom" } },
		});
		expect(result?.status).toBe("error");
		expect(result?.error_message).toBe("boom");
	});

	it("maps permission and form prompts", () => {
		const permission = adapt({
			type: "permission.asked",
			data: { id: "perm_1", sessionID: "ses_1", action: "Run command", resources: [] },
		});
		expect(permission?.status).toBe("prompting");
		expect(permission?.permission_title).toBe("Run command");

		const form = adapt({
			type: "form.created",
			data: { form: { id: "form_1", sessionID: "ses_1", title: "Choose target", fields: [] } },
		});
		expect(form?.status).toBe("prompting");
		expect(form?.question_title).toBe("Choose target");
	});

	it("uses event location and falls back to the configured directory", () => {
		const located = adapt({
			type: "session.idle",
			location: { directory: "/Users/tom/dev/other", workspaceID: "ws_1" },
			data: { sessionID: "ses_1" },
		});
		expect(located?.directory).toBe("/Users/tom/dev/other");
		expect(located?.project).toBe("other");
		expect(adapt({ type: "session.idle", data: { sessionID: "ses_2" } })?.directory).toBe(context.fallback_directory);
	});

	it("registers child sessions and marks every child event as a subtask", () => {
		const adapter = create_v2_adapter();
		const created = parse({ type: "session.created", data: { sessionID: "child", parentID: "parent" } });
		expect(adapter.adapt(created, context)).toBeNull();
		const idle = adapter.adapt(parse({ type: "session.idle", data: { sessionID: "child" } }), context);
		const prompt = adapter.adapt(
			parse({ type: "permission.asked", data: { id: "perm_1", sessionID: "child", action: "Run command" } }),
			context,
		);
		expect(idle?.is_subtask).toBe(true);
		expect(prompt?.is_subtask).toBe(true);
	});

	it("scopes child sessions to their location and forgets deleted children", () => {
		const adapter = create_v2_adapter();
		adapter.adapt(
			parse({
				type: "session.created",
				location: { directory: "/repo/project/worktree" },
				data: { sessionID: "child", parentID: "parent" },
			}),
			context,
		);
		expect(
			adapter.adapt(parse({ type: "session.idle", data: { sessionID: "child" } }), context)?.is_subtask,
		).toBeUndefined();
		const child_event = adapter.adapt(
			parse({
				type: "session.idle",
				location: { directory: "/repo/project/worktree" },
				data: { sessionID: "child" },
			}),
			context,
		);
		expect(child_event?.is_subtask).toBe(true);
		adapter.adapt(
			parse({
				type: "session.deleted",
				location: { directory: "/repo/project/worktree" },
				data: { sessionID: "child" },
			}),
			context,
		);
		expect(
			adapter.adapt(
				parse({
					type: "session.idle",
					location: { directory: "/repo/project/worktree" },
					data: { sessionID: "child" },
				}),
				context,
			)?.is_subtask,
		).toBeUndefined();
	});

	it("does not adapt lifecycle-only events or unknown events", () => {
		expect(adapt({ type: "session.created", data: { sessionID: "ses_1" } })).toBeNull();
		expect(adapt({ type: "session.deleted", data: { sessionID: "ses_1" } })).toBeNull();
		expect(parse_v2_event({ type: "config.updated", data: {} })).toBeNull();
	});
});

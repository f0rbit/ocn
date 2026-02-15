import { describe, expect, it } from "bun:test";
import { create_plugin_adapter } from "../src/sources/plugin-adapter";

const ctx = {
	directory: "/Users/tom/dev/test",
	project_name: "test",
	pid: 1234,
};

describe("create_plugin_adapter", () => {
	it("maps session.idle to idle status", () => {
		const adapter = create_plugin_adapter();
		const result = adapter.adapt({ type: "session.idle", properties: { sessionID: "ses_1" } }, ctx);
		expect(result).not.toBeNull();
		expect(result?.status).toBe("idle");
		expect(result?.session_id).toBe("ses_1");
		expect(result?.source).toBe("plugin");
		expect(result?.project).toBe("test");
	});

	it("maps session.error to error status", () => {
		const adapter = create_plugin_adapter();
		const result = adapter.adapt(
			{
				type: "session.error",
				properties: {
					sessionID: "ses_1",
					error: { message: "boom" },
				},
			},
			ctx,
		);
		expect(result).not.toBeNull();
		expect(result?.status).toBe("error");
		expect(result?.error_message).toBe("boom");
	});

	it("maps permission.updated to prompting status", () => {
		const adapter = create_plugin_adapter();
		const result = adapter.adapt(
			{
				type: "permission.updated",
				properties: {
					sessionID: "ses_1",
					title: "Run bash command?",
					id: "perm_1",
				},
			},
			ctx,
		);
		expect(result).not.toBeNull();
		expect(result?.status).toBe("prompting");
		expect(result?.permission_title).toBe("Run bash command?");
	});

	it("maps permission.replied to busy status", () => {
		const adapter = create_plugin_adapter();
		const result = adapter.adapt(
			{
				type: "permission.replied",
				properties: {
					sessionID: "ses_1",
					permissionID: "perm_1",
					response: "allow",
				},
			},
			ctx,
		);
		expect(result).not.toBeNull();
		expect(result?.status).toBe("busy");
	});

	it("maps session.status busy to busy", () => {
		const adapter = create_plugin_adapter();
		const result = adapter.adapt(
			{
				type: "session.status",
				properties: { sessionID: "ses_1", status: { type: "busy" } },
			},
			ctx,
		);
		expect(result).not.toBeNull();
		expect(result?.status).toBe("busy");
	});

	it("maps session.status idle to idle", () => {
		const adapter = create_plugin_adapter();
		const result = adapter.adapt(
			{
				type: "session.status",
				properties: { sessionID: "ses_1", status: { type: "idle" } },
			},
			ctx,
		);
		expect(result).not.toBeNull();
		expect(result?.status).toBe("idle");
	});

	it("maps session.status retry to busy", () => {
		const adapter = create_plugin_adapter();
		const result = adapter.adapt(
			{
				type: "session.status",
				properties: { sessionID: "ses_1", status: { type: "retry" } },
			},
			ctx,
		);
		expect(result).not.toBeNull();
		expect(result?.status).toBe("busy");
	});

	it("returns null for unknown event types", () => {
		const adapter = create_plugin_adapter();
		expect(adapter.adapt({ type: "config.updated", properties: {} }, ctx)).toBeNull();
	});

	it("returns null for session.status with unknown status type", () => {
		const adapter = create_plugin_adapter();
		expect(
			adapter.adapt(
				{
					type: "session.status",
					properties: { sessionID: "ses_1", status: { type: "unknown" } },
				},
				ctx,
			),
		).toBeNull();
	});

	it("maps question.asked to prompting status with question title", () => {
		const adapter = create_plugin_adapter();
		const result = adapter.adapt(
			{
				type: "question.asked",
				properties: {
					id: "q_1",
					sessionID: "ses_1",
					questions: [{ header: "Select target", question: "Which deployment target?" }],
				},
			},
			ctx,
		);
		expect(result).not.toBeNull();
		expect(result?.status).toBe("prompting");
		expect(result?.session_id).toBe("ses_1");
		expect(result?.question_title).toBe("Select target");
	});

	it("maps question.asked with no questions array to prompting with no title", () => {
		const adapter = create_plugin_adapter();
		const result = adapter.adapt(
			{
				type: "question.asked",
				properties: {
					id: "q_2",
					sessionID: "ses_1",
					questions: [],
				},
			},
			ctx,
		);
		expect(result).not.toBeNull();
		expect(result?.status).toBe("prompting");
		expect(result?.question_title).toBeUndefined();
	});

	it("maps question.replied to busy status", () => {
		const adapter = create_plugin_adapter();
		const result = adapter.adapt(
			{
				type: "question.replied",
				properties: {
					sessionID: "ses_1",
					requestID: "q_1",
					answers: [["option1"]],
				},
			},
			ctx,
		);
		expect(result).not.toBeNull();
		expect(result?.status).toBe("busy");
	});

	it("maps question.rejected to busy status", () => {
		const adapter = create_plugin_adapter();
		const result = adapter.adapt(
			{
				type: "question.rejected",
				properties: {
					sessionID: "ses_1",
					requestID: "q_1",
				},
			},
			ctx,
		);
		expect(result).not.toBeNull();
		expect(result?.status).toBe("busy");
	});

	it("maps permission.asked to prompting status (v2 compat)", () => {
		const adapter = create_plugin_adapter();
		const result = adapter.adapt(
			{
				type: "permission.asked",
				properties: {
					id: "perm_1",
					sessionID: "ses_1",
					permission: "bash",
					patterns: ["*"],
				},
			},
			ctx,
		);
		expect(result).not.toBeNull();
		expect(result?.status).toBe("prompting");
		expect(result?.permission_title).toBe("bash");
	});

	it("permission.asked prefers title over permission field", () => {
		const adapter = create_plugin_adapter();
		const result = adapter.adapt(
			{
				type: "permission.asked",
				properties: {
					id: "perm_1",
					sessionID: "ses_1",
					title: "Run bash command?",
					permission: "bash",
				},
			},
			ctx,
		);
		expect(result).not.toBeNull();
		expect(result?.permission_title).toBe("Run bash command?");
	});

	it("extracts error message from nested data.message path", () => {
		const adapter = create_plugin_adapter();
		const result = adapter.adapt(
			{
				type: "session.error",
				properties: {
					sessionID: "ses_1",
					error: { name: "UnknownError", data: { message: "rate limited" } },
				},
			},
			ctx,
		);
		expect(result).not.toBeNull();
		expect(result?.status).toBe("error");
		expect(result?.error_message).toBe("rate limited");
	});

	it("prefers top-level error.message over nested data.message", () => {
		const adapter = create_plugin_adapter();
		const result = adapter.adapt(
			{
				type: "session.error",
				properties: {
					sessionID: "ses_1",
					error: { message: "top level", data: { message: "nested" } },
				},
			},
			ctx,
		);
		expect(result).not.toBeNull();
		expect(result?.error_message).toBe("top level");
	});

	it("includes correct metadata in all events", () => {
		const adapter = create_plugin_adapter();
		const result = adapter.adapt({ type: "session.idle", properties: { sessionID: "ses_1" } }, ctx);
		expect(result?.directory).toBe("/Users/tom/dev/test");
		expect(result?.pid).toBe(1234);
		expect(result?.timestamp).toBeDefined();
	});
});

describe("session hierarchy tracking", () => {
	it("session.created returns null", () => {
		const adapter = create_plugin_adapter();
		const result = adapter.adapt(
			{
				type: "session.created",
				properties: { info: { id: "ses_child", parentID: "ses_parent" } },
			},
			ctx,
		);
		expect(result).toBeNull();
	});

	it("session.created with parentID registers child — subsequent idle has is_subtask true", () => {
		const adapter = create_plugin_adapter();
		adapter.adapt(
			{
				type: "session.created",
				properties: { info: { id: "ses_child", parentID: "ses_parent" } },
			},
			ctx,
		);

		const result = adapter.adapt({ type: "session.idle", properties: { sessionID: "ses_child" } }, ctx);
		expect(result).not.toBeNull();
		expect(result?.is_subtask).toBe(true);
	});

	it("session.idle for a non-child session does NOT have is_subtask", () => {
		const adapter = create_plugin_adapter();
		const result = adapter.adapt({ type: "session.idle", properties: { sessionID: "ses_top" } }, ctx);
		expect(result).not.toBeNull();
		expect(result?.is_subtask).toBeUndefined();
	});

	it("session.created without parentID does NOT register as child", () => {
		const adapter = create_plugin_adapter();
		adapter.adapt(
			{
				type: "session.created",
				properties: { info: { id: "ses_top" } },
			},
			ctx,
		);

		const result = adapter.adapt({ type: "session.idle", properties: { sessionID: "ses_top" } }, ctx);
		expect(result).not.toBeNull();
		expect(result?.is_subtask).toBeUndefined();
	});

	it("question.asked for a registered child session has is_subtask true", () => {
		const adapter = create_plugin_adapter();
		adapter.adapt(
			{
				type: "session.created",
				properties: { info: { id: "ses_child", parentID: "ses_parent" } },
			},
			ctx,
		);

		const result = adapter.adapt(
			{
				type: "question.asked",
				properties: {
					id: "q_1",
					sessionID: "ses_child",
					questions: [{ header: "Pick one", question: "Which option?" }],
				},
			},
			ctx,
		);
		expect(result).not.toBeNull();
		expect(result?.is_subtask).toBe(true);
		expect(result?.status).toBe("prompting");
	});

	it("multiple event types for a registered child all get is_subtask true", () => {
		const adapter = create_plugin_adapter();
		adapter.adapt(
			{
				type: "session.created",
				properties: { info: { id: "ses_child", parentID: "ses_parent" } },
			},
			ctx,
		);

		const idle = adapter.adapt({ type: "session.idle", properties: { sessionID: "ses_child" } }, ctx);
		expect(idle?.is_subtask).toBe(true);

		const error = adapter.adapt(
			{
				type: "session.error",
				properties: { sessionID: "ses_child", error: { message: "fail" } },
			},
			ctx,
		);
		expect(error?.is_subtask).toBe(true);

		const busy = adapter.adapt(
			{
				type: "session.status",
				properties: { sessionID: "ses_child", status: { type: "busy" } },
			},
			ctx,
		);
		expect(busy?.is_subtask).toBe(true);
	});
});

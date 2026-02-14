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

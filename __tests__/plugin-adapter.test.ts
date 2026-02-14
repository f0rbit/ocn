import { describe, expect, it } from "bun:test";
import { adapt_plugin_event } from "../src/sources/plugin-adapter";

const ctx = {
	directory: "/Users/tom/dev/test",
	project_name: "test",
	pid: 1234,
};

describe("adapt_plugin_event", () => {
	it("maps session.idle to idle status", () => {
		const result = adapt_plugin_event({ type: "session.idle", properties: { sessionID: "ses_1" } }, ctx);
		expect(result).not.toBeNull();
		expect(result?.status).toBe("idle");
		expect(result?.session_id).toBe("ses_1");
		expect(result?.source).toBe("plugin");
		expect(result?.project).toBe("test");
	});

	it("maps session.error to error status", () => {
		const result = adapt_plugin_event(
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
		const result = adapt_plugin_event(
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
		const result = adapt_plugin_event(
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
		const result = adapt_plugin_event(
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
		const result = adapt_plugin_event(
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
		const result = adapt_plugin_event(
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
		expect(adapt_plugin_event({ type: "config.updated", properties: {} }, ctx)).toBeNull();
	});

	it("returns null for session.status with unknown status type", () => {
		expect(
			adapt_plugin_event(
				{
					type: "session.status",
					properties: { sessionID: "ses_1", status: { type: "unknown" } },
				},
				ctx,
			),
		).toBeNull();
	});

	it("includes correct metadata in all events", () => {
		const result = adapt_plugin_event({ type: "session.idle", properties: { sessionID: "ses_1" } }, ctx);
		expect(result?.directory).toBe("/Users/tom/dev/test");
		expect(result?.pid).toBe(1234);
		expect(result?.timestamp).toBeDefined();
	});
});

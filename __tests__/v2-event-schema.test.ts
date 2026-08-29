import { describe, expect, it } from "bun:test";
import { parse_v2_event } from "../src/sources/v2-event";

describe("V2 event schema", () => {
	it("parses consumed fields and strips extras", () => {
		const result = parse_v2_event({
			type: "session.execution.failed",
			id: "evt_1",
			created: Date.now(),
			data: { sessionID: "ses_1", error: { type: "error", message: "failed", extra: true }, extra: true },
			extra: true,
		});
		expect(result).toEqual({
			type: "session.execution.failed",
			data: { sessionID: "ses_1", error: { message: "failed" } },
		});
	});

	it("rejects missing data or session IDs", () => {
		expect(parse_v2_event({ type: "session.idle", data: {} })).toBeNull();
		expect(parse_v2_event({ type: "session.idle" })).toBeNull();
	});

	it("rejects unknown event types", () => {
		expect(parse_v2_event({ type: "future.event", data: { sessionID: "ses_1" } })).toBeNull();
	});

	it("keeps an absent location optional", () => {
		const result = parse_v2_event({ type: "session.idle", data: { sessionID: "ses_1" } });
		expect(result?.location).toBeUndefined();
	});

	it("accepts the SDK retry payload", () => {
		const result = parse_v2_event({
			type: "session.status",
			data: {
				sessionID: "ses_1",
				status: { type: "retry", attempt: 1, message: "retrying", next: 1000 },
			},
		});
		expect(result?.type).toBe("session.status");
		if (result?.type === "session.status") expect(result.data.status.type).toBe("retry");
	});
});

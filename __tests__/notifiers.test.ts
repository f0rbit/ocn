import { describe, expect, it } from "bun:test";
import { create_bell_notifier } from "../src/notify/bell";
import type { NotificationEvent, Notifier } from "../src/notify/types";

// A fake notifier that records calls for assertion
function create_fake_notifier(name = "fake"): Notifier & { calls: NotificationEvent[] } {
	const calls: NotificationEvent[] = [];
	return {
		name,
		calls,
		notify: async (event: NotificationEvent) => {
			calls.push(event);
		},
	};
}

const make_event = (overrides?: Partial<NotificationEvent>): NotificationEvent => ({
	type: "idle",
	project: "test",
	directory: "/Users/tom/dev/test",
	message: "Session completed",
	timestamp: new Date().toISOString(),
	...overrides,
});

describe("FakeNotifier", () => {
	it("records notification calls", async () => {
		const notifier = create_fake_notifier();
		const event = make_event();
		await notifier.notify(event);
		expect(notifier.calls).toHaveLength(1);
		expect(notifier.calls[0]).toEqual(event);
	});

	it("records multiple calls", async () => {
		const notifier = create_fake_notifier();
		await notifier.notify(make_event({ type: "idle" }));
		await notifier.notify(make_event({ type: "error" }));
		await notifier.notify(make_event({ type: "prompting" }));
		expect(notifier.calls).toHaveLength(3);
		expect(notifier.calls.map((c) => c.type)).toEqual(["idle", "error", "prompting"]);
	});
});

describe("bell notifier", () => {
	it("has correct name", () => {
		const notifier = create_bell_notifier();
		expect(notifier.name).toBe("bell");
	});

	it("does not throw on notify", async () => {
		const notifier = create_bell_notifier();
		// We can't easily test stdout output, but we can verify it doesn't throw
		await notifier.notify(make_event());
	});
});

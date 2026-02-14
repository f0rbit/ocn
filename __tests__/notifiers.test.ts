import { describe, expect, it } from "bun:test";
import type { OcnConfig } from "../src/config";
import { create_bell_notifier } from "../src/notify/bell";
import { create_notifier_hub } from "../src/notify/index";
import type { NotificationEvent, Notifier } from "../src/notify/types";
import type { OcnEvent } from "../src/types";

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

const make_ocn_event = (overrides?: Partial<OcnEvent>): OcnEvent => ({
	source: "plugin",
	status: "idle",
	directory: "/Users/tom/dev/test",
	project: "test",
	pid: 1234,
	timestamp: new Date().toISOString(),
	...overrides,
});

const make_hub_config = (overrides?: Partial<OcnConfig>): OcnConfig => ({
	notify: {
		macos: { enabled: false, on_idle: true, on_prompt: true, on_error: true },
		bell: { enabled: false },
		tmux_pane: { enabled: false },
	},
	debounce_ms: 0,
	state_dir: "/tmp/ocn-test",
	theme: "plain",
	...overrides,
});

describe("notifier hub debounce", () => {
	it("suppresses rapid events within debounce window", async () => {
		const fake = create_fake_notifier();
		const hub = create_notifier_hub(make_hub_config({ debounce_ms: 5000 }), undefined, [fake]);

		await hub.notify(make_ocn_event({ status: "idle" }));
		await hub.notify(make_ocn_event({ status: "idle" }));
		await hub.notify(make_ocn_event({ status: "error" }));

		expect(fake.calls).toHaveLength(1);
		expect(fake.calls[0].type).toBe("idle");
	});

	it("always allows the first event through", async () => {
		const fake = create_fake_notifier();
		const hub = create_notifier_hub(make_hub_config({ debounce_ms: 60000 }), undefined, [fake]);

		await hub.notify(make_ocn_event({ status: "error" }));

		expect(fake.calls).toHaveLength(1);
		expect(fake.calls[0].type).toBe("error");
	});

	it("does not debounce when debounce_ms is 0", async () => {
		const fake = create_fake_notifier();
		const hub = create_notifier_hub(make_hub_config({ debounce_ms: 0 }), undefined, [fake]);

		await hub.notify(make_ocn_event({ status: "idle" }));
		await hub.notify(make_ocn_event({ status: "error" }));
		await hub.notify(make_ocn_event({ status: "prompting" }));

		expect(fake.calls).toHaveLength(3);
	});
});

describe("notifier hub config gating", () => {
	it("on_idle: false suppresses idle notifications", async () => {
		const fake = create_fake_notifier();
		const config = make_hub_config({
			notify: {
				macos: { enabled: false, on_idle: false, on_prompt: true, on_error: true },
				bell: { enabled: false },
				tmux_pane: { enabled: false },
			},
		});
		const hub = create_notifier_hub(config, undefined, [fake]);

		await hub.notify(make_ocn_event({ status: "idle" }));

		expect(fake.calls).toHaveLength(0);
	});

	it("on_prompt: false suppresses prompting notifications", async () => {
		const fake = create_fake_notifier();
		const config = make_hub_config({
			notify: {
				macos: { enabled: false, on_idle: true, on_prompt: false, on_error: true },
				bell: { enabled: false },
				tmux_pane: { enabled: false },
			},
		});
		const hub = create_notifier_hub(config, undefined, [fake]);

		await hub.notify(make_ocn_event({ status: "prompting" }));

		expect(fake.calls).toHaveLength(0);
	});

	it("on_error: false suppresses error notifications", async () => {
		const fake = create_fake_notifier();
		const config = make_hub_config({
			notify: {
				macos: { enabled: false, on_idle: true, on_prompt: true, on_error: false },
				bell: { enabled: false },
				tmux_pane: { enabled: false },
			},
		});
		const hub = create_notifier_hub(config, undefined, [fake]);

		await hub.notify(make_ocn_event({ status: "error" }));

		expect(fake.calls).toHaveLength(0);
	});

	it("gated event does not affect debounce timer", async () => {
		const fake = create_fake_notifier();
		const config = make_hub_config({
			debounce_ms: 5000,
			notify: {
				macos: { enabled: false, on_idle: false, on_prompt: true, on_error: true },
				bell: { enabled: false },
				tmux_pane: { enabled: false },
			},
		});
		const hub = create_notifier_hub(config, undefined, [fake]);

		await hub.notify(make_ocn_event({ status: "idle" }));
		await hub.notify(make_ocn_event({ status: "error" }));

		expect(fake.calls).toHaveLength(1);
		expect(fake.calls[0].type).toBe("error");
	});
});

describe("notifier hub subtask filtering", () => {
	it("does not notify when is_subtask is true", async () => {
		const fake = create_fake_notifier();
		const hub = create_notifier_hub(make_hub_config(), undefined, [fake]);

		await hub.notify(make_ocn_event({ status: "idle", is_subtask: true }));
		await hub.notify(make_ocn_event({ status: "error", is_subtask: true }));
		await hub.notify(make_ocn_event({ status: "prompting", is_subtask: true }));

		expect(fake.calls).toHaveLength(0);
	});

	it("does notify when is_subtask is false", async () => {
		const fake = create_fake_notifier();
		const hub = create_notifier_hub(make_hub_config(), undefined, [fake]);

		await hub.notify(make_ocn_event({ status: "idle", is_subtask: false }));

		expect(fake.calls).toHaveLength(1);
		expect(fake.calls[0].type).toBe("idle");
	});

	it("does notify when is_subtask is undefined", async () => {
		const fake = create_fake_notifier();
		const hub = create_notifier_hub(make_hub_config(), undefined, [fake]);

		await hub.notify(make_ocn_event({ status: "idle" }));

		expect(fake.calls).toHaveLength(1);
	});

	it("still filters busy events", async () => {
		const fake = create_fake_notifier();
		const hub = create_notifier_hub(make_hub_config(), undefined, [fake]);

		await hub.notify(make_ocn_event({ status: "busy" }));

		expect(fake.calls).toHaveLength(0);
	});

	it("subtask filter applies before notifier dispatch for all statuses", async () => {
		const fake = create_fake_notifier();
		const hub = create_notifier_hub(make_hub_config(), undefined, [fake]);

		await hub.notify(make_ocn_event({ status: "idle", is_subtask: true }));
		await hub.notify(make_ocn_event({ status: "prompting", is_subtask: true }));
		await hub.notify(make_ocn_event({ status: "error", is_subtask: true }));

		expect(fake.calls).toHaveLength(0);

		// Non-subtask events do go through
		await hub.notify(make_ocn_event({ status: "error" }));
		expect(fake.calls).toHaveLength(1);
		expect(fake.calls[0].type).toBe("error");
	});
});

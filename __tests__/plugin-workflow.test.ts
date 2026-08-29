import { describe, expect, it } from "bun:test";
import type { OcnConfig } from "../src/config";
import { create_notifier_hub } from "../src/notify";
import type { NotificationEvent, Notifier } from "../src/notify/types";
import { create_event_handler } from "../src/plugin";
import { derive_state_key } from "../src/state";
import { InMemoryStateRepository } from "../src/state-repository";

const directory = "/repo/project";
const config: OcnConfig = {
	notify: {
		macos: { enabled: false, on_idle: true, on_prompt: true, on_error: true },
		bell: { enabled: false },
		tmux_pane: { enabled: false },
	},
	debounce_ms: 0,
	idle_ttl_ms: 1_800_000,
	state_dir: "/unused",
	theme: "plain",
};

function create_fake_notifier(): Notifier & { calls: NotificationEvent[] } {
	const calls: NotificationEvent[] = [];
	return {
		name: "fake",
		calls,
		notify: async (event) => {
			calls.push(event);
		},
	};
}

function event(type: string, data: unknown, location = directory): unknown {
	return { type, data, location: { directory: location } };
}

function create_workflow() {
	const repo = new InMemoryStateRepository();
	const fake = create_fake_notifier();
	const hub = create_notifier_hub(config, undefined, [fake]);
	let clock = new Date("2026-01-01T00:00:00.000Z");
	const handler = create_event_handler({
		repo,
		notify: hub.notify,
		config,
		directory,
		canonical: directory,
		pid: 99,
		now: () => clock,
	});
	return {
		repo,
		fake,
		handler,
		advance: (value: string) => {
			clock = new Date(value);
		},
	};
}

describe("V2 plugin workflow", () => {
	it("tracks interleaved sessions independently and notifies real transitions", async () => {
		const workflow = create_workflow();
		await workflow.handler.handle(event("session.execution.started", { sessionID: "a" }));
		await workflow.handler.handle(event("permission.asked", { id: "perm", sessionID: "b", action: "Run command" }));
		await workflow.handler.handle(event("session.idle", { sessionID: "a" }));
		await workflow.handler.handle(event("session.execution.started", { sessionID: "b" }));

		expect(workflow.repo.list()).toHaveLength(2);
		expect(workflow.repo.list().find((state) => state.session_id === "a")?.status).toBe("idle");
		expect(workflow.repo.list().find((state) => state.session_id === "b")?.status).toBe("busy");
		expect(workflow.fake.calls.map((call) => call.type)).toEqual(["prompting", "idle"]);
	});

	it("refreshes updated_at without changing last_transition for same-status events", async () => {
		const workflow = create_workflow();
		await workflow.handler.handle(event("session.idle", { sessionID: "a" }));
		const first = workflow.repo.list()[0];
		workflow.advance("2026-01-01T00:01:00.000Z");
		await workflow.handler.handle(event("session.idle", { sessionID: "a" }));
		const second = workflow.repo.list()[0];

		expect(second.updated_at).not.toBe(first.updated_at);
		expect(second.last_transition).toBe(first.last_transition);
		expect(workflow.fake.calls).toHaveLength(0);
	});

	it("preserves prompt details and maps replies to busy", async () => {
		const workflow = create_workflow();
		await workflow.handler.handle(event("permission.asked", { id: "perm", sessionID: "a", action: "Run command" }));
		let state = workflow.repo.list()[0];
		expect(state.status).toBe("prompting");
		expect(state.permission_title).toBe("Run command");
		await workflow.handler.handle(event("permission.replied", { sessionID: "a", requestID: "perm", reply: "once" }));
		await workflow.handler.handle(
			event("form.created", { form: { id: "form", sessionID: "a", title: "Choose target" } }),
		);
		state = workflow.repo.list()[0];
		expect(state.status).toBe("prompting");
		expect(state.question_title).toBe("Choose target");
		await workflow.handler.handle(event("form.replied", { id: "form", sessionID: "a", answer: {} }));
		expect(workflow.repo.list()[0].status).toBe("busy");
	});

	it("records errors, removes deleted sessions, and starts fresh afterward", async () => {
		const workflow = create_workflow();
		await workflow.handler.handle(
			event("session.execution.failed", { sessionID: "a", error: { type: "error", message: "boom" } }),
		);
		expect(workflow.repo.list()[0].error_message).toBe("boom");
		await workflow.handler.handle(event("session.deleted", { sessionID: "a" }));
		expect(workflow.repo.list()).toHaveLength(0);
		workflow.advance("2026-01-01T00:02:00.000Z");
		await workflow.handler.handle(event("session.idle", { sessionID: "a" }));
		expect(workflow.repo.list()[0].status).toBe("idle");
	});

	it("filters other projects and accepts fallback and canonical-prefix locations", async () => {
		const workflow = create_workflow();
		await workflow.handler.handle(event("session.idle", { sessionID: "other" }, "/repo/other"));
		await workflow.handler.handle({ type: "session.idle", data: { sessionID: "fallback" } });
		await workflow.handler.handle(event("session.idle", { sessionID: "subpath" }, "/repo/project/worktree"));

		expect(workflow.repo.list()).toHaveLength(2);
		expect(
			workflow.repo
				.list()
				.map((state) => state.directory)
				.sort(),
		).toEqual([directory, "/repo/project/worktree"].sort());
	});

	it("keeps transitions independent for the same session ID in different locations", async () => {
		const workflow = create_workflow();
		await workflow.handler.handle(event("session.execution.started", { sessionID: "same" }));
		await workflow.handler.handle(event("session.execution.started", { sessionID: "same" }, "/repo/project/worktree"));
		await workflow.handler.handle(event("session.idle", { sessionID: "same" }));

		expect(workflow.repo.list()).toHaveLength(2);
		expect(workflow.repo.list().find((state) => state.directory === directory)?.status).toBe("idle");
		expect(workflow.repo.list().find((state) => state.directory === "/repo/project/worktree")?.status).toBe("busy");
	});

	it("writes child state while the hub suppresses child notifications", async () => {
		const workflow = create_workflow();
		await workflow.handler.handle(event("session.created", { sessionID: "child", parentID: "parent" }));
		await workflow.handler.handle(event("session.execution.started", { sessionID: "child" }));

		expect(workflow.repo.list()).toHaveLength(1);
		expect(workflow.repo.list()[0].id).toBe(derive_state_key(directory, "child"));
		expect(workflow.fake.calls).toHaveLength(0);
		await workflow.handler.handle(event("session.deleted", { sessionID: "child" }));
		await workflow.handler.handle(event("session.execution.started", { sessionID: "child" }));
		await workflow.handler.handle(event("session.idle", { sessionID: "child" }));
		expect(workflow.fake.calls.map((call) => call.type)).toEqual(["idle"]);
	});

	it("ignores malformed payloads without changing state", async () => {
		const workflow = create_workflow();
		await workflow.handler.handle(event("session.idle", { sessionID: "a" }));
		const before = workflow.repo.list();
		await workflow.handler.handle({ type: "session.idle", data: {} });
		expect(workflow.repo.list()).toEqual(before);
	});
});

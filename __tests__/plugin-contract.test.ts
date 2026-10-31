import { describe, expect, it } from "bun:test";
import { Plugin } from "@opencode/plugin";

type SetupContext = Parameters<Plugin.Plugin["setup"]>[0];
type HasEventSubscribe = SetupContext["event"] extends { subscribe: (...args: never[]) => unknown } ? true : false;
type SubscribeAsync = ReturnType<SetupContext["event"]["subscribe"]> extends AsyncIterable<unknown> ? true : false;
type HasLocation = SetupContext extends { location: { directory: string } } ? true : false;

const eventOk: HasEventSubscribe = true;
const subscribeOk: SubscribeAsync = true;
const locationOk: HasLocation = true;

describe("OpenCode2 plugin contract", () => {
	it("exports the V2 define function", () => {
		expect(typeof Plugin.define).toBe("function");

		const plugin = Plugin.define({ id: "ocn.contract-probe", setup: () => {} });
		expect(plugin.id).toBe("ocn.contract-probe");
		expect(typeof plugin.setup).toBe("function");
	});

	it("has the expected V2 setup context", () => {
		expect(eventOk && subscribeOk && locationOk).toBe(true);
	});
});

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create_file_state_repository } from "../src/state";
import { InMemoryStateRepository } from "../src/state-repository";
import type { StateRepository } from "../src/state-repository";
import type { InstanceState } from "../src/types";

const make_state = (id: string, directory: string): InstanceState => ({
	id,
	pid: process.pid,
	directory,
	project: directory.split("/").pop() ?? "unknown",
	status: "busy",
	session_id: `session-${id}`,
	last_transition: "2026-08-29T12:00:00.000Z",
	updated_at: "2026-08-29T12:00:00.000Z",
});

const implementations: Array<[string, (state_dir: string) => StateRepository]> = [
	["filesystem", (state_dir) => create_file_state_repository(state_dir)],
	["memory", () => new InMemoryStateRepository()],
];

for (const [name, create_repository] of implementations) {
	describe(`${name} state repository`, () => {
		let tmp_dir: string;

		beforeEach(() => {
			tmp_dir = mkdtempSync(join(tmpdir(), "ocn-repository-test-"));
		});

		afterEach(() => {
			rmSync(tmp_dir, { recursive: true, force: true });
		});

		it("saves and lists records", () => {
			const repository = create_repository(tmp_dir);
			const state = make_state("one", "/a/project");

			repository.save(state);

			expect(repository.list()).toEqual([state]);
		});

		it("removes one record by id", () => {
			const repository = create_repository(tmp_dir);
			repository.save(make_state("one", "/a/project"));
			repository.save(make_state("two", "/b/project"));

			repository.remove("one");

			expect(repository.list().map((state) => state.id)).toEqual(["two"]);
		});

		it("removes only records in the requested directory", () => {
			const repository = create_repository(tmp_dir);
			repository.save(make_state("one", "/a/project"));
			repository.save(make_state("two", "/a/project"));
			repository.save(make_state("three", "/b/project"));

			repository.remove_by_directory("/a/project");

			expect(repository.list().map((state) => state.id)).toEqual(["three"]);
		});

		it("skips malformed filesystem entries", () => {
			if (name !== "filesystem") return;

			const repository = create_repository(tmp_dir);
			repository.save(make_state("good", "/a/project"));
			writeFileSync(join(tmp_dir, "bad.json"), "not json");

			expect(repository.list()).toEqual([make_state("good", "/a/project")]);
		});
	});
}

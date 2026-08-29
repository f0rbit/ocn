import type { InstanceState } from "./types";

export interface StateRepository {
	save(state: InstanceState): void;
	list(): InstanceState[];
	remove(id: string): void;
	remove_by_directory(directory: string): void;
}

export class InMemoryStateRepository implements StateRepository {
	private readonly states = new Map<string, InstanceState>();

	save(state: InstanceState): void {
		this.states.set(state.id, state);
	}

	list(): InstanceState[] {
		return [...this.states.values()];
	}

	remove(id: string): void {
		this.states.delete(id);
	}

	remove_by_directory(directory: string): void {
		for (const [id, state] of this.states) {
			if (state.directory === directory) this.states.delete(id);
		}
	}
}
